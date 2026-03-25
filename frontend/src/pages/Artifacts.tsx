import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { LoadingPulse } from '../components/LoadingPulse'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { useEffect, useMemo, useState } from 'react'

interface Artifact {
  id: string
  project_id: string
  name: string
  type: string
  description: string | null
  reference: string
  file_name?: string | null
  file_mime_type?: string | null
  file_size_bytes?: number | null
  is_uploaded_file?: boolean
  created_at: string
  created_by: string
  updated_at: string
}

export default function Artifacts() {
  const { currentProject, currentProjectId, loading } = useAuth()
  const navigate = useNavigate()
  const [filters, setFilters] = useState({
    query: '',
    type: [] as string[],
    created_from: '',
    created_to: '',
  })
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10

  const getCdCommandFromReference = (reference: string) => {
    const trimmed = reference.trim()
    if (/^https?:\/\//i.test(trimmed)) {
      return null
    }
    if (trimmed.startsWith('/')) {
      return `cd .${trimmed}`
    }
    return `cd ./${trimmed}`
  }

  const { data: artifacts, isLoading, error } = useQuery<Artifact[]>({
    queryKey: ['artifacts', currentProjectId],
    queryFn: async () => {
      const response = await api.get('/artifacts', { params: { project_id: currentProjectId } })
      return response.data
    },
    enabled: !loading && !!currentProjectId,
  })

  const canCreate = currentProject?.my_role && ['owner', 'admin', 'developer'].includes(currentProject.my_role)

  const toggleTypeFilter = (value: string) => {
    setCurrentPage(1)
    setFilters((previous) => ({
      ...previous,
      type: previous.type.includes(value)
        ? previous.type.filter((item) => item !== value)
        : [...previous.type, value],
    }))
  }

  const clearFilters = () => {
    setFilters({
      query: '',
      type: [],
      created_from: '',
      created_to: '',
    })
    setCurrentPage(1)
  }

  const filteredArtifacts = useMemo(() => {
    return (artifacts || []).filter((artifact) => {
      if (filters.query.trim()) {
        const search = filters.query.trim().toLowerCase()
        const haystack = [artifact.name, artifact.type, artifact.description || '']
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(search)) {
          return false
        }
      }

      if (filters.type.length > 0 && !filters.type.includes(artifact.type)) {
        return false
      }

      const createdDate = (artifact.created_at || '').slice(0, 10)
      if (filters.created_from && (!createdDate || createdDate < filters.created_from)) {
        return false
      }
      if (filters.created_to && (!createdDate || createdDate > filters.created_to)) {
        return false
      }

      return true
    })
  }, [artifacts, filters])

  const availableTypeOptions = useMemo(
    () => Array.from(new Set((artifacts || []).map((artifact) => artifact.type))).sort((a, b) => a.localeCompare(b)),
    [artifacts]
  )

  const totalPages = Math.max(1, Math.ceil(filteredArtifacts.length / pageSize))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const paginatedArtifacts = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize
    return filteredArtifacts.slice(start, start + pageSize)
  }, [filteredArtifacts, safeCurrentPage])

  useEffect(() => {
    if (currentPage !== safeCurrentPage) {
      setCurrentPage(safeCurrentPage)
    }
  }, [currentPage, safeCurrentPage])

  const downloadUploadedArtifact = async (artifactId: string, fileName?: string | null) => {
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token || !currentProjectId) {
        toast.error('You are not authenticated')
        return
      }

      const response = await fetch(`${api.defaults.baseURL}/artifacts/${artifactId}/download?project_id=${currentProjectId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to download artifact')
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = fileName || 'artifact-file'
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Failed to download file')
    }
  }

  if (!loading && !currentProjectId) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white shadow rounded-lg p-6 text-gray-700">Select a project from the dashboard to view artifacts.</div>
      </div>
    )
  }

  if (loading || isLoading) {
    return <LoadingPulse fullscreen label="Loading artifacts" />
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center text-red-600">Failed to load artifacts</div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Artifacts</h1>
        {canCreate && (
          <button
            onClick={() => navigate('/artifacts/new')}
            className="bg-blue-800 hover:bg-blue-900 text-white px-4 py-2 rounded-md text-sm font-medium"
          >
            Create New Artifact
          </button>
        )}
      </div>

      <div className="bg-white shadow rounded-lg p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="flex-1">
            <input
              type="text"
              value={filters.query}
              onChange={(event) => {
                setCurrentPage(1)
                setFilters((previous) => ({ ...previous, query: event.target.value }))
              }}
              placeholder="Search artifacts by name, type, or description"
              className="block w-full px-3 py-2 border border-gray-300 bg-slate-50 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowAdvancedFilters((previous) => !previous)}
            className="inline-flex justify-center items-center px-3 py-2 border border-blue-900 rounded-md text-sm font-medium text-white bg-blue-800 hover:bg-blue-900 transition-colors"
          >
            {showAdvancedFilters ? 'Hide Filter Options' : 'Show Filter Options'}
          </button>
        </div>

        {showAdvancedFilters && (
          <div className="space-y-5 mt-4 pt-4 border-t border-gray-200">
            <div className="space-y-2">
              <label className="block text-sm font-semibold tracking-wide text-gray-700">Type</label>
              {availableTypeOptions.length > 0 ? (
                <div className="overflow-x-auto pb-1">
                  <div className="inline-flex min-w-max items-center gap-2 pr-2">
                    {availableTypeOptions.map((option) => {
                      const isSelected = filters.type.includes(option)
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => toggleTypeFilter(option)}
                          className={`inline-flex h-8 items-center whitespace-nowrap rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                            isSelected
                              ? 'border-indigo-600 bg-indigo-100 text-indigo-800'
                              : 'border-gray-300 bg-white text-gray-700 hover:border-indigo-300 hover:text-indigo-700'
                          }`}
                        >
                          <span className={`mr-2 h-2.5 w-2.5 rounded-full ${isSelected ? 'bg-indigo-600' : 'bg-gray-300'}`} />
                          <span>{option}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500">No type options available</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Created From</label>
                <input
                  type="date"
                  value={filters.created_from}
                  onChange={(event) => {
                    setCurrentPage(1)
                    setFilters((previous) => ({ ...previous, created_from: event.target.value }))
                  }}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Created To</label>
                <input
                  type="date"
                  value={filters.created_to}
                  onChange={(event) => {
                    setCurrentPage(1)
                    setFilters((previous) => ({ ...previous, created_to: event.target.value }))
                  }}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
              </div>
            </div>

            <div className="flex justify-between items-center">
              <button
                type="button"
                onClick={clearFilters}
                className="text-sm text-indigo-600 hover:text-indigo-800"
              >
                Clear Filters
              </button>
              <span className="text-sm text-gray-600">
                Showing {paginatedArtifacts.length > 0 ? (safeCurrentPage - 1) * pageSize + 1 : 0}
                -
                {(safeCurrentPage - 1) * pageSize + paginatedArtifacts.length} of {filteredArtifacts.length} filtered ({artifacts?.length || 0} total)
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Description
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Reference
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Created At
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {paginatedArtifacts.map((artifact) => (
              <tr key={artifact.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {artifact.name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {artifact.type}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {artifact.description ? (
                    <span className="truncate block max-w-xs">
                      {artifact.description}
                    </span>
                  ) : (
                    <span className="text-gray-400">No description</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {artifact.is_uploaded_file ? (
                    <button
                      onClick={() => downloadUploadedArtifact(artifact.id, artifact.file_name)}
                      className="text-indigo-600 hover:text-indigo-800"
                    >
                      Download file
                    </button>
                  ) : (
                    (() => {
                      const cdCommand = getCdCommandFromReference(artifact.reference)
                      if (!cdCommand) {
                        return (
                          <a
                            href={artifact.reference}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 hover:text-indigo-800"
                          >
                            {artifact.reference.length > 30
                              ? `${artifact.reference.substring(0, 30)}...`
                              : artifact.reference}
                          </a>
                        )
                      }

                      return (
                        <div className="flex items-center gap-2">
                          <code className="inline-block rounded bg-gray-100 px-2 py-1 text-xs text-gray-700">{cdCommand}</code>
                          <button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard.writeText(cdCommand)
                              toast.success('Copied cd command')
                            }}
                            className="text-indigo-600 hover:text-indigo-800 text-xs font-medium"
                          >
                            Copy
                          </button>
                        </div>
                      )
                    })()
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(artifact.created_at).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <button
                    onClick={() => navigate(`/artifacts/${artifact.id}`)}
                    className="text-indigo-600 hover:text-indigo-900 mr-4"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredArtifacts.length === 0 && (
          <div className="text-center py-8 text-gray-500">No artifacts found</div>
        )}

        {filteredArtifacts.length > pageSize && (
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
                    ? 'bg-blue-800 text-white'
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
