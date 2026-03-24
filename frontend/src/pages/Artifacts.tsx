import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

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

  const { data: artifacts, isLoading, error } = useQuery<Artifact[]>({
    queryKey: ['artifacts', currentProjectId],
    queryFn: async () => {
      const response = await api.get('/artifacts', { params: { project_id: currentProjectId } })
      return response.data
    },
    enabled: !loading && !!currentProjectId,
  })

  const canCreate = currentProject?.my_role && ['owner', 'admin', 'developer'].includes(currentProject.my_role)

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
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">Loading artifacts...</div>
      </div>
    )
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
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium"
          >
            Create New Artifact
          </button>
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
            {artifacts?.map((artifact) => (
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
        {artifacts?.length === 0 && (
          <div className="text-center py-8 text-gray-500">No artifacts found</div>
        )}
      </div>
    </div>
  )
}
