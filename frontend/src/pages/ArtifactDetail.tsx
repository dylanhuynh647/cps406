import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { useState } from 'react'

const artifactSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.string().min(1, 'Type is required'),
  description: z.string().optional(),
  reference: z.string().url('Invalid URL').or(z.string().min(1, 'Reference is required')),
})

type ArtifactFormData = z.infer<typeof artifactSchema>

const artifactTypes = [
  'product_backlog',
  'design_document',
  'diagram',
  'formal_spec',
  'source_file',
  'test_source_file',
  'binary',
  'data_file',
  'other',
]

export default function ArtifactDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { currentProject, currentProjectId } = useAuth()
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [replacementFile, setReplacementFile] = useState<File | null>(null)

  const { data: artifact, isLoading } = useQuery({
    queryKey: ['artifact', id, currentProjectId],
    queryFn: async () => {
      const response = await api.get(`/artifacts/${id}`, { params: { project_id: currentProjectId } })
      return response.data
    },
    enabled: !!id && !!currentProjectId && !isEditing,
  })

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ArtifactFormData>({
    resolver: zodResolver(artifactSchema),
    values: artifact
      ? {
          name: artifact.name,
          type: artifact.type,
          description: artifact.description || '',
          reference: artifact.reference,
        }
      : undefined,
  })

  const updateMutation = useMutation({
    mutationFn: async ({ data, file }: { data: ArtifactFormData; file: File | null }) => {
      const updateResponse = await api.patch(`/artifacts/${id}`, data, { params: { project_id: currentProjectId } })
      if (!file || !currentProjectId) {
        return updateResponse
      }

      const formData = new FormData()
      formData.append('project_id', currentProjectId)
      formData.append('file', file)
      return api.post(`/artifacts/${id}/file`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artifact', id, currentProjectId] })
      queryClient.invalidateQueries({ queryKey: ['artifacts', currentProjectId] })
      setIsEditing(false)
      setReplacementFile(null)
      toast.success('Artifact updated successfully!')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to update artifact')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return api.delete(`/artifacts/${id}`, { params: { project_id: currentProjectId } })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artifacts', currentProjectId] })
      toast.success('Artifact deleted successfully!')
      navigate('/artifacts')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to delete artifact')
      setShowDeleteConfirm(false)
    },
  })

  const canEdit = !!currentProject?.my_role && ['owner', 'admin', 'developer'].includes(currentProject.my_role)
  const canDelete = !!currentProject?.my_role && ['owner', 'admin'].includes(currentProject.my_role)

  const downloadUploadedArtifact = async () => {
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token || !currentProjectId || !artifact?.id) {
        toast.error('You are not authenticated')
        return
      }

      const response = await fetch(`${api.defaults.baseURL}/artifacts/${artifact.id}/download?project_id=${currentProjectId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      if (!response.ok) {
        throw new Error('Download failed')
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = artifact.file_name || 'artifact-file'
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Failed to download file')
    }
  }

  const previewUploadedArtifact = async () => {
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token || !currentProjectId || !artifact?.id) {
        toast.error('You are not authenticated')
        return
      }

      const response = await fetch(`${api.defaults.baseURL}/artifacts/${artifact.id}/preview?project_id=${currentProjectId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      if (!response.ok) {
        throw new Error('Preview failed')
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener,noreferrer')
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      toast.error('Preview is not available for this file type')
    }
  }

  if (!currentProjectId) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center text-gray-700">Select a project from the dashboard to view artifact details.</div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">Loading artifact...</div>
      </div>
    )
  }

  if (!artifact) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center text-red-600">Artifact not found</div>
      </div>
    )
  }

  const onSubmit = (data: ArtifactFormData) => {
    updateMutation.mutate({ data, file: replacementFile })
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Artifact Details</h1>
          <div className="flex space-x-2">
            {canEdit && !isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                Edit
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                Delete
              </button>
            )}
          </div>
        </div>

        {showDeleteConfirm && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 mb-4">Are you sure you want to delete this artifact?</p>
            <div className="flex space-x-2">
              <button
                onClick={() => deleteMutation.mutate()}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                Confirm Delete
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="bg-gray-300 hover:bg-gray-400 text-gray-900 border border-gray-400 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white dark:border-gray-500 px-4 py-2 rounded-md text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {isEditing ? (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">Name</label>
              <input
                {...register('name')}
                type="text"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
              {errors.name && (
                <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Type</label>
              <select
                {...register('type')}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              >
                {artifactTypes.map((type) => (
                  <option key={type} value={type}>
                    {type.replace('_', ' ')}
                  </option>
                ))}
              </select>
              {errors.type && (
                <p className="mt-1 text-sm text-red-600">{errors.type.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Description</label>
              <textarea
                {...register('description')}
                rows={4}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Reference</label>
              <input
                {...register('reference')}
                type="text"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
              {errors.reference && (
                <p className="mt-1 text-sm text-red-600">{errors.reference.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Replace uploaded file (optional)</label>
              <input
                type="file"
                onChange={(event) => setReplacementFile(event.target.files?.[0] || null)}
                className="mt-1 block w-full text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                Select a file to replace the current uploaded artifact file.
              </p>
            </div>

            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false)
                  setReplacementFile(null)
                  reset()
                }}
                className="bg-gray-300 hover:bg-gray-400 text-gray-900 border border-gray-400 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white dark:border-gray-500 px-4 py-2 rounded-md text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={updateMutation.isPending}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
              >
                {updateMutation.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Name</label>
              <p className="mt-1 text-sm text-gray-900">{artifact.name}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Type</label>
              <p className="mt-1 text-sm text-gray-900">{artifact.type}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Description</label>
              <p className="mt-1 text-sm text-gray-900">
                {artifact.description || 'No description'}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Reference</label>
              {artifact.is_uploaded_file ? (
                <div className="mt-1 flex gap-3 text-sm">
                  <button
                    type="button"
                    onClick={downloadUploadedArtifact}
                    className="text-indigo-600 hover:text-indigo-800"
                  >
                    Download {artifact.file_name || 'file'}
                  </button>
                  <button
                    type="button"
                    onClick={previewUploadedArtifact}
                    className="text-indigo-600 hover:text-indigo-800"
                  >
                    Preview
                  </button>
                </div>
              ) : (
                <a
                  href={artifact.reference}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 text-sm text-indigo-600 hover:text-indigo-800"
                >
                  {artifact.reference}
                </a>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Created At</label>
              <p className="mt-1 text-sm text-gray-900">
                {new Date(artifact.created_at).toLocaleString()}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
