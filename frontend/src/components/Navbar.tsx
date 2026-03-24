import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'
import logoIcon from '../assets/NavBar/logo-icon.svg'

export const Navbar = () => {
  const { user, profile, projects, currentProjectId, setCurrentProjectId, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const profileInitial = (profile?.full_name || profile?.email || 'U').charAt(0).toUpperCase()

  const { data: bugInvitationCountData } = useQuery<{ count: number }>({
    queryKey: ['bug-invitation-pending-count'],
    queryFn: async () => {
      const response = await api.get('/bugs/assignment-invitations/pending-count')
      return response.data
    },
    enabled: !!user,
    refetchInterval: 30_000,
  })

  const { data: projectInvitationCountData } = useQuery<{ count: number }>({
    queryKey: ['project-invitation-pending-count'],
    queryFn: async () => {
      const response = await api.get('/projects/member-invitations/pending-count')
      return response.data
    },
    enabled: !!user,
    refetchInterval: 30_000,
  })

  const pendingInboxCount = (bugInvitationCountData?.count || 0) + (projectInvitationCountData?.count || 0)
  const pendingInboxLabel = pendingInboxCount > 9 ? '9+' : String(pendingInboxCount)

  const switchProject = (projectId: string) => {
    setCurrentProjectId(projectId || null)

    const path = location.pathname
    if (path.startsWith('/bugs')) {
      navigate('/bugs')
      return
    }
    if (path.startsWith('/artifacts')) {
      navigate('/artifacts')
      return
    }
    if (path.startsWith('/profile')) {
      navigate('/profile')
      return
    }
    if (path.startsWith('/inbox')) {
      navigate('/inbox')
      return
    }
    navigate('/dashboard')
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/auth')
  }

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200 fixed top-0 left-0 right-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 gap-4 overflow-x-auto">
          <div className="flex items-center">
            <Link to="/" className="flex items-center" aria-label="DeBUG home">
              <img src={logoIcon} alt="DeBUG logo" className="h-16 w-16" />
              <span className="ml-2 text-3xl leading-none font-bold text-[#3D6BBA]">DeBUG</span>
            </Link>
            {user && projects.length > 0 && (
              <select
                value={currentProjectId || ''}
                onChange={(event) => switchProject(event.target.value)}
                className="ml-2 border border-gray-300 rounded-md text-sm px-2 py-1 bg-white text-gray-700"
                aria-label="Select current project"
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            )}
            {user && (
              <div className="ml-6 flex items-center gap-2 overflow-x-auto whitespace-nowrap pr-2">
                <Link
                  to="/dashboard"
                  className="max-w-28 truncate text-gray-700 hover:text-indigo-600 px-3 py-2 rounded-md text-sm font-medium"
                >
                  Dashboard
                </Link>
                <Link
                  to="/artifacts"
                  className="max-w-28 truncate text-gray-700 hover:text-indigo-600 px-3 py-2 rounded-md text-sm font-medium"
                >
                  Artifacts
                </Link>
                <Link
                  to="/bugs"
                  className="max-w-20 truncate text-gray-700 hover:text-indigo-600 px-3 py-2 rounded-md text-sm font-medium"
                >
                  Bugs
                </Link>
                {profile?.role === 'admin' && (
                  <Link
                    to="/admin"
                    className="max-w-32 truncate text-gray-700 hover:text-indigo-600 px-3 py-2 rounded-md text-sm font-medium"
                  >
                    Admin Panel
                  </Link>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 whitespace-nowrap">
            {user ? (
              <>
                <Link
                  to="/inbox"
                  aria-label="Inbox"
                  className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-700 hover:text-indigo-600"
                  title="Inbox"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                    <path d="M19.5 3.75h-15A2.25 2.25 0 0 0 2.25 6v12A2.25 2.25 0 0 0 4.5 20.25h15A2.25 2.25 0 0 0 21.75 18V6A2.25 2.25 0 0 0 19.5 3.75Zm-15 1.5h15c.414 0 .75.336.75.75v1.19l-7.37 4.91a1.5 1.5 0 0 1-1.66 0L3 7.19V6c0-.414.336-.75.75-.75Zm15 13.5h-15a.75.75 0 0 1-.75-.75V8.99l6.54 4.36a3 3 0 0 0 3.32 0l6.64-4.43V18c0 .414-.336.75-.75.75Z" />
                  </svg>
                  {pendingInboxCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[1.15rem] h-[1.15rem] px-1 rounded-full bg-red-600 text-white text-[10px] leading-[1.15rem] text-center font-semibold">
                      {pendingInboxLabel}
                    </span>
                  )}
                </Link>
                <Link
                  to="/profile"
                  aria-label="Profile"
                  className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-gray-300 bg-gray-100"
                >
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="Profile" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-sm font-semibold text-gray-700">{profileInitial}</span>
                  )}
                </Link>
                <button
                  onClick={handleSignOut}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/auth"
                  className="max-w-20 truncate text-gray-700 hover:text-indigo-600 px-3 py-2 rounded-md text-sm font-medium"
                >
                  Login
                </Link>
                <Link
                  to="/auth?mode=signup"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap"
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
