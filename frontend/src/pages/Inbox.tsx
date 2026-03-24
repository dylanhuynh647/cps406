import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

interface AssignmentInvitation {
  id: string
  bug_id: string
  project_id: string
  invited_by: string
  status: 'pending' | 'accepted' | 'declined'
  created_at: string
  responded_at?: string | null
  bug_title?: string
  project_name?: string
  inviter_name?: string | null
  inviter_email?: string | null
}

interface ProjectInvitation {
  id: string
  project_id: string
  invited_by: string
  role: 'admin' | 'developer' | 'reporter'
  status: 'pending' | 'accepted' | 'declined'
  created_at: string
  responded_at?: string | null
  project_name?: string
  inviter_name?: string | null
  inviter_email?: string | null
}

type InboxItem =
  | { kind: 'bug'; value: AssignmentInvitation }
  | { kind: 'project'; value: ProjectInvitation }

const statusOptions: Array<'pending' | 'accepted' | 'declined' | 'all'> = ['pending', 'accepted', 'declined', 'all']

export default function Inbox() {
  const [statusFilter, setStatusFilter] = useState<'pending' | 'accepted' | 'declined' | 'all'>('pending')
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { setCurrentProjectId, refreshProjects } = useAuth()

  const { data: bugInvitations, isLoading: isBugInboxLoading } = useQuery<AssignmentInvitation[]>({
    queryKey: ['invitation-inbox', statusFilter],
    queryFn: async () => {
      const response = await api.get('/bugs/assignment-invitations/inbox', {
        params: { status_filter: statusFilter },
      })
      return Array.isArray(response.data) ? response.data : []
    },
  })

  const { data: projectInvitations, isLoading: isProjectInboxLoading } = useQuery<ProjectInvitation[]>({
    queryKey: ['project-invitation-inbox', statusFilter],
    queryFn: async () => {
      const response = await api.get('/projects/member-invitations/inbox', {
        params: { status_filter: statusFilter },
      })
      return Array.isArray(response.data) ? response.data : []
    },
  })

  const respondBugInvitationMutation = useMutation({
    mutationFn: async ({ invitationId, action }: { invitationId: string; action: 'accept' | 'decline' }) => {
      return api.patch(`/bugs/assignment-invitations/${invitationId}`, null, { params: { action } })
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['invitation-inbox'] })
      queryClient.invalidateQueries({ queryKey: ['bug-assignment-invitations'] })
      queryClient.invalidateQueries({ queryKey: ['bugs'] })
      toast.success(variables.action === 'accept' ? 'Invitation accepted' : 'Invitation declined')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to respond to invitation')
    },
  })

  const respondProjectInvitationMutation = useMutation({
    mutationFn: async ({ invitationId, action }: { invitationId: string; action: 'accept' | 'decline' }) => {
      return api.patch(`/projects/member-invitations/${invitationId}`, null, { params: { action } })
    },
    onSuccess: async (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['project-invitation-inbox'] })
      queryClient.invalidateQueries({ queryKey: ['invitation-inbox'] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      if (variables.action === 'accept') {
        await refreshProjects()
      }
      toast.success(variables.action === 'accept' ? 'Project invitation accepted' : 'Project invitation declined')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to respond to project invitation')
    },
  })

  const allItems: InboxItem[] = [
    ...(bugInvitations || []).map((invitation) => ({ kind: 'bug' as const, value: invitation })),
    ...(projectInvitations || []).map((invitation) => ({ kind: 'project' as const, value: invitation })),
  ].sort((a, b) => new Date(b.value.created_at).getTime() - new Date(a.value.created_at).getTime())

  const isLoading = isBugInboxLoading || isProjectInboxLoading

  const openBugFromInbox = (invitation: AssignmentInvitation) => {
    setCurrentProjectId(invitation.project_id)
    navigate(`/bugs/${invitation.bug_id}`)
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white dark:bg-gray-900 shadow rounded-lg p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Inbox</h1>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as 'pending' | 'accepted' | 'declined' | 'all')}
            className="border border-gray-300 dark:border-gray-600 rounded-md text-sm px-3 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
          >
            {statusOptions.map((option) => (
              <option key={option} value={option}>
                {option.charAt(0).toUpperCase() + option.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <p className="text-sm text-gray-600 dark:text-gray-300">Loading invitations...</p>
        ) : allItems.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No invitations found for this filter.</p>
        ) : (
          <div className="space-y-3">
            {allItems.map((item) => {
              if (item.kind === 'bug') {
                const invitation = item.value
                return (
                  <div key={`bug-${invitation.id}`} className="border border-blue-200 dark:border-blue-700 bg-blue-50/40 dark:bg-blue-900/20 rounded-md p-4">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold tracking-wide text-blue-700 dark:text-blue-300 uppercase">Bug Assignment Invite</p>
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-1">{invitation.bug_title || 'Bug'}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">Project: {invitation.project_name || invitation.project_id}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-300">
                          Invited by: {invitation.inviter_name || invitation.inviter_email || invitation.invited_by}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Received: {new Date(invitation.created_at).toLocaleString()}</p>
                        {invitation.responded_at && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">Responded: {new Date(invitation.responded_at).toLocaleString()}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openBugFromInbox(invitation)}
                          className="text-indigo-600 dark:text-indigo-300 hover:text-indigo-800 dark:hover:text-indigo-200 text-sm"
                        >
                          View bug
                        </button>
                        {invitation.status === 'pending' ? (
                          <>
                            <button
                              type="button"
                              onClick={() => respondBugInvitationMutation.mutate({ invitationId: invitation.id, action: 'accept' })}
                              className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm"
                              disabled={respondBugInvitationMutation.isPending}
                            >
                              Accept
                            </button>
                            <button
                              type="button"
                              onClick={() => respondBugInvitationMutation.mutate({ invitationId: invitation.id, action: 'decline' })}
                              className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm"
                              disabled={respondBugInvitationMutation.isPending}
                            >
                              Decline
                            </button>
                          </>
                        ) : (
                          <span className="text-xs font-medium text-gray-600 dark:text-gray-300 capitalize">{invitation.status}</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              }

              const invitation = item.value
              return (
                <div key={`project-${invitation.id}`} className="border border-emerald-200 dark:border-emerald-700 bg-emerald-50/40 dark:bg-emerald-900/20 rounded-md p-4">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold tracking-wide text-emerald-700 dark:text-emerald-300 uppercase">Project Membership Invite</p>
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-1">{invitation.project_name || invitation.project_id}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">Role offered: {invitation.role}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-300">
                        Invited by: {invitation.inviter_name || invitation.inviter_email || invitation.invited_by}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Received: {new Date(invitation.created_at).toLocaleString()}</p>
                      {invitation.responded_at && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">Responded: {new Date(invitation.responded_at).toLocaleString()}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {invitation.status === 'pending' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => respondProjectInvitationMutation.mutate({ invitationId: invitation.id, action: 'accept' })}
                            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm"
                            disabled={respondProjectInvitationMutation.isPending}
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            onClick={() => respondProjectInvitationMutation.mutate({ invitationId: invitation.id, action: 'decline' })}
                            className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm"
                            disabled={respondProjectInvitationMutation.isPending}
                          >
                            Decline
                          </button>
                        </>
                      ) : (
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-300 capitalize">{invitation.status}</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
