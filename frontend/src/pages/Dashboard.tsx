import { useAuth } from '../contexts/AuthContext'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'

type ProjectMember = {
  user_id: string
  role: 'owner' | 'admin' | 'developer' | 'reporter'
  email?: string | null
  full_name?: string | null
  avatar_url?: string | null
}

type UserSearchResult = {
  id: string
  email?: string | null
  full_name?: string | null
  avatar_url?: string | null
  is_member: boolean
  has_pending_invitation?: boolean
}

const projectRoles: Array<'admin' | 'developer' | 'reporter'> = ['admin', 'developer', 'reporter']

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

  const canManageMembers = !!currentProject?.my_role && ['owner', 'admin'].includes(currentProject.my_role)

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

  const openEditModal = () => {
    setEditProjectName(currentProject?.name || '')
    setEditProjectDescription(currentProject?.description || '')
    setEditCoverImageFile(null)
    setShowEditModal(true)
  }

  useEffect(() => {
    setShowFullDescription(false)
  }, [currentProjectId])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-600">You are not logged in.</div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white shadow rounded-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Welcome, {profile?.full_name || user?.email}!
        </h1>
        <p className="text-gray-600 mb-4">
          Create projects, switch between them, and manage project-specific roles.
        </p>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="border border-gray-200 rounded-lg p-4">
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
              <div className={`space-y-2 pr-1 ${sortedProjects.length > 3 ? 'max-h-56 overflow-y-auto' : ''}`}>
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

          <div className="border border-gray-200 rounded-lg p-4">
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
              </>
            ) : (
              <p className="text-sm text-gray-500">Select a project to manage members and view bugs.</p>
            )}
          </div>
        </div>

        {currentProject && (
          <div className="mt-6 border border-gray-200 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-gray-900">Project Members</h2>
            <p className="text-sm text-gray-600 mt-1 mb-4">
              Owners and admins can add, update, and remove project members.
            </p>

            {canManageMembers && (
              <div className="mb-4">
                <input
                  value={memberSearch}
                  onChange={(event) => setMemberSearch(event.target.value)}
                  placeholder="Search users by name or email"
                  className="block w-full max-w-xl px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
                {memberSearch.trim().length >= 2 && (
                  <div className="mt-2 border border-gray-200 rounded-md divide-y max-w-xl">
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
                                className="bg-indigo-600 text-white px-3 py-1 rounded text-sm"
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
              </div>
            )}

            <div className="space-y-2">
              {(members || []).map((member) => (
                <div key={member.user_id} className="flex items-center justify-between border border-gray-200 rounded-md p-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{member.full_name || member.email || member.user_id}</p>
                    <p className="text-xs text-gray-500">{member.email}</p>
                  </div>
                  {canManageMembers && member.role !== 'owner' ? (
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedRoleByUserId[member.user_id] || member.role}
                        onChange={(event) =>
                          setSelectedRoleByUserId((prev) => ({
                            ...prev,
                            [member.user_id]: event.target.value as 'admin' | 'developer' | 'reporter',
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
                        onClick={() =>
                          updateRoleMutation.mutate({
                            userId: member.user_id,
                            role: selectedRoleByUserId[member.user_id] || member.role,
                          })
                        }
                        className="bg-gray-300 hover:bg-gray-400 text-gray-900 border border-gray-400 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white dark:border-gray-500 px-3 py-1 rounded text-sm"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => removeMemberMutation.mutate(member.user_id)}
                        className="bg-red-600 text-white px-3 py-1 rounded text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <span className="text-sm font-semibold text-gray-700">{member.role}</span>
                  )}
                </div>
              ))}
              {(members || []).length === 0 && <p className="text-sm text-gray-500">No members found.</p>}
            </div>
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
                    className="bg-gray-300 hover:bg-gray-400 text-gray-900 border border-gray-400 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white dark:border-gray-500 px-3 py-2 rounded-md text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => createProjectMutation.mutate()}
                    disabled={!projectName.trim() || createProjectMutation.isPending}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-md text-sm disabled:opacity-50"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
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
                                className="bg-indigo-600 text-white px-3 py-1 rounded text-sm"
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
                    className="bg-gray-300 hover:bg-gray-400 text-gray-900 border border-gray-400 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white dark:border-gray-500 px-3 py-2 rounded-md text-sm"
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
                className="bg-gray-300 hover:bg-gray-400 text-gray-900 border border-gray-400 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white dark:border-gray-500 px-3 py-2 rounded-md text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => updateProjectMutation.mutate()}
                disabled={updateProjectMutation.isPending}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-md text-sm disabled:opacity-50"
              >
                {updateProjectMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
