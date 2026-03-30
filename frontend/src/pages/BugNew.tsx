import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import { LoadingPulse } from '../components/LoadingPulse'

const bugSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  bug_type: z.string().min(1, 'Bug type is required'),
  status: z.string().default('open'),
  severity: z.string().default('medium'),
  assigned_to: z.string().uuid().optional().or(z.literal('')),
  artifact_ids: z.array(z.string().uuid()).optional(),
})

type BugFormData = z.infer<typeof bugSchema>
type CreateBugPayload = BugFormData & { duplicate_of?: string }

type DuplicateCandidate = {
  id: string
  title: string
  status: string
  severity: string
  similarity_score: number
}

const bugTypes = ['logic', 'syntax', 'performance', 'documentation', 'ui/ux', 'security', 'data', 'other']
const bugStatuses = ['open', 'in_progress', 'resolved']
const bugSeverities = ['low', 'medium', 'high', 'critical']

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

export default function BugNew() {
  const navigate = useNavigate()
  const { currentProject, currentProjectId } = useAuth()
  const queryClient = useQueryClient()
  const [pendingSubmission, setPendingSubmission] = useState<BugFormData | null>(null)
  const [duplicateCandidates, setDuplicateCandidates] = useState<DuplicateCandidate[]>([])
  const [showDuplicatePrompt, setShowDuplicatePrompt] = useState(false)
  const [comparisonCandidateId, setComparisonCandidateId] = useState<string | null>(null)
  const actionLockRef = useRef(false)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<BugFormData>({
    resolver: zodResolver(bugSchema),
    defaultValues: {
      status: 'open',
      severity: 'medium',
      artifact_ids: [],
    },
  })

  const { data: artifacts } = useQuery({
    queryKey: ['artifacts', currentProjectId],
    queryFn: async () => {
      const response = await api.get('/artifacts', { params: { project_id: currentProjectId } })
      return response.data
    },
    enabled: !!currentProjectId,
  })

  const { data: users } = useQuery({
    queryKey: ['users', 'developers', currentProjectId],
    queryFn: async () => {
      const response = await api.get('/users/developers', { params: { project_id: currentProjectId } })
      return response.data
    },
    enabled: !!currentProjectId,
  })

  const { data: comparisonBug, isLoading: isComparisonLoading } = useQuery({
    queryKey: ['bug', 'comparison', comparisonCandidateId, currentProjectId],
    queryFn: async () => {
      const response = await api.get(`/bugs/${comparisonCandidateId}`, { params: { project_id: currentProjectId } })
      return response.data
    },
    enabled: !!comparisonCandidateId && !!currentProjectId,
  })

  const createMutation = useMutation({
    mutationFn: async (data: CreateBugPayload) => {
      return api.post('/bugs', {
        ...data,
        project_id: currentProjectId,
        assigned_to: data.assigned_to || null,
        duplicate_of: data.duplicate_of || null,
        artifact_ids: data.artifact_ids?.map(id => id) || [],
      })
    },
    onSuccess: (response, variables) => {
      actionLockRef.current = false
      queryClient.setQueryData(['bug', response.data.id, currentProjectId], response.data)
      queryClient.invalidateQueries({ queryKey: ['bugs', currentProjectId] })
      setPendingSubmission(null)
      setDuplicateCandidates([])
      setShowDuplicatePrompt(false)
      setComparisonCandidateId(null)
      if (variables.assigned_to) {
        toast.success('Bug created and assignment invite sent!')
      } else if (variables.duplicate_of) {
        toast.success('Bug created and linked as a duplicate!')
      } else {
        toast.success('Bug created successfully!')
      }
      navigate(`/bugs/${response.data.id}`)
    },
    onError: (error: any) => {
      actionLockRef.current = false
      toast.error(error.response?.data?.detail || 'Failed to create bug')
    },
  })

  const duplicateCheckMutation = useMutation({
    mutationFn: async (data: BugFormData) => {
      return api.post('/bugs/duplicate-candidates', {
        project_id: currentProjectId,
        title: data.title,
        description: data.description,
        limit: 5,
      })
    },
    onSuccess: (response, variables) => {
      actionLockRef.current = false
      const candidates: DuplicateCandidate[] = response.data?.candidates ?? []
      if (candidates.length > 0) {
        setPendingSubmission(variables)
        setDuplicateCandidates(candidates)
        setShowDuplicatePrompt(true)
        return
      }
      actionLockRef.current = true
      createMutation.mutate(variables)
    },
    onError: () => {
      actionLockRef.current = false
      toast.error('Could not check for duplicate bugs. Please try again.')
    },
  })

  const selectedArtifacts = watch('artifact_ids') || []

  const onSubmit = (data: BugFormData) => {
    if (actionLockRef.current || duplicateCheckMutation.isPending || createMutation.isPending) {
      return
    }
    if (!currentProjectId) {
      toast.error('Select a project first')
      return
    }
    if (currentProject?.my_role === 'reporter' && !data.assigned_to) {
      toast.error('Reporter bugs must include an assignee')
      return
    }
    setShowDuplicatePrompt(false)
    setDuplicateCandidates([])
    setPendingSubmission(null)
    setComparisonCandidateId(null)
    actionLockRef.current = true
    duplicateCheckMutation.mutate(data)
  }

  const createAsDuplicate = (duplicateOfBugId: string) => {
    if (actionLockRef.current || createMutation.isPending || duplicateCheckMutation.isPending) {
      return
    }
    if (!pendingSubmission) {
      return
    }
    actionLockRef.current = true
    createMutation.mutate({
      ...pendingSubmission,
      duplicate_of: duplicateOfBugId,
    })
  }

  const createWithoutDuplicate = () => {
    if (actionLockRef.current || createMutation.isPending || duplicateCheckMutation.isPending) {
      return
    }
    if (!pendingSubmission) {
      return
    }
    actionLockRef.current = true
    createMutation.mutate(pendingSubmission)
  }

  const draftTitle = pendingSubmission?.title || watch('title') || ''
  const draftDescription = pendingSubmission?.description || watch('description') || ''
  const draftStatus = pendingSubmission?.status || watch('status') || 'open'
  const draftSeverity = pendingSubmission?.severity || watch('severity') || 'medium'

  if (!currentProjectId) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white shadow rounded-lg p-6 text-gray-700">Select a project from the dashboard before reporting a bug.</div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {createMutation.isPending && (
        <LoadingPulse fullscreen label="Creating bug" />
      )}
      <div className="bg-white shadow rounded-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Report New Bug</h1>

        {showDuplicatePrompt && (
          <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 p-4">
            <h2 className="text-sm font-semibold text-amber-900">Potential duplicate bugs found</h2>
            <p className="mt-1 text-sm text-amber-800">
              Review these likely matches. Open one to compare it against your draft, or create this bug anyway.
            </p>
            <div className="mt-3 space-y-2">
              {duplicateCandidates.map((candidate) => (
                <div key={candidate.id} className="rounded border border-amber-200 bg-white p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{candidate.title}</p>
                      <p className="text-xs text-gray-600">
                        Similarity: {Math.round(candidate.similarity_score * 100)}% | Status: {formatStatusLabel(candidate.status)} | Severity: {formatSeverityLabel(candidate.severity)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setComparisonCandidateId(candidate.id)}
                      disabled={createMutation.isPending || duplicateCheckMutation.isPending}
                      className="bg-amber-700 hover:bg-amber-800 text-white px-3 py-2 rounded-md text-sm font-medium disabled:opacity-50"
                    >
                      View & Compare
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {comparisonCandidateId && (
              <div className="mt-4 rounded border border-amber-300 bg-white p-4">
                <h3 className="text-sm font-semibold text-gray-900">Bug Comparison</h3>
                {isComparisonLoading ? (
                  <p className="mt-2 text-sm text-gray-600">Loading existing bug details...</p>
                ) : (
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded border border-gray-200 bg-gray-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">New Draft</p>
                      <p className="mt-1 text-sm font-medium text-gray-900">{draftTitle || 'Untitled draft'}</p>
                      <p className="mt-1 text-xs text-gray-600">
                        Status: {formatStatusLabel(draftStatus)} | Severity: {formatSeverityLabel(draftSeverity)}
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{draftDescription || 'No description provided yet.'}</p>
                    </div>
                    <div className="rounded border border-gray-200 bg-gray-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Existing Bug</p>
                      <p className="mt-1 text-sm font-medium text-gray-900">{comparisonBug?.title || 'Unknown bug'}</p>
                      <p className="mt-1 text-xs text-gray-600">
                        Status: {comparisonBug?.status ? formatStatusLabel(comparisonBug.status) : 'Unknown'} | Severity: {comparisonBug?.severity ? formatSeverityLabel(comparisonBug.severity) : 'Unknown'}
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{comparisonBug?.description || 'No description available.'}</p>
                    </div>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => createAsDuplicate(comparisonCandidateId)}
                    disabled={createMutation.isPending || duplicateCheckMutation.isPending || isComparisonLoading}
                    className="bg-amber-700 hover:bg-amber-800 text-white px-3 py-2 rounded-md text-sm font-medium disabled:opacity-50"
                  >
                    {createMutation.isPending ? 'Creating...' : 'Create As Duplicate'}
                  </button>
                  <button
                    type="button"
                    onClick={() => window.open(`/bugs/${comparisonCandidateId}`, '_blank', 'noopener,noreferrer')}
                    className="bg-white hover:bg-gray-100 text-gray-900 border border-gray-300 px-3 py-2 rounded-md text-sm font-medium"
                  >
                    Open Existing Bug
                  </button>
                </div>
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={createWithoutDuplicate}
                disabled={createMutation.isPending || duplicateCheckMutation.isPending}
                className="bg-blue-800 hover:bg-blue-900 text-white px-3 py-2 rounded-md text-sm font-medium disabled:opacity-50"
              >
                {createMutation.isPending ? 'Creating...' : 'Create as New'}
              </button>
              <button
                type="button"
                onClick={() => setShowDuplicatePrompt(false)}
                disabled={createMutation.isPending || duplicateCheckMutation.isPending}
                className="bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 px-3 py-2 rounded-md text-sm font-medium disabled:opacity-50"
              >
                Keep Editing
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700">
              Title *
            </label>
            <input
              {...register('title')}
              type="text"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="Bug title"
            />
            {errors.title && (
              <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700">
              Description *
            </label>
            <textarea
              {...register('description')}
              rows={6}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="Detailed bug description"
            />
            {errors.description && (
              <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="bug_type" className="block text-sm font-medium text-gray-700">
              Bug Type *
            </label>
            <select
              {...register('bug_type')}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            >
              <option value="">Select a type</option>
              {bugTypes.map((type) => (
                <option key={type} value={type}>
                  {formatBugTypeLabel(type)}
                </option>
              ))}
            </select>
            {errors.bug_type && (
              <p className="mt-1 text-sm text-red-600">{errors.bug_type.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="status" className="block text-sm font-medium text-gray-700">
              Status
            </label>
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
            <label htmlFor="severity" className="block text-sm font-medium text-gray-700">
              Severity
            </label>
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

          {users && (
            <div>
              <label htmlFor="assigned_to" className="block text-sm font-medium text-gray-700">
                Assigned To
              </label>
              <select
                {...register('assigned_to')}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              >
                <option value="">Unassigned</option>
                {users.map((user: any) => (
                  <option key={user.id} value={user.id}>
                    {user.full_name || user.email} ({user.project_role})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Associated Artifacts
            </label>
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
              onClick={() => navigate('/bugs')}
              className="bg-gray-300 hover:bg-gray-400 text-gray-900 border border-gray-400 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white dark:border-gray-500 px-4 py-2 rounded-md text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || duplicateCheckMutation.isPending}
              className="bg-blue-800 hover:bg-blue-900 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
            >
              {createMutation.isPending
                ? 'Creating...'
                : duplicateCheckMutation.isPending
                  ? 'Checking duplicates...'
                  : 'Create Bug'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
