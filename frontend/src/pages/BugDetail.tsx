import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import { useState } from 'react'

const bugSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  bug_type: z.string().min(1, 'Bug type is required'),
  status: z.string().min(1, 'Status is required'),
  assigned_to: z.string().uuid().optional().or(z.literal('')),
  artifact_ids: z.array(z.string().uuid()).optional(),
})

type BugFormData = z.infer<typeof bugSchema>

const bugTypes = ['logic', 'syntax', 'performance', 'documentation', 'ui/ux', 'security', 'data', 'other']
const bugStatuses = ['open', 'in_progress', 'resolved']

const formatBugTypeLabel = (value: string) => {
  if (value.toLowerCase() === 'ui/ux') return 'UI/UX'
  return value.charAt(0).toUpperCase() + value.slice(1)
}

const formatStatusLabel = (value: string) =>
  value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

export default function BugDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const { data: bug, isLoading } = useQuery({
    queryKey: ['bug', id],
    queryFn: async () => {
      const response = await api.get(`/bugs/${id}`)
      return response.data
    },
    enabled: !!id && !isEditing,
  })

  const { data: artifacts } = useQuery({
    queryKey: ['artifacts'],
    queryFn: async () => {
      const response = await api.get('/artifacts')
      return response.data
    },
  })


  const canEdit = profile?.role && ['developer', 'admin'].includes(profile.role)
  const canDelete = profile?.role === 'admin'

  const { data: users } = useQuery({
    queryKey: ['users', 'developers'],
    queryFn: async () => {
      const response = await api.get('/users/developers')
      return response.data
    },
    enabled: !!id,
  })

  const assignedUserName = bug?.assigned_to
    ? users?.find((user: any) => user.id === bug.assigned_to)?.full_name ||
      users?.find((user: any) => user.id === bug.assigned_to)?.email ||
      bug.assigned_to
    : 'Unassigned'

  const reporterName = bug?.reporter_name || bug?.reporter_id || 'Unknown'

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
  } = useForm<BugFormData>({
    resolver: zodResolver(bugSchema),
    values: bug
      ? {
          title: bug.title,
          description: bug.description,
          bug_type: bug.bug_type,
          status: bug.status,
          assigned_to: bug.assigned_to || '',
          artifact_ids: bug.artifacts?.map((a: any) => a.id) || [],
        }
      : undefined,
  })

  const selectedArtifacts = watch('artifact_ids') || []

  const updateMutation = useMutation({
    mutationFn: async (data: BugFormData) => {
      return api.patch(`/bugs/${id}`, {
        ...data,
        assigned_to: data.assigned_to || null,
        artifact_ids: data.artifact_ids?.map(id => id) || [],
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bug', id] })
      queryClient.invalidateQueries({ queryKey: ['bugs'] })
      setIsEditing(false)
      toast.success('Bug updated successfully!')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to update bug')
    },
  })

  const updateStatusMutation = useMutation({
    mutationFn: async (statusValue: string) => {
      return api.patch(`/bugs/${id}`, { status: statusValue })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bug', id] })
      queryClient.invalidateQueries({ queryKey: ['bugs'] })
      toast.success('Bug status updated!')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to update bug status')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return api.delete(`/bugs/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bugs'] })
      toast.success('Bug deleted successfully!')
      navigate('/bugs')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to delete bug')
      setShowDeleteConfirm(false)
    },
  })


  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">Loading bug...</div>
      </div>
    )
  }

  if (!bug) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center text-red-600">Bug not found</div>
      </div>
    )
  }

  const onSubmit = (data: BugFormData) => {
    updateMutation.mutate(data)
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Bug Details</h1>
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
            <p className="text-red-800 mb-4">Are you sure you want to delete this bug?</p>
            <div className="flex space-x-2">
              <button
                onClick={() => deleteMutation.mutate()}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                Confirm Delete
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded-md text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="mb-6 rounded-md bg-gray-50 border border-gray-200 px-4 py-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Reported By</p>
              <p className="mt-1 text-sm text-gray-900">{reporterName}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Assigned To</p>
              <p className="mt-1 text-sm text-gray-900">{assignedUserName}</p>
            </div>
          </div>
        </div>

        {isEditing ? (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">Title</label>
              <input
                {...register('title')}
                type="text"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
              {errors.title && (
                <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Description</label>
              <textarea
                {...register('description')}
                rows={4}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
              {errors.description && (
                <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Bug Type</label>
              <select
                {...register('bug_type')}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              >
                {bugTypes.map((type) => (
                  <option key={type} value={type}>
                    {formatBugTypeLabel(type)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Status</label>
              <select
                {...register('status')}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              >
                {bugStatuses.map((status) => (
                  <option key={status} value={status}>
                    {formatStatusLabel(status)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Assigned To</label>
              <select
                {...register('assigned_to')}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              >
                <option value="">Unassigned</option>
                {users?.map((user: any) => (
                  <option key={user.id} value={user.id}>
                    {user.full_name || user.email}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Associated Artifacts</label>
              <div className="space-y-2 max-h-40 overflow-y-auto border border-gray-300 rounded-md p-2">
                {artifacts?.map((artifact: any) => (
                  <label key={artifact.id} className="flex items-center">
                    <input
                      type="checkbox"
                      value={artifact.id}
                      {...register('artifact_ids')}
                      checked={selectedArtifacts.includes(artifact.id)}
                      className="mr-2"
                    />
                    <span className="text-sm">{artifact.name} ({artifact.type})</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false)
                  reset()
                }}
                className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded-md text-sm font-medium"
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
              <label className="block text-sm font-medium text-gray-700">Title</label>
              <p className="mt-1 text-sm text-gray-900">{bug.title}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Description</label>
              <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">{bug.description}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Bug Type</label>
              <p className="mt-1 text-sm text-gray-900">{formatBugTypeLabel(bug.bug_type)}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Status</label>
              {canEdit ? (
                <select
                  value={bug.status}
                  onChange={(e) => updateStatusMutation.mutate(e.target.value)}
                  disabled={updateStatusMutation.isPending}
                  className="mt-1 block w-full max-w-xs px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm disabled:opacity-50"
                >
                  {bugStatuses.map((status) => (
                    <option key={status} value={status}>
                      {formatStatusLabel(status)}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="mt-1 text-sm text-gray-900">{formatStatusLabel(bug.status)}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Assigned To</label>
              <p className="mt-1 text-sm text-gray-900">{assignedUserName}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Found At</label>
              <p className="mt-1 text-sm text-gray-900">
                {new Date(bug.found_at).toLocaleString()}
              </p>
            </div>
            {bug.fixed_at && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Resolved At</label>
                <p className="mt-1 text-sm text-gray-900">
                  {new Date(bug.fixed_at).toLocaleString()}
                </p>
              </div>
            )}
            {bug.artifacts && bug.artifacts.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Associated Artifacts</label>
                <div className="mt-2 space-y-1">
                  {bug.artifacts.map((artifact: any) => (
                    <a
                      key={artifact.id}
                      href={`/artifacts/${artifact.id}`}
                      className="text-indigo-600 hover:text-indigo-800 text-sm block"
                    >
                      {artifact.name} ({artifact.type})
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
