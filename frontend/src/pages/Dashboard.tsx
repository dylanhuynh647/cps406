import { useAuth } from '../contexts/AuthContext'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { LoadingPulse } from '../components/LoadingPulse'

type ProjectMember = {
  user_id: string
  role: 'owner' | 'admin' | 'developer' | 'reporter'
  email?: string | null
  full_name?: string | null
  avatar_url?: string | null
  created_at: string
  updated_at: string
}

type UserSearchResult = {
  id: string
  email?: string | null
  full_name?: string | null
  avatar_url?: string | null
  is_member: boolean
  has_pending_invitation?: boolean
}

type ProjectPhase = {
  id: string
  project_id: string
  phase_number: number
  started_at: string
  ended_at: string | null
  transition_type: 'initial' | 'manual' | 'auto'
}

const projectRoles: Array<'admin' | 'developer' | 'reporter'> = ['admin', 'developer', 'reporter']
const formatMemberDate = (value?: string) => {
  if (!value) {
    return '-'
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return '-'
  }
  return parsed.toLocaleDateString()
}

export default function Dashboard() {
  const {
    user,
    profile,
    loading,
    projects,
    currentProject,
    currentProjectId,
    setCurrentProjectId,
    refreshProjects,
  } = useAuth()
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [createCoverImageFile, setCreateCoverImageFile] = useState<File | null>(null)
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null)
  const [createMemberSearch, setCreateMemberSearch] = useState('')
  const [createMemberRoles, setCreateMemberRoles] = useState<Record<string, 'admin' | 'developer' | 'reporter'>>({})

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editProjectName, setEditProjectName] = useState('')
  const [editProjectDescription, setEditProjectDescription] = useState('')
  const [editCoverImageFile, setEditCoverImageFile] = useState<File | null>(null)

  const [showFullDescription, setShowFullDescription] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')
  const [selectedRoleByUserId, setSelectedRoleByUserId] = useState<Record<string, 'admin' | 'developer' | 'reporter'>>({})
  const [showMemberFilters, setShowMemberFilters] = useState(false)
  const [selectedMemberRoles, setSelectedMemberRoles] = useState<Array<'owner' | 'admin' | 'developer' | 'reporter'>>([])
  const [memberJoinedFrom, setMemberJoinedFrom] = useState('')
  const [memberJoinedTo, setMemberJoinedTo] = useState('')
  const [memberCurrentPage, setMemberCurrentPage] = useState(1)
  const [managedMember, setManagedMember] = useState<ProjectMember | null>(null)
  const [managedMemberRole, setManagedMemberRole] = useState<'admin' | 'developer' | 'reporter'>('developer')
  const [phaseAutoMode, setPhaseAutoMode] = useState<'none' | 'weekly' | 'biweekly' | 'monthly'>('none')
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string
    message: string
    confirmLabel: string
    variant?: 'danger' | 'primary'
    onConfirm: () => void
  } | null>(null)

  const membersPageSize = 10

  const canManageMembers = !!currentProject?.my_role && ['owner', 'admin'].includes(currentProject.my_role)
  const isProjectOwner = currentProject?.my_role === 'owner'

  const createProjectMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: projectName.trim(),
        description: projectDescription.trim() || null,
      }
      return api.post('/projects', payload)
    },
    onSuccess: async (response) => {
      const newProjectId = response.data?.id as string | undefined
      if (newProjectId && createCoverImageFile) {
        const formData = new FormData()
        formData.append('file', createCoverImageFile)
        await api.post(`/projects/${newProjectId}/cover-image`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      }
      await refreshProjects()
      if (newProjectId) {
        setCurrentProjectId(newProjectId)
        setCreatedProjectId(newProjectId)
      }
      toast.success('Project created')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to create project')
    },
  })

  const { data: members, refetch: refetchMembers } = useQuery<ProjectMember[]>({
    queryKey: ['project-members', currentProjectId],
    queryFn: async () => {
      const response = await api.get(`/projects/${currentProjectId}/members`)
      return Array.isArray(response.data) ? response.data : []
    },
    enabled: !!currentProjectId,
    staleTime: 120_000,
    refetchOnWindowFocus: false,
  })

  const { data: projectPhases, refetch: refetchPhases } = useQuery<ProjectPhase[]>({
    queryKey: ['project-phases', currentProjectId],
    queryFn: async () => {
      const response = await api.get(`/projects/${currentProjectId}/phases`)
      return Array.isArray(response.data) ? response.data : []
    },
    enabled: !!currentProjectId,
    staleTime: 60_000,
  })

  const { data: searchResults } = useQuery<UserSearchResult[]>({
    queryKey: ['project-user-search', currentProjectId, memberSearch],
    queryFn: async () => {
      const response = await api.get(`/projects/${currentProjectId}/users/search`, {
        params: { q: memberSearch.trim() },
      })
      return Array.isArray(response.data) ? response.data : []
    },
    enabled: !!currentProjectId && canManageMembers && memberSearch.trim().length >= 2,
  })

  const { data: createSearchResults } = useQuery<UserSearchResult[]>({
    queryKey: ['project-create-user-search', createdProjectId, createMemberSearch],
    queryFn: async () => {
      const response = await api.get(`/projects/${createdProjectId}/users/search`, {
        params: { q: createMemberSearch.trim() },
      })
      return Array.isArray(response.data) ? response.data : []
    },
    enabled: !!createdProjectId && createMemberSearch.trim().length >= 2,
  })

  const addMemberMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: 'admin' | 'developer' | 'reporter' }) => {
      return api.post(`/projects/${currentProjectId}/member-invitations`, {
        user_id: userId,
        role,
      })
    },
    onSuccess: async () => {
      toast.success('Project invite sent')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to add member')
    },
  })

  const addCreatedProjectMemberMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: 'admin' | 'developer' | 'reporter' }) => {
      return api.post(`/projects/${createdProjectId}/member-invitations`, {
        user_id: userId,
        role,
      })
    },
    onSuccess: () => {
      toast.success('Project invite sent')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to add member')
    },
  })

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: 'admin' | 'developer' | 'reporter' }) => {
      return api.patch(`/projects/${currentProjectId}/members/${userId}`, { role })
    },
    onSuccess: async () => {
      await refetchMembers()
      toast.success('Member role updated')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to update role')
    },
  })

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      return api.delete(`/projects/${currentProjectId}/members/${userId}`)
    },
    onSuccess: async () => {
      await refetchMembers()
      toast.success('Member removed from project')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to remove member')
    },
  })

  const updateProjectMutation = useMutation({
    mutationFn: async () => {
      return api.patch(`/projects/${currentProjectId}`, {
        name: editProjectName.trim() || undefined,
        description: editProjectDescription,
      })
    },
    onSuccess: async () => {
      if (currentProjectId && editCoverImageFile) {
        const formData = new FormData()
        formData.append('file', editCoverImageFile)
        await api.post(`/projects/${currentProjectId}/cover-image`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      }
      await refreshProjects()
      setShowEditModal(false)
      setEditCoverImageFile(null)
      toast.success('Project updated')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to update project')
    },
  })

  const deleteProjectMutation = useMutation({
    mutationFn: async () => {
      return api.delete(`/projects/${currentProjectId}`)
    },
    onSuccess: async () => {
      await refreshProjects()
      setShowEditModal(false)
      setEditCoverImageFile(null)
      toast.success('Project deleted')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to delete project')
    },
  })

  const advancePhaseMutation = useMutation({
    mutationFn: async () => api.post(`/projects/${currentProjectId}/phases/advance`),
    onSuccess: async () => {
      await refreshProjects()
      await refetchPhases()
      toast.success('Project phase advanced')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to advance phase')
    },
  })

  const updatePhaseSettingsMutation = useMutation({
    mutationFn: async (mode: 'none' | 'weekly' | 'biweekly' | 'monthly') => {
      return api.patch(`/projects/${currentProjectId}/phase-settings`, {
        phase_auto_mode: mode === 'none' ? null : mode,
      })
    },
    onSuccess: async () => {
      await refreshProjects()
      await refetchPhases()
      toast.success('Phase cadence updated')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to update phase cadence')
    },
  })

  useEffect(() => {
    const defaults: Record<string, 'admin' | 'developer' | 'reporter'> = {}
    ;(members || []).forEach((member) => {
      if (member.role === 'owner') {
        return
      }
      defaults[member.user_id] = member.role
    })
    setSelectedRoleByUserId(defaults)
  }, [members])

  const sortedMembers = useMemo(
    () =>
      [...(members || [])].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
    [members]
  )

  const filteredMembers = useMemo(() => {
    return sortedMembers.filter((member) => {
      const search = memberSearch.trim().toLowerCase()
      if (search) {
        const haystack = [member.full_name || '', member.email || '', member.role].join(' ').toLowerCase()
        if (!haystack.includes(search)) {
          return false
        }
      }

      if (selectedMemberRoles.length > 0 && !selectedMemberRoles.includes(member.role)) {
        return false
      }

      const joinedDate = (member.created_at || '').slice(0, 10)
      if (memberJoinedFrom && (!joinedDate || joinedDate < memberJoinedFrom)) {
        return false
      }
      if (memberJoinedTo && (!joinedDate || joinedDate > memberJoinedTo)) {
        return false
      }

      return true
    })
  }, [sortedMembers, memberSearch, selectedMemberRoles, memberJoinedFrom, memberJoinedTo])

  const availableMemberRoleFilters = useMemo(
    () => Array.from(new Set((members || []).map((member) => member.role))),
    [members]
  )

  const totalMemberPages = Math.max(1, Math.ceil(filteredMembers.length / membersPageSize))
  const safeMemberCurrentPage = Math.min(memberCurrentPage, totalMemberPages)

  const paginatedMembers = useMemo(() => {
    const start = (safeMemberCurrentPage - 1) * membersPageSize
    return filteredMembers.slice(start, start + membersPageSize)
  }, [filteredMembers, safeMemberCurrentPage])

  useEffect(() => {
    if (memberCurrentPage !== safeMemberCurrentPage) {
      setMemberCurrentPage(safeMemberCurrentPage)
    }
  }, [memberCurrentPage, safeMemberCurrentPage])

  useEffect(() => {
    setMemberCurrentPage(1)
  }, [memberSearch, selectedMemberRoles, memberJoinedFrom, memberJoinedTo, currentProjectId])

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => a.name.localeCompare(b.name)),
    [projects]
  )

  const currentDescription = currentProject?.description || ''
  const shouldTruncateDescription = currentDescription.length > 180
  const displayedDescription = showFullDescription || !shouldTruncateDescription
    ? currentDescription
    : `${currentDescription.slice(0, 180)}...`

  const editedCoverPreview = editCoverImageFile ? URL.createObjectURL(editCoverImageFile) : (currentProject?.cover_image_url ? `${api.defaults.baseURL}/projects/${currentProject.id}/cover-image` : null)

  const createCoverPreview = createCoverImageFile ? URL.createObjectURL(createCoverImageFile) : null

  const closeCreateModal = () => {
    setShowCreateModal(false)
    setProjectName('')
    setProjectDescription('')
    setCreateCoverImageFile(null)
    setCreatedProjectId(null)
    setCreateMemberSearch('')
    setCreateMemberRoles({})
  }

  const closeManagedMemberModal = () => {
    setManagedMember(null)
  }

  const clearMemberFilters = () => {
    setSelectedMemberRoles([])
    setMemberJoinedFrom('')
    setMemberJoinedTo('')
  }

  const toggleMemberRoleFilter = (role: ProjectMember['role']) => {
    setSelectedMemberRoles((previous) =>
      previous.includes(role) ? previous.filter((item) => item !== role) : [...previous, role]
    )
  }

  const openManagedMemberModal = (member: ProjectMember) => {
    if (member.role === 'owner') {
      return
    }
    setManagedMember(member)
    setManagedMemberRole(member.role)
  }

  const openEditModal = () => {
    setEditProjectName(currentProject?.name || '')
    setEditProjectDescription(currentProject?.description || '')
    setEditCoverImageFile(null)
    setShowEditModal(true)
  }

  useEffect(() => {
    setShowFullDescription(false)
  }, [currentProjectId])

  useEffect(() => {
    if (!currentProject) {
      setPhaseAutoMode('none')
      return
    }
    setPhaseAutoMode((currentProject.phase_auto_mode as 'weekly' | 'biweekly' | 'monthly' | null) || 'none')
  }, [currentProject])

  useEffect(() => {
    if (!managedMember) {
      return
    }

    const refreshedMember = (members || []).find((member) => member.user_id === managedMember.user_id)
    if (!refreshedMember || refreshedMember.role === 'owner') {
      setManagedMember(null)
      return
    }

    setManagedMember(refreshedMember)
    setManagedMemberRole(refreshedMember.role)
  }, [managedMember?.user_id, members])

  if (loading) {
    return <LoadingPulse fullscreen label="Loading project hub" />
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-600">You are not logged in.</div>
      </div>
    )
  }

  const neutralActionButtonClass = 'bg-gray-400 hover:bg-gray-300 transition-colors duration-150 text-gray-900 border border-gray-400 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white dark:border-gray-500 px-3 py-2 rounded-md text-sm'

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white shadow rounded-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Welcome, {profile?.full_name || user?.email}!
        </h1>
        <p className="text-gray-600 mb-4">
          Create projects, switch between them, and manage project-specific roles.
        </p>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
          <div className="border border-gray-200 rounded-lg p-4 h-full flex flex-col">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Your Projects</h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-gray-300 hover:bg-gray-400 text-gray-900 border border-gray-400 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white dark:border-gray-500"
                aria-label="Create project"
                title="Create project"
              >
                +
              </button>
            </div>
            {sortedProjects.length === 0 ? (
              <p className="text-sm text-gray-500">You are not part of any projects yet.</p>
            ) : (
              <div className="space-y-2 pr-1 overflow-y-auto flex-1">
                {sortedProjects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => setCurrentProjectId(project.id)}
                    className={`w-full text-left rounded-md border px-3 py-2 transition-colors ${
                      currentProjectId === project.id
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-200 hover:border-indigo-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {project.cover_image_url ? (
                        <img
                          src={`${api.defaults.baseURL}/projects/${project.id}/cover-image`}
                          alt={`${project.name} icon`}
                          className="h-7 w-7 rounded object-cover border border-gray-200"
                          loading="eager"
                          decoding="async"
                          fetchPriority={currentProjectId === project.id ? 'high' : 'low'}
                        />
                      ) : (
                        <div className="h-7 w-7 rounded border border-gray-300 bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-semibold">
                          P
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{project.name}</p>
                        <p className="text-xs text-gray-500">Role: {project.my_role}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="border border-gray-200 rounded-lg p-4 h-full flex flex-col">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Current Project</h2>
              {canManageMembers && (
                <button
                  type="button"
                  onClick={openEditModal}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-gray-300 hover:bg-gray-400 text-gray-900 border border-gray-400 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white dark:border-gray-500"
                  aria-label="Edit project"
                  title="Edit project"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                    <path d="M19.14 12.94a7.43 7.43 0 0 0 .05-.94 7.43 7.43 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.22 7.22 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.49-.42h-3.84a.5.5 0 0 0-.49.42l-.36 2.54c-.57.23-1.11.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.03.31-.05.63-.05.94 0 .31.02.63.05.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.31.6.22l2.39-.96c.52.4 1.06.72 1.63.94l.36 2.54c.04.24.25.42.49.42h3.84c.24 0 .45-.18.49-.42l.36-2.54c.57-.23 1.11-.54 1.63-.94l2.39.96c.22.09.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z" />
                  </svg>
                </button>
              )}
            </div>
            {currentProject ? (
              <>
                {currentProject.cover_image_url && (
                  <img
                    src={`${api.defaults.baseURL}/projects/${currentProject.id}/cover-image`}
                    alt={`${currentProject.name} cover`}
                    className="mb-3 h-28 w-full object-cover rounded-md border border-gray-200"
                    loading="eager"
                    decoding="async"
                    fetchPriority="high"
                  />
                )}
                <p className="text-sm font-semibold text-gray-900">{currentProject.name}</p>
                <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap break-words">{displayedDescription || 'No description'}</p>
                {shouldTruncateDescription && (
                  <button
                    type="button"
                    onClick={() => setShowFullDescription((prev) => !prev)}
                    className="text-xs mt-1 text-indigo-600 hover:text-indigo-800"
                  >
                    {showFullDescription ? 'See less' : 'See more'}
                  </button>
                )}
                <p className="text-xs text-gray-500 mt-2">Your role: {currentProject.my_role}</p>
                <p className="text-xs text-gray-500 mt-1">Current phase: #{currentProject.current_phase_number}</p>
                <p className="text-xs text-gray-500 mt-1">Phase started: {formatMemberDate(currentProject.current_phase_started_at)}</p>

                {canManageMembers && (
                  <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-3 space-y-2">
                    <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                      <select
                        value={phaseAutoMode}
                        onChange={(event) => {
                          const mode = event.target.value as 'none' | 'weekly' | 'biweekly' | 'monthly'
                          setPhaseAutoMode(mode)
                          updatePhaseSettingsMutation.mutate(mode)
                        }}
                        className="block w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-md text-sm"
                      >
                        <option value="none">Manual updates only</option>
                        <option value="weekly">Auto update weekly</option>
                        <option value="biweekly">Auto update biweekly</option>
                        <option value="monthly">Auto update monthly</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => advancePhaseMutation.mutate()}
                        disabled={advancePhaseMutation.isPending}
                        className="bg-blue-800 hover:bg-blue-900 text-white px-3 py-2 rounded-md text-sm disabled:opacity-50"
                      >
                        {advancePhaseMutation.isPending ? 'Updating...' : 'Advance Phase Now'}
                      </button>
                    </div>
                    <p className="text-xs text-gray-600">
                      Resolved bugs from previous phases are hidden from active bug views.
                    </p>
                  </div>
                )}

                {(projectPhases || []).length > 0 && (
                  <div className="mt-3 rounded-md border border-gray-200 p-2">
                    <p className="text-xs font-semibold text-gray-700 mb-1">Recent phases</p>
                    <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                      {(projectPhases || []).slice(0, 6).map((phase) => (
                        <p key={phase.id} className="text-xs text-gray-600">
                          Phase #{phase.phase_number} • {phase.transition_type} • {formatMemberDate(phase.started_at)}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-500">Select a project to manage members and view bugs.</p>
            )}
          </div>
        </div>

        {currentProject && (
          <div className="mt-6 border border-gray-200 rounded-lg p-4">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Project Members</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Owners and admins can add, update, and remove project members.
                </p>
              </div>
            </div>

            <div className="mb-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <input
                  value={memberSearch}
                  onChange={(event) => setMemberSearch(event.target.value)}
                  placeholder={canManageMembers ? 'Search members and invite users by name/email' : 'Search project members by name, email, or role'}
                  className="block w-full px-3 py-2 border border-gray-300 bg-slate-50 rounded-md text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowMemberFilters((previous) => !previous)}
                  className="inline-flex justify-center items-center whitespace-nowrap px-3 py-2 border border-blue-900 rounded-md text-sm font-medium text-white bg-blue-800 hover:bg-blue-900 transition-colors"
                >
                  {showMemberFilters ? 'Hide Filter Options' : 'Show Filter Options'}
                </button>
              </div>

              {canManageMembers && memberSearch.trim().length >= 2 && (
                <div className="mt-2 border border-gray-200 rounded-md divide-y">
                  {(searchResults || []).map((searchUser) => {
                    const defaultRole = selectedRoleByUserId[searchUser.id] || 'developer'
                    return (
                      <div key={searchUser.id} className="p-2 flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{searchUser.full_name || searchUser.email}</p>
                          <p className="text-xs text-gray-500">{searchUser.email}</p>
                        </div>
                        {searchUser.is_member ? (
                          <span className="text-xs text-green-700">Already in project</span>
                        ) : searchUser.has_pending_invitation ? (
                          <span className="text-xs text-amber-700">Invitation pending</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <select
                              value={defaultRole}
                              onChange={(event) =>
                                setSelectedRoleByUserId((prev) => ({
                                  ...prev,
                                  [searchUser.id]: event.target.value as 'admin' | 'developer' | 'reporter',
                                }))
                              }
                              className="px-2 py-1 border border-gray-300 rounded text-sm"
                            >
                              {projectRoles.map((role) => (
                                <option key={role} value={role}>
                                  {role}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => addMemberMutation.mutate({ userId: searchUser.id, role: defaultRole })}
                              className="bg-blue-800 text-white px-3 py-1 rounded text-sm hover:bg-blue-900"
                            >
                              Add
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {(searchResults || []).length === 0 && (
                    <div className="p-2 text-sm text-gray-500">No matching users</div>
                  )}
                </div>
              )}

              {showMemberFilters && (
                <div className="space-y-5 mt-4 pt-4 border-t border-gray-200">
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold tracking-wide text-gray-700">Role</label>
                    <div className="overflow-x-auto pb-1">
                      <div className="inline-flex min-w-max items-center gap-2 pr-2">
                        {availableMemberRoleFilters.map((role) => {
                          const isSelected = selectedMemberRoles.includes(role)
                          return (
                            <button
                              key={role}
                              type="button"
                              onClick={() => toggleMemberRoleFilter(role)}
                              className={`inline-flex h-8 items-center whitespace-nowrap rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
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
                              <span className="capitalize">{role}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Joined From</label>
                      <input
                        type="date"
                        value={memberJoinedFrom}
                        onChange={(event) => setMemberJoinedFrom(event.target.value)}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Joined To</label>
                      <input
                        type="date"
                        value={memberJoinedTo}
                        onChange={(event) => setMemberJoinedTo(event.target.value)}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      />
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <button
                      type="button"
                      onClick={clearMemberFilters}
                      className="text-sm text-indigo-600 hover:text-indigo-800"
                    >
                      Clear Filters
                    </button>
                    <span className="text-sm text-gray-600">
                      Showing {paginatedMembers.length > 0 ? (safeMemberCurrentPage - 1) * membersPageSize + 1 : 0}
                      -
                      {(safeMemberCurrentPage - 1) * membersPageSize + paginatedMembers.length} of {filteredMembers.length}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              {paginatedMembers.map((member) => (
                <div key={member.user_id} className="group flex items-center justify-between border border-gray-200 rounded-md p-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 overflow-hidden rounded-full border border-gray-200 bg-gray-100">
                      {member.avatar_url ? (
                        <img src={member.avatar_url} alt={member.full_name || member.email || 'Member'} className="h-full w-full object-cover" loading="eager" decoding="async" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-gray-500">
                          {(member.full_name || member.email || '?').charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{member.full_name || member.email || member.user_id}</p>
                      <p className="text-xs text-gray-500">{member.email || 'No email'}</p>
                      <p className="text-xs text-gray-500 mt-1 capitalize">Role: {member.role}</p>
                      <p className="text-xs text-gray-500 mt-1">Joined: {formatMemberDate(member.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {canManageMembers && member.role !== 'owner' && (
                      <button
                        type="button"
                        onClick={() => openManagedMemberModal(member)}
                        className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:text-indigo-700 hover:border-indigo-300"
                        aria-label={`Manage ${member.full_name || member.email || 'member'}`}
                        title="Manage member"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                          <path d="M19.14 12.94a7.43 7.43 0 0 0 .05-.94 7.43 7.43 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.22 7.22 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.49-.42h-3.84a.5.5 0 0 0-.49.42l-.36 2.54c-.57.23-1.11.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.03.31-.05.63-.05.94 0 .31.02.63.05.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.31.6.22l2.39-.96c.52.4 1.06.72 1.63.94l.36 2.54c.04.24.25.42.49.42h3.84c.24 0 .45-.18.49-.42l.36-2.54c.57-.23 1.11-.54 1.63-.94l2.39.96c.22.09.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {filteredMembers.length === 0 && <p className="text-sm text-gray-500">No members found.</p>}
            </div>

            {filteredMembers.length > membersPageSize && (
              <div className="mt-4 flex items-center justify-center gap-2 border-t border-gray-200 pt-4">
                <button
                  type="button"
                  onClick={() => setMemberCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={safeMemberCurrentPage === 1}
                  className="rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Prev
                </button>
                {Array.from({ length: totalMemberPages }, (_, index) => index + 1).map((pageNumber) => (
                  <button
                    key={pageNumber}
                    type="button"
                    onClick={() => setMemberCurrentPage(pageNumber)}
                    className={`rounded-md px-3 py-1 text-sm ${
                      pageNumber === safeMemberCurrentPage
                        ? 'bg-blue-800 text-white'
                        : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {pageNumber}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setMemberCurrentPage((page) => Math.min(totalMemberPages, page + 1))}
                  disabled={safeMemberCurrentPage === totalMemberPages}
                  className="rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeCreateModal()
            }
          }}
        >
          <div className="w-full max-w-2xl rounded-lg bg-white border border-gray-200 shadow-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Create Project</h3>
              <button type="button" onClick={closeCreateModal} className="text-gray-600 hover:text-gray-900">x</button>
            </div>

            {!createdProjectId ? (
              <div className="space-y-3">
                <input
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  placeholder="Project name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
                <textarea
                  value={projectDescription}
                  onChange={(event) => setProjectDescription(event.target.value)}
                  placeholder="Description (optional)"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
                <p className="text-xs text-gray-500">
                  Cover image (images only: PNG, JPG, WEBP, etc.)
                </p>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => setCreateCoverImageFile(event.target.files?.[0] || null)}
                  className="w-full text-sm"
                />
                {createCoverPreview && (
                  <img src={createCoverPreview} alt="Cover preview" className="h-28 w-full object-cover rounded-md border border-gray-200" />
                )}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeCreateModal}
                    className={neutralActionButtonClass}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => createProjectMutation.mutate()}
                    disabled={!projectName.trim() || createProjectMutation.isPending}
                    className="bg-blue-800 hover:bg-blue-900 text-white px-3 py-2 rounded-md text-sm disabled:opacity-50"
                  >
                    {createProjectMutation.isPending ? 'Creating...' : 'Create Project'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-700">Project created. Optionally add members now, or close.</p>
                <input
                  value={createMemberSearch}
                  onChange={(event) => setCreateMemberSearch(event.target.value)}
                  placeholder="Search users by name or email"
                  className="w-full px-3 py-2 border border-gray-300 bg-slate-50 rounded-md text-sm"
                />
                {createMemberSearch.trim().length >= 2 && (
                  <div className="max-h-52 overflow-y-auto border border-gray-200 rounded-md divide-y">
                    {(createSearchResults || []).map((searchUser) => {
                      const selectedRole = createMemberRoles[searchUser.id] || 'developer'
                      return (
                        <div key={searchUser.id} className="p-2 flex items-center justify-between gap-2">
                          <div>
                            <p className="text-sm text-gray-900 font-medium">{searchUser.full_name || searchUser.email}</p>
                            <p className="text-xs text-gray-500">{searchUser.email}</p>
                          </div>
                          {searchUser.is_member ? (
                            <span className="text-xs text-green-700">Already member</span>
                          ) : searchUser.has_pending_invitation ? (
                            <span className="text-xs text-amber-700">Invitation pending</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <select
                                value={selectedRole}
                                onChange={(event) =>
                                  setCreateMemberRoles((prev) => ({
                                    ...prev,
                                    [searchUser.id]: event.target.value as 'admin' | 'developer' | 'reporter',
                                  }))
                                }
                                className="px-2 py-1 border border-gray-300 rounded text-sm"
                              >
                                {projectRoles.map((role) => (
                                  <option key={role} value={role}>{role}</option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => addCreatedProjectMemberMutation.mutate({ userId: searchUser.id, role: selectedRole })}
                                className="bg-blue-800 text-white px-3 py-1 rounded text-sm hover:bg-blue-900"
                              >
                                Add
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={closeCreateModal}
                    className={neutralActionButtonClass}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showEditModal && currentProject && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setShowEditModal(false)
              setEditCoverImageFile(null)
            }
          }}
        >
          <div className="w-full max-w-3xl rounded-lg bg-white border border-gray-200 shadow-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Edit Project</h3>
              <button type="button" onClick={() => setShowEditModal(false)} className="text-gray-600 hover:text-gray-900">x</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <input
                  value={editProjectName}
                  onChange={(event) => setEditProjectName(event.target.value)}
                  placeholder="Project title"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
                <textarea
                  value={editProjectDescription}
                  onChange={(event) => setEditProjectDescription(event.target.value)}
                  placeholder="Project description"
                  rows={5}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
                <p className="text-xs text-gray-500">
                  Cover image (images only: PNG, JPG, WEBP, etc.)
                </p>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => setEditCoverImageFile(event.target.files?.[0] || null)}
                  className="w-full text-sm"
                />
              </div>

              <div className="rounded-md border border-gray-200 p-3 bg-gray-50">
                <p className="text-xs uppercase text-gray-500 mb-2">Preview</p>
                {editedCoverPreview ? (
                  <img src={editedCoverPreview} alt="Project cover preview" className="h-32 w-full object-cover rounded-md border border-gray-200 mb-2" />
                ) : (
                  <div className="h-32 w-full rounded-md border border-gray-300 bg-gray-100 flex items-center justify-center text-gray-500 mb-2">No cover image</div>
                )}
                <p className="text-sm font-semibold text-gray-900">{editProjectName || 'Untitled project'}</p>
                <p className="mt-1 text-sm text-gray-600 whitespace-pre-wrap break-words">{editProjectDescription || 'No description'}</p>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className={neutralActionButtonClass}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => updateProjectMutation.mutate()}
                disabled={updateProjectMutation.isPending}
                className="bg-blue-800 hover:bg-blue-900 text-white px-3 py-2 rounded-md text-sm disabled:opacity-50"
              >
                {updateProjectMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>

            {isProjectOwner && (
              <div className="mt-5 pt-4 border-t border-red-100">
                <button
                  type="button"
                  onClick={() => {
                    if (!currentProject) {
                      return
                    }
                    setConfirmDialog({
                      title: 'Delete Project',
                      message: `Delete project "${currentProject.name}"? This cannot be undone.`,
                      confirmLabel: 'Delete Project',
                      variant: 'danger',
                      onConfirm: () => {
                        deleteProjectMutation.mutate()
                        setConfirmDialog(null)
                      },
                    })
                  }}
                  disabled={deleteProjectMutation.isPending}
                  className="w-full bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-md text-sm disabled:opacity-50"
                >
                  {deleteProjectMutation.isPending ? 'Deleting...' : 'Delete Project'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {managedMember && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeManagedMemberModal()
            }
          }}
        >
          <div className="w-full max-w-md rounded-lg bg-white border border-gray-200 shadow-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Manage Member</h3>
              <button type="button" onClick={closeManagedMemberModal} className="text-gray-600 hover:text-gray-900">x</button>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">{managedMember.full_name || managedMember.email || managedMember.user_id}</p>
                <p className="text-xs text-gray-500">{managedMember.email || 'No email'}</p>
                <p className="text-xs text-gray-500 mt-1">Joined: {formatMemberDate(managedMember.created_at)}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={managedMemberRole}
                  onChange={(event) => setManagedMemberRole(event.target.value as 'admin' | 'developer' | 'reporter')}
                  style={{ backgroundPosition: 'calc(100% - 0.62rem) center' }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                  {projectRoles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeManagedMemberModal}
                className={neutralActionButtonClass}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  updateRoleMutation.mutate(
                    { userId: managedMember.user_id, role: managedMemberRole },
                    {
                      onSuccess: () => {
                        closeManagedMemberModal()
                      },
                    }
                  )
                }}
                disabled={updateRoleMutation.isPending}
                className="bg-blue-800 hover:bg-blue-900 text-white px-3 py-2 rounded-md text-sm disabled:opacity-50"
              >
                {updateRoleMutation.isPending ? 'Saving...' : 'Save Role'}
              </button>
            </div>

            <div className="mt-4 pt-4 border-t border-red-100">
              <button
                type="button"
                onClick={() => {
                  const memberName = managedMember.full_name || managedMember.email || 'this member'
                  setConfirmDialog({
                    title: 'Remove Member',
                    message: `Remove ${memberName} from this project?`,
                    confirmLabel: 'Remove Member',
                    variant: 'danger',
                    onConfirm: () => {
                      removeMemberMutation.mutate(managedMember.user_id, {
                        onSuccess: () => {
                          closeManagedMemberModal()
                        },
                      })
                      setConfirmDialog(null)
                    },
                  })
                }}
                disabled={removeMemberMutation.isPending}
                className="w-full bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-md text-sm disabled:opacity-50"
              >
                {removeMemberMutation.isPending ? 'Removing...' : 'Remove Member'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4" onClick={() => setConfirmDialog(null)}>
          <div className="w-full max-w-md rounded-lg bg-white border border-gray-200 shadow-xl p-5" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 h-9 w-9 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                  <path fillRule="evenodd" d="M9.401 3.003c1.155-2.006 4.043-2.006 5.198 0l7.355 12.773c1.155 2.006-.289 4.512-2.599 4.512H4.645c-2.31 0-3.754-2.506-2.599-4.512L9.4 3.003ZM12 8.25a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.938.938 0 1 0 0-1.876.938.938 0 0 0 0 1.876Z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1">
                <h4 className="text-lg font-semibold text-gray-900">{confirmDialog.title}</h4>
                <p className="mt-1 text-sm text-gray-600">{confirmDialog.message}</p>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmDialog(null)} className={neutralActionButtonClass}>
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDialog.onConfirm}
                className={confirmDialog.variant === 'danger'
                  ? 'bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-md text-sm'
                  : 'bg-blue-800 hover:bg-blue-900 text-white px-3 py-2 rounded-md text-sm'}
              >
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
