import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

interface Bug {
  id: string
  title: string
  description: string
  bug_type: string
  status: string
  severity: string
  found_at: string
  fixed_at: string | null
  reporter_id: string
  reporter_name?: string | null
  assigned_to: string | null
  created_at: string
  updated_at: string
  artifact_count?: number
  artifact_ids?: string[]
  artifacts?: Artifact[]
}

interface Artifact {
  id: string
  name: string
  type: string
}

interface AssignableUser {
  id: string
  full_name?: string | null
  email?: string | null
}

const statusColors: Record<string, string> = {
  open: 'bg-red-100 text-red-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  resolved: 'bg-green-100 text-green-800',
}

const severityColors: Record<string, string> = {
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-blue-100 text-blue-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
}

const formatBugTypeLabel = (value: string) => {
  if (value.toLowerCase() === 'ui/ux') return 'UI/UX'
  return value.charAt(0).toUpperCase() + value.slice(1)
}

const formatStatusLabel = (value: string) =>
  value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

const formatSeverityLabel = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1)

const bugStatuses = ['open', 'in_progress', 'resolved']
const bugTypes = ['logic', 'syntax', 'performance', 'documentation', 'ui/ux', 'security', 'data', 'other']
const bugSeverities = ['low', 'medium', 'high', 'critical']

type FilterState = {
  query: string
  status: string[]
  bug_type: string[]
  severity: string[]
  reporter_ids: string[]
  artifact_ids: string[]
  found_at_from: string
  found_at_to: string
}

type FilterOption = {
  value: string
  label: string
}

const parseListParam = (value: string | null) =>
  value
    ? value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : []

const uniqueByValue = (options: FilterOption[]) => {
  const seen = new Set<string>()
  return options.filter((option) => {
    if (seen.has(option.value)) return false
    seen.add(option.value)
    return true
  })
}

export default function Bugs() {
  const { profile, loading } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()

  // Local filter state from URL params.
  const [filters, setFilters] = useState<FilterState>({
    query: searchParams.get('q') || '',
    status: parseListParam(searchParams.get('status')),
    bug_type: parseListParam(searchParams.get('bug_type')),
    severity: parseListParam(searchParams.get('severity')),
    reporter_ids: parseListParam(searchParams.get('reporter_ids')).length
      ? parseListParam(searchParams.get('reporter_ids'))
      : parseListParam(searchParams.get('reporter_id')),
    artifact_ids: parseListParam(searchParams.get('artifact_ids')),
    found_at_from: searchParams.get('found_at_from') || '',
    found_at_to: searchParams.get('found_at_to') || '',
  })
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10

  const { data: bugs, isLoading, error } = useQuery<Bug[]>({
    queryKey: ['bugs'],
    queryFn: async () => {
      const params = {
        skip: 0,
        limit: 100,
      }

      const response = await api.get('/bugs', { params })
      const bugsList = ((response.data || []) as Bug[]).map((bug) => ({
        ...bug,
        artifact_ids: Array.isArray(bug.artifact_ids) ? bug.artifact_ids : [],
        artifact_count: typeof bug.artifact_count === 'number' ? bug.artifact_count : undefined,
      }))

      const needsDetailEnrichment = bugsList.some(
        (bug) => typeof bug.artifact_count !== 'number' || !Array.isArray(bug.artifact_ids)
      )

      if (!needsDetailEnrichment) {
        return bugsList
      }

      const enriched = await Promise.all(
        bugsList.map(async (bug) => {
          try {
            const detailResponse = await api.get(`/bugs/${bug.id}`)
            const detailBug = detailResponse.data
            const detailArtifactIds: string[] = Array.isArray(detailBug?.artifact_ids)
              ? detailBug.artifact_ids
              : Array.isArray(detailBug?.artifacts)
                ? detailBug.artifacts
                    .map((artifact: any) => artifact?.id)
                    .filter((id: string | undefined) => !!id)
                : bug.artifact_ids || []

            const detailArtifactCount =
              typeof detailBug?.artifact_count === 'number'
                ? detailBug.artifact_count
                : detailArtifactIds.length

            return {
              ...bug,
              artifact_ids: detailArtifactIds,
              artifact_count: detailArtifactCount,
              artifacts: Array.isArray(detailBug?.artifacts) ? detailBug.artifacts : bug.artifacts,
            }
          } catch {
            return {
              ...bug,
              artifact_ids: bug.artifact_ids || [],
              artifact_count: bug.artifact_count ?? (bug.artifact_ids || []).length,
            }
          }
        })
      )

      return enriched
    },
    enabled: !loading,
  })

  const { data: artifacts } = useQuery<Artifact[]>({
    queryKey: ['artifacts'],
    queryFn: async () => {
      const response = await api.get('/artifacts', { params: { skip: 0, limit: 100 } })
      return Array.isArray(response.data) ? response.data : []
    },
    enabled: !loading,
  })

  const { data: assignees } = useQuery<AssignableUser[]>({
    queryKey: ['users', 'developers'],
    queryFn: async () => {
      const response = await api.get('/users/developers')
      return response.data
    },
    enabled: !loading,
  })

  const getAssignedLabel = (assignedTo: string | null) => {
    if (!assignedTo) {
      return 'Unassigned'
    }

    const assignee = assignees?.find((user) => user.id === assignedTo)
    return assignee?.full_name || assignee?.email || assignedTo
  }

  const getReporterLabel = (bug: Bug) => {
    return bug.reporter_name || bug.reporter_id
  }

  const artifactsById = useMemo(() => {
    const map = new Map<string, Artifact>()
    ;(artifacts || []).forEach((artifact) => {
      map.set(artifact.id, artifact)
    })
    return map
  }, [artifacts])

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('bugs-and-links-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bugs',
        },
        () => {
          // Invalidate queries to refetch
          queryClient.invalidateQueries({ queryKey: ['bugs'] })
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bug_artifacts',
        },
        () => {
          // Artifact link changes affect the artifacts count column.
          queryClient.invalidateQueries({ queryKey: ['bugs'] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient])

  const updateFilters = (newFilters: Partial<FilterState>) => {
    const updated = { ...filters, ...newFilters }
    setFilters(updated)
    setCurrentPage(1)
    
    // Update URL params
    const params = new URLSearchParams()
    if (updated.query.trim()) params.set('q', updated.query.trim())
    if (updated.status.length > 0) params.set('status', updated.status.join(','))
    if (updated.bug_type.length > 0) params.set('bug_type', updated.bug_type.join(','))
    if (updated.severity.length > 0) params.set('severity', updated.severity.join(','))
    if (updated.reporter_ids.length > 0) params.set('reporter_ids', updated.reporter_ids.join(','))
    if (updated.artifact_ids.length > 0) params.set('artifact_ids', updated.artifact_ids.join(','))
    if (updated.found_at_from) params.set('found_at_from', updated.found_at_from)
    if (updated.found_at_to) params.set('found_at_to', updated.found_at_to)
    setSearchParams(params)
  }

  const clearFilters = () => {
    setFilters({
      query: '',
      status: [],
      bug_type: [],
      severity: [],
      reporter_ids: [],
      artifact_ids: [],
      found_at_from: '',
      found_at_to: '',
    })
    setSearchParams({})
    setCurrentPage(1)
  }

  const matchesFilters = (bug: Bug, ignoredFilter?: keyof FilterState) => {
    const isIgnored = (key: keyof FilterState) => ignoredFilter === key

    if (!isIgnored('query') && filters.query.trim()) {
      const searchValue = filters.query.trim().toLowerCase()
      const artifactNamesFromMap = (bug.artifact_ids || [])
        .map((artifactId) => artifactsById.get(artifactId)?.name)
        .filter(Boolean)
        .map((name) => name!.toLowerCase())
      const artifactNamesFromDetail = (bug.artifacts || [])
        .map((artifact) => artifact.name)
        .filter(Boolean)
        .map((name) => name.toLowerCase())
      const artifactNames = [...artifactNamesFromMap, ...artifactNamesFromDetail]
      const searchableFields = [
        bug.title,
        bug.description,
        bug.bug_type,
        formatBugTypeLabel(bug.bug_type),
        bug.status,
        formatStatusLabel(bug.status),
        bug.severity,
        formatSeverityLabel(bug.severity),
        getReporterLabel(bug),
      ]
        .filter(Boolean)
        .map((value) => value.toLowerCase())

      const matchesQuery =
        searchableFields.some((value) => value.includes(searchValue)) ||
        artifactNames.some((name) => name.includes(searchValue))

      if (!matchesQuery) {
        return false
      }
    }

    if (!isIgnored('status') && filters.status.length > 0 && !filters.status.includes(bug.status)) {
      return false
    }

    if (!isIgnored('bug_type') && filters.bug_type.length > 0 && !filters.bug_type.includes(bug.bug_type)) {
      return false
    }

    if (!isIgnored('severity') && filters.severity.length > 0 && !filters.severity.includes(bug.severity)) {
      return false
    }

    if (!isIgnored('reporter_ids') && filters.reporter_ids.length > 0 && !filters.reporter_ids.includes(bug.reporter_id)) {
      return false
    }

    if (!isIgnored('artifact_ids') && filters.artifact_ids.length > 0) {
      const bugArtifactIds = bug.artifact_ids || []
      const hasSelectedArtifact = filters.artifact_ids.some((artifactId) => bugArtifactIds.includes(artifactId))
      if (!hasSelectedArtifact) {
        return false
      }
    }

    const foundDate = (bug.found_at || '').slice(0, 10)
    if (!isIgnored('found_at_from') && filters.found_at_from && (!foundDate || foundDate < filters.found_at_from)) {
      return false
    }
    if (!isIgnored('found_at_to') && filters.found_at_to && (!foundDate || foundDate > filters.found_at_to)) {
      return false
    }

    return true
  }

  const filteredBugs = useMemo(
    () => (bugs || []).filter((bug) => matchesFilters(bug)),
    [bugs, filters, artifactsById]
  )

  const totalPages = Math.max(1, Math.ceil(filteredBugs.length / pageSize))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const paginatedBugs = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize
    return filteredBugs.slice(start, start + pageSize)
  }, [filteredBugs, safeCurrentPage])

  useEffect(() => {
    if (currentPage !== safeCurrentPage) {
      setCurrentPage(safeCurrentPage)
    }
  }, [currentPage, safeCurrentPage])

  const getFacetBugs = (filterKey: keyof FilterState) => (bugs || []).filter((bug) => matchesFilters(bug, filterKey))

  const statusOptions = useMemo(
    () =>
      uniqueByValue(
        getFacetBugs('status').map((bug) => ({
          value: bug.status,
          label: formatStatusLabel(bug.status),
        }))
      ).sort((a, b) => a.label.localeCompare(b.label)),
    [bugs, filters]
  )

  const bugTypeOptions = useMemo(
    () =>
      uniqueByValue(
        getFacetBugs('bug_type').map((bug) => ({
          value: bug.bug_type,
          label: formatBugTypeLabel(bug.bug_type),
        }))
      ).sort((a, b) => a.label.localeCompare(b.label)),
    [bugs, filters]
  )

  const severityOptions = useMemo(
    () =>
      uniqueByValue(
        getFacetBugs('severity').map((bug) => ({
          value: bug.severity,
          label: formatSeverityLabel(bug.severity),
        }))
      ).sort((a, b) => a.label.localeCompare(b.label)),
    [bugs, filters]
  )

  const reporterOptions = useMemo(
    () =>
      uniqueByValue(
        getFacetBugs('reporter_ids').map((bug) => ({
          value: bug.reporter_id,
          label: getReporterLabel(bug),
        }))
      ).sort((a, b) => a.label.localeCompare(b.label)),
    [bugs, filters, assignees]
  )

  const artifactOptions = useMemo(
    () =>
      uniqueByValue(
        getFacetBugs('artifact_ids').flatMap((bug) =>
          (bug.artifact_ids || []).map((artifactId) => ({
            value: artifactId,
            label:
              artifactsById.get(artifactId)?.name ||
              bug.artifacts?.find((artifact) => artifact.id === artifactId)?.name ||
              artifactId,
          }))
        )
      ).sort((a, b) => a.label.localeCompare(b.label)),
    [bugs, filters, artifactsById]
  )

  const toggleMultiFilter = (key: 'status' | 'bug_type' | 'severity' | 'reporter_ids' | 'artifact_ids', value: string) => {
    const currentValues = filters[key]
    const nextValues = currentValues.includes(value)
      ? currentValues.filter((item) => item !== value)
      : [...currentValues, value]
    updateFilters({ [key]: nextValues })
  }

  const FilterBubbles = ({
    label,
    options,
    selectedValues,
    onToggle,
    emptyText,
  }: {
    label: string
    options: FilterOption[]
    selectedValues: string[]
    onToggle: (value: string) => void
    emptyText: string
  }) => (
    <div className="space-y-2">
      <label className="block text-sm font-semibold tracking-wide text-gray-700">{label}</label>
      {options.length > 0 ? (
        <div className="overflow-x-auto pb-1">
          <div className="inline-flex min-w-max items-center gap-2 pr-2">
          {options.map((option) => {
            const isSelected = selectedValues.includes(option.value)
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onToggle(option.value)}
                title={option.label}
                className={`inline-flex h-8 max-w-56 items-center whitespace-nowrap rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                  isSelected
                    ? 'border-indigo-600 bg-indigo-100 text-indigo-800'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-indigo-300 hover:text-indigo-700'
                }`}
              >
                <span
                  className={`mr-2 h-2.5 w-2.5 rounded-full ${
                    isSelected ? 'bg-indigo-600' : 'bg-gray-300'
                  }`}
                />
                <span className="truncate">{option.label}</span>
              </button>
            )
          })}
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-500">{emptyText}</p>
      )}
    </div>
  )

  const canCreate = profile?.role && ['reporter', 'developer', 'admin'].includes(profile.role)

  if (loading || isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">Loading bugs...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center text-red-600">Failed to load bugs</div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Bugs</h1>
        {canCreate && (
          <button
            onClick={() => navigate('/bugs/new')}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium"
          >
            Report New Bug
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white shadow rounded-lg p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="flex-1">
            <label className="sr-only" htmlFor="bug-search-input">Search bugs</label>
            <input
              id="bug-search-input"
              type="text"
              value={filters.query}
              onChange={(e) => updateFilters({ query: e.target.value })}
              placeholder="Search bugs by title, description, status, type, severity, reporter, or artifact"
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowAdvancedFilters((prev) => !prev)}
            className="inline-flex justify-center items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            {showAdvancedFilters ? 'Hide Filter Options' : 'Show Filter Options'}
          </button>
        </div>

        {showAdvancedFilters && (
          <div className="space-y-5 mt-4 pt-4 border-t border-gray-200">
          <FilterBubbles
            label="Status"
            options={statusOptions.length > 0 ? statusOptions : bugStatuses.map((value) => ({ value, label: formatStatusLabel(value) }))}
            selectedValues={filters.status}
            onToggle={(value) => toggleMultiFilter('status', value)}
            emptyText="No status options available for the current search"
          />

          <FilterBubbles
            label="Bug Type"
            options={bugTypeOptions.length > 0 ? bugTypeOptions : bugTypes.map((value) => ({ value, label: formatBugTypeLabel(value) }))}
            selectedValues={filters.bug_type}
            onToggle={(value) => toggleMultiFilter('bug_type', value)}
            emptyText="No bug type options available for the current search"
          />

          <FilterBubbles
            label="Severity"
            options={severityOptions.length > 0 ? severityOptions : bugSeverities.map((value) => ({ value, label: formatSeverityLabel(value) }))}
            selectedValues={filters.severity}
            onToggle={(value) => toggleMultiFilter('severity', value)}
            emptyText="No severity options available for the current search"
          />

          <FilterBubbles
            label="Reporter"
            options={reporterOptions}
            selectedValues={filters.reporter_ids}
            onToggle={(value) => toggleMultiFilter('reporter_ids', value)}
            emptyText="No reporter options available for the current search"
          />

          <FilterBubbles
            label="Artifacts"
            options={artifactOptions}
            selectedValues={filters.artifact_ids}
            onToggle={(value) => toggleMultiFilter('artifact_ids', value)}
            emptyText="No artifact options available for the current search"
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Found From</label>
              <input
                type="date"
                value={filters.found_at_from}
                onChange={(e) => updateFilters({ found_at_from: e.target.value })}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Found To</label>
              <input
                type="date"
                value={filters.found_at_to}
                onChange={(e) => updateFilters({ found_at_to: e.target.value })}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
            </div>
          </div>
          </div>
        )}

        <div className="mt-4 flex justify-between items-center">
          <button
            onClick={clearFilters}
            className="text-sm text-indigo-600 hover:text-indigo-800"
          >
            Clear Filters
          </button>
          <span className="text-sm text-gray-600">
            Showing {paginatedBugs.length > 0 ? (safeCurrentPage - 1) * pageSize + 1 : 0}
            -
            {(safeCurrentPage - 1) * pageSize + paginatedBugs.length} of {filteredBugs.length} filtered ({bugs?.length || 0} total)
          </span>
        </div>
      </div>

      {/* Bugs Table */}
      <div className="bg-white shadow rounded-lg overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Title
              </th>
              <th className="w-28 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="w-24 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Severity
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Assigned To
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Found At
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Resolved At
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Artifacts
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {paginatedBugs.map((bug) => (
              <tr key={bug.id} className="hover:bg-gray-50">
                <td className="px-4 py-4">
                  <div className="max-w-[8rem] truncate text-sm font-medium text-gray-900" title={bug.title}>{bug.title}</div>
                  <div className="mt-1 max-w-[7rem] truncate text-xs text-gray-500" title={getReporterLabel(bug)}>
                    Reported by: {getReporterLabel(bug)}
                  </div>
                </td>
                <td className="w-28 px-4 py-4 whitespace-nowrap">
                  <span className={`inline-flex whitespace-nowrap rounded-full px-2 text-xs leading-5 font-semibold ${statusColors[bug.status] || statusColors.open}`}>
                    {formatStatusLabel(bug.status)}
                  </span>
                </td>
                <td className="w-24 px-4 py-4 whitespace-nowrap">
                  <span className={`inline-flex whitespace-nowrap rounded-full px-2 text-xs leading-5 font-semibold ${severityColors[bug.severity] || severityColors.medium}`}>
                    {formatSeverityLabel(bug.severity)}
                  </span>
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                  <span className="inline-block max-w-[10rem] truncate" title={formatBugTypeLabel(bug.bug_type)}>
                    {formatBugTypeLabel(bug.bug_type)}
                  </span>
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                  <span className="inline-block max-w-[7rem] truncate" title={getAssignedLabel(bug.assigned_to)}>
                    {getAssignedLabel(bug.assigned_to)}
                  </span>
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(bug.found_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                  {bug.fixed_at ? new Date(bug.fixed_at).toLocaleDateString() : '-'}
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                  {bug.artifact_count ?? bug.artifact_ids?.length ?? 0}
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                  <button
                    onClick={() => navigate(`/bugs/${bug.id}`)}
                    className="text-indigo-600 hover:text-indigo-900"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredBugs.length === 0 && (
          <div className="text-center py-8 text-gray-500">No bugs found</div>
        )}

        {filteredBugs.length > pageSize && (
          <div className="flex items-center justify-center gap-2 border-t border-gray-200 px-4 py-3">
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={safeCurrentPage === 1}
              className="rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Prev
            </button>
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
              <button
                key={pageNumber}
                type="button"
                onClick={() => setCurrentPage(pageNumber)}
                className={`rounded-md px-3 py-1 text-sm ${
                  pageNumber === safeCurrentPage
                    ? 'bg-indigo-600 text-white'
                    : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {pageNumber}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              disabled={safeCurrentPage === totalPages}
              className="rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
