import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import { useEffect, useState } from 'react'
import { LoadingPulse } from '../components/LoadingPulse'

const bugSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  bug_type: z.string().min(1, 'Bug type is required'),
  status: z.string().min(1, 'Status is required'),
  severity: z.string().min(1, 'Severity is required'),
  assigned_to: z.string().uuid().optional().or(z.literal('')),
  artifact_ids: z.array(z.string().uuid()).optional(),
})

type BugFormData = z.infer<typeof bugSchema>

const bugTypes = ['logic', 'syntax', 'performance', 'documentation', 'ui/ux', 'security', 'data', 'other']
const bugStatuses = ['open', 'in_progress', 'resolved']
const bugSeverities = ['low', 'medium', 'high', 'critical']

interface UserProfileLite {
  id: string
  full_name?: string | null
  email?: string | null
  avatar_url?: string | null
}

interface BugSummary {
  id: string
  title: string
  status: string
  severity: string
  duplicate_of?: string | null
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

export default function BugDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, currentProject, currentProjectId } = useAuth()
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [failedReporterAvatarUrls, setFailedReporterAvatarUrls] = useState<Set<string>>(new Set())

  const { data: bug, isLoading } = useQuery({
    queryKey: ['bug', id, currentProjectId],
    queryFn: async () => {
      const response = await api.get(`/bugs/${id}`, { params: { project_id: currentProjectId } })
      return response.data
    },
    enabled: !!id && !!currentProjectId && !isEditing,
  })

  const { data: artifacts } = useQuery({
    queryKey: ['artifacts', currentProjectId],
    queryFn: async () => {
      const response = await api.get('/artifacts', { params: { project_id: currentProjectId } })
      return response.data
    },
    enabled: !!currentProjectId,
  })


  const canEdit =
    !!currentProject?.my_role &&
    (
      ['owner', 'admin', 'developer'].includes(currentProject.my_role) ||
      (currentProject.my_role === 'reporter' && bug?.reporter_id === user?.id)
    )
  const canDelete = currentProject?.my_role && ['owner', 'admin', 'developer'].includes(currentProject.my_role)
  const canUpdateSeverity = !!currentProject?.my_role

  const { data: users } = useQuery({
    queryKey: ['users', 'developers', currentProjectId],
    queryFn: async () => {
      const response = await api.get('/users/developers', { params: { project_id: currentProjectId } })
      return response.data
    },
    enabled: !!id && !!currentProjectId,
  })

  const { data: userProfiles } = useQuery<UserProfileLite[]>({
    queryKey: ['users', 'profiles', id, currentProjectId],
    queryFn: async () => {
      const response = await api.get('/users/profiles', { params: { project_id: currentProjectId } })
      return Array.isArray(response.data) ? response.data : []
    },
    enabled: !!id && !!currentProjectId,
  })

  const { data: projectBugs } = useQuery<BugSummary[]>({
    queryKey: ['bugs', 'duplicates', currentProjectId],
    queryFn: async () => {
      const response = await api.get('/bugs', {
        params: {
          project_id: currentProjectId,
          include_archived_resolved: true,
          limit: 100,
        },
      })
      return Array.isArray(response.data) ? response.data : []
    },
    enabled: !!currentProjectId,
  })

  const assignedUserName = bug?.assigned_to
    ? users?.find((user: any) => user.id === bug.assigned_to)?.full_name ||
      users?.find((user: any) => user.id === bug.assigned_to)?.email ||
      bug.assigned_to
    : 'Unassigned'
  const assignedUserAvatar = bug?.assigned_to
    ? users?.find((user: any) => user.id === bug.assigned_to)?.avatar_url || null
    : null

  const reporterProfile = bug?.reporter_id
    ? userProfiles?.find((user) => user.id === bug.reporter_id)
    : null
  const reporterFromDeveloperList = bug?.reporter_id
    ? users?.find((user: any) => user.id === bug.reporter_id)
    : null
  const reporterName =
    bug?.reporter_name ||
    reporterProfile?.full_name ||
    reporterProfile?.email ||
    reporterFromDeveloperList?.full_name ||
    reporterFromDeveloperList?.email ||
    bug?.reporter_id ||
    'Unknown'
  const reporterAvatarCandidates = [
    bug?.reporter_avatar_url?.trim() || null,
    reporterProfile?.avatar_url?.trim() || null,
    reporterFromDeveloperList?.avatar_url?.trim() || null,
  ].filter((value): value is string => !!value)
  const reporterAvatar =
    reporterAvatarCandidates.find((url) => !failedReporterAvatarUrls.has(url)) || null

  useEffect(() => {
    setFailedReporterAvatarUrls(new Set())
  }, [bug?.id, bug?.reporter_id, bug?.reporter_avatar_url])

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
          severity: bug.severity,
          assigned_to: bug.assigned_to || '',
          artifact_ids: bug.artifacts?.map((a: any) => a.id) || [],
        }
      : undefined,
  })

  const selectedArtifacts = watch('artifact_ids') || []
  const parentDuplicateBug = bug?.duplicate_of
    ? projectBugs?.find((candidate) => candidate.id === bug.duplicate_of)
    : null
  const childDuplicateBugs = (projectBugs || []).filter(
    (candidate) => candidate.duplicate_of === bug?.id && candidate.id !== bug?.id,
  )
  const hasDuplicateLinks = !!parentDuplicateBug || childDuplicateBugs.length > 0

  const updateMutation = useMutation({
    mutationFn: async (data: BugFormData) => {
      return api.patch(`/bugs/${id}`, {
        ...data,
        assigned_to: data.assigned_to || null,
        artifact_ids: data.artifact_ids?.map(id => id) || [],
      }, {
        params: { project_id: currentProjectId },
      })
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['bug', id, currentProjectId] })
      queryClient.invalidateQueries({ queryKey: ['bugs', currentProjectId] })
      setIsEditing(false)
      if (variables.assigned_to) {
        toast.success('Bug updated and assignment invite sent!')
      } else {
        toast.success('Bug updated successfully!')
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to update bug')
    },
  })

  const updateStatusMutation = useMutation({
    mutationFn: async (statusValue: string) => {
      return api.patch(`/bugs/${id}`, { status: statusValue }, { params: { project_id: currentProjectId } })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bug', id, currentProjectId] })
      queryClient.invalidateQueries({ queryKey: ['bugs', currentProjectId] })
      toast.success('Bug status updated!')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to update bug status')
    },
  })

  const updateSeverityMutation = useMutation({
    mutationFn: async (severityValue: string) => {
      return api.patch(`/bugs/${id}/severity`, { severity: severityValue }, { params: { project_id: currentProjectId } })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bug', id, currentProjectId] })
      queryClient.invalidateQueries({ queryKey: ['bugs', currentProjectId] })
      toast.success('Bug severity updated!')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to update bug severity')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return api.delete(`/bugs/${id}`, { params: { project_id: currentProjectId } })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bugs', currentProjectId] })
      toast.success('Bug deleted successfully!')
      navigate('/bugs')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to delete bug')
      setShowDeleteConfirm(false)
    },
  })


  if (isLoading) {
    return <LoadingPulse fullscreen label="Loading bug" />
  }

  if (!currentProjectId) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center text-gray-700">Select a project from the dashboard to view bug details.</div>
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

  const neutralActionButtonClass = 'bg-gray-400 hover:bg-gray-300 text-gray-900 border border-gray-400 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white dark:border-gray-500 transition-colors duration-150 px-4 py-2 rounded-md text-sm font-medium'

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-between items-start mb-6 gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Bug Details</h1>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className={neutralActionButtonClass}
          >
            Back
          </button>
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
                className={neutralActionButtonClass}
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
              <div className="mt-1 flex items-center gap-2">
                <div className="h-7 w-7 overflow-hidden rounded-full border border-gray-200 bg-gray-100">
                  {reporterAvatar ? (
                    <img
                      src={reporterAvatar}
                      alt={reporterName}
                      loading="lazy"
                      decoding="async"
                      onError={(event) => {
                        const failedUrl = event.currentTarget.currentSrc || event.currentTarget.src
                        if (!failedUrl) {
                          return
                        }

                        setFailedReporterAvatarUrls((previous) => {
                          if (previous.has(failedUrl)) {
                            return previous
                          }
                          const next = new Set(previous)
                          next.add(failedUrl)
                          return next
                        })
                      }}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-gray-500">
                      {reporterName.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <p className="text-sm text-gray-900">{reporterName}</p>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Assigned To</p>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-7 w-7 overflow-hidden rounded-full border border-gray-200 bg-gray-100">
                  {assignedUserAvatar ? (
                    <img src={assignedUserAvatar} alt={assignedUserName} className="h-full w-full object-cover" loading="lazy" decoding="async" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-gray-500">
                      {assignedUserName.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <p className="text-sm text-gray-900">{assignedUserName}</p>
              </div>
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
              <label className="block text-sm font-medium text-gray-700">Severity</label>
              <select
                {...register('severity')}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              >
                {bugSeverities.map((severity) => (
                  <option key={severity} value={severity}>
                    {formatSeverityLabel(severity)}
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
                className={neutralActionButtonClass}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={updateMutation.isPending}
                className="bg-blue-800 hover:bg-blue-900 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
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
              <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{bug.description}</p>
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
              <label className="block text-sm font-medium text-gray-700">Severity</label>
              {canUpdateSeverity ? (
                <select
                  value={bug.severity}
                  onChange={(e) => updateSeverityMutation.mutate(e.target.value)}
                  disabled={updateSeverityMutation.isPending}
                  className="mt-1 block w-full max-w-xs px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm disabled:opacity-50"
                >
                  {bugSeverities.map((severity) => (
                    <option key={severity} value={severity}>
                      {formatSeverityLabel(severity)}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="mt-1 text-sm text-gray-900">{formatSeverityLabel(bug.severity)}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Assigned To</label>
              <p className="mt-1 text-sm text-gray-900">{assignedUserName}</p>
            </div>
            {hasDuplicateLinks && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Linked Bugs</label>
                <div className="mt-2 space-y-2">
                  {parentDuplicateBug && (
                    <button
                      type="button"
                      onClick={() => navigate(`/bugs/${parentDuplicateBug.id}`)}
                      className="w-full rounded border border-amber-200 bg-amber-50 px-3 py-2 text-left hover:bg-amber-100"
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Marked As Duplicate Of</p>
                      <p className="text-sm font-medium text-gray-900">{parentDuplicateBug.title}</p>
                      <p className="text-xs text-gray-600">
                        Status: {formatStatusLabel(parentDuplicateBug.status)} | Severity: {formatSeverityLabel(parentDuplicateBug.severity)}
                      </p>
                    </button>
                  )}
                  {childDuplicateBugs.map((linkedBug) => (
                    <button
                      key={linkedBug.id}
                      type="button"
                      onClick={() => navigate(`/bugs/${linkedBug.id}`)}
                      className="w-full rounded border border-indigo-200 bg-indigo-50 px-3 py-2 text-left hover:bg-indigo-100"
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Duplicate Linked To This Bug</p>
                      <p className="text-sm font-medium text-gray-900">{linkedBug.title}</p>
                      <p className="text-xs text-gray-600">
                        Status: {formatStatusLabel(linkedBug.status)} | Severity: {formatSeverityLabel(linkedBug.severity)}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}
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
            <div className="flex justify-end gap-2 pt-2">
              {canEdit && !isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="bg-blue-800 hover:bg-blue-900 text-white px-4 py-2 rounded-md text-sm font-medium"
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
        )}
      </div>
    </div>
  )
}
