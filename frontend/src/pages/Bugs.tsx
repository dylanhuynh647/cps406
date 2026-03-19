import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface Bug {
  id: string
  title: string
  description: string
  bug_type: string
  status: string
  found_at: string
  fixed_at: string | null
  reporter_id: string
  reporter_name?: string | null
  assigned_to: string | null
  created_at: string
  updated_at: string
  artifacts?: any[]
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

const formatBugTypeLabel = (value: string) => {
  if (value.toLowerCase() === 'ui/ux') return 'UI/UX'
  return value.charAt(0).toUpperCase() + value.slice(1)
}

const formatStatusLabel = (value: string) =>
  value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

export default function Bugs() {
  const { profile, loading } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()

  // Filter state from URL params
  const [filters, setFilters] = useState({
    status: searchParams.get('status')?.split(',') || [],
    bug_type: searchParams.get('bug_type')?.split(',') || [],
    reporter_id: searchParams.get('reporter_id') || '',
    artifact_type: searchParams.get('artifact_type')?.split(',') || [],
    found_at_from: searchParams.get('found_at_from') || '',
    found_at_to: searchParams.get('found_at_to') || '',
  })

  const { data: bugs, isLoading, error } = useQuery<Bug[]>({
    queryKey: ['bugs', filters],
    queryFn: async () => {
      const params: any = {
        skip: 0,
        limit: 100,
      }

      if (filters.status.length > 0) {
        params.status = filters.status
      }
      if (filters.bug_type.length > 0) {
        params.bug_type = filters.bug_type
      }
      if (filters.reporter_id) {
        params.reporter_id = filters.reporter_id
      }
      if (filters.artifact_type.length > 0) {
        params.artifact_type = filters.artifact_type
      }
      if (filters.found_at_from) {
        params.found_at_from = filters.found_at_from
      }
      if (filters.found_at_to) {
        params.found_at_to = filters.found_at_to
      }

      const response = await api.get('/bugs', { params })
      return response.data
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

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('bugs-changes')
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
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient, filters])

  const updateFilters = (newFilters: Partial<typeof filters>) => {
    const updated = { ...filters, ...newFilters }
    setFilters(updated)
    
    // Update URL params
    const params = new URLSearchParams()
    if (updated.status.length > 0) params.set('status', updated.status.join(','))
    if (updated.bug_type.length > 0) params.set('bug_type', updated.bug_type.join(','))
    if (updated.reporter_id) params.set('reporter_id', updated.reporter_id)
    if (updated.artifact_type.length > 0) params.set('artifact_type', updated.artifact_type.join(','))
    if (updated.found_at_from) params.set('found_at_from', updated.found_at_from)
    if (updated.found_at_to) params.set('found_at_to', updated.found_at_to)
    setSearchParams(params)
  }

  const clearFilters = () => {
    setFilters({
      status: [],
      bug_type: [],
      reporter_id: '',
      artifact_type: [],
      found_at_from: '',
      found_at_to: '',
    })
    setSearchParams({})
  }

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
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              multiple
              value={filters.status}
              onChange={(e) => {
                const selected = Array.from(e.target.selectedOptions, option => option.value)
                updateFilters({ status: selected })
              }}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            >
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bug Type</label>
            <select
              multiple
              value={filters.bug_type}
              onChange={(e) => {
                const selected = Array.from(e.target.selectedOptions, option => option.value)
                updateFilters({ bug_type: selected })
              }}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            >
              <option value="logic">Logic</option>
              <option value="syntax">Syntax</option>
              <option value="performance">Performance</option>
              <option value="documentation">Documentation</option>
              <option value="ui/ux">UI/UX</option>
              <option value="security">Security</option>
              <option value="data">Data</option>
              <option value="other">Other</option>
            </select>
          </div>

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

        <div className="mt-4">
          <button
            onClick={clearFilters}
            className="text-sm text-indigo-600 hover:text-indigo-800"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Bugs Table */}
      <div className="bg-white shadow rounded-lg overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Title
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Assigned To
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Found At
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Resolved At
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Artifacts
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {bugs?.map((bug) => (
              <tr key={bug.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{bug.title}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    Reported by: {getReporterLabel(bug)}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusColors[bug.status] || statusColors.open}`}>
                    {formatStatusLabel(bug.status)}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatBugTypeLabel(bug.bug_type)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {getAssignedLabel(bug.assigned_to)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(bug.found_at).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {bug.fixed_at ? new Date(bug.fixed_at).toLocaleDateString() : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {bug.artifacts?.length || 0}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
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
        {bugs?.length === 0 && (
          <div className="text-center py-8 text-gray-500">No bugs found</div>
        )}
      </div>
    </div>
  )
}
