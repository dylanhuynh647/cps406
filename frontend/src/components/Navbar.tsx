import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'
import logoIcon from '../assets/NavBar/logo-icon.svg'

export const Navbar = () => {
  const { user, profile, projects, currentProjectId, setCurrentProjectId } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const profileInitial = (profile?.full_name || profile?.email || 'U').charAt(0).toUpperCase()

  const { data: bugInvitationCountData } = useQuery<{ count: number }>({
    queryKey: ['bug-invitation-pending-count', user?.id],
    queryFn: async () => {
      const response = await api.get('/bugs/assignment-invitations/pending-count')
      return response.data
    },
    enabled: !!user,
    refetchInterval: 30_000,
  })

  const { data: projectInvitationCountData } = useQuery<{ count: number }>({
    queryKey: ['project-invitation-pending-count', user?.id],
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

  useEffect(() => {
    setIsMobileMenuOpen(false)
  }, [location.pathname])

  const isRouteActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`)

  const getTabClassName = (isActive: boolean) =>
    `max-w-32 truncate px-3 py-2 rounded-md text-sm font-medium transition-all ${
      isActive
        ? 'text-indigo-700 bg-indigo-50 ring-1 ring-indigo-200 shadow-[0_0_14px_rgba(79,70,229,0.22)] dark:text-indigo-200 dark:bg-indigo-950/60 dark:ring-indigo-500/50'
        : 'text-gray-700 hover:text-indigo-600 dark:text-gray-200 dark:hover:text-indigo-300'
    }`

  const getMobileTabClassName = (isActive: boolean) =>
    `block w-full rounded-md px-3 py-2.5 text-sm font-medium transition-all ${
      isActive
        ? 'bg-indigo-100 text-indigo-800 ring-1 ring-indigo-200 dark:bg-indigo-900/60 dark:text-indigo-100 dark:ring-indigo-500/60'
        : 'bg-gray-50 text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
    }`

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200 dark:bg-gray-900 dark:border-gray-800 fixed top-0 left-0 right-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 gap-4 items-center">
          <div className="flex items-center gap-2 min-w-0">
            <Link to="/" className="flex items-center" aria-label="DeBUG home">
              <img src={logoIcon} alt="DeBUG logo" className="h-16 w-16" loading="eager" decoding="async" />
              <span className="ml-2 text-3xl leading-none font-bold text-[#3D6BBA]">DeBUG</span>
            </Link>
            {user && projects.length > 0 && (
              <select
                value={currentProjectId || ''}
                onChange={(event) => switchProject(event.target.value)}
                className="hidden lg:block ml-2 border border-gray-300 dark:border-gray-700 rounded-md text-sm px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-100"
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
              <div className="ml-3 hidden lg:flex items-center gap-2 whitespace-nowrap pr-2">
                <Link
                  to="/dashboard"
                  className={getTabClassName(isRouteActive('/dashboard'))}
                >
                  Dashboard
                </Link>
                <Link
                  to="/artifacts"
                  className={getTabClassName(isRouteActive('/artifacts'))}
                >
                  Artifacts
                </Link>
                <Link
                  to="/bugs"
                  className={getTabClassName(isRouteActive('/bugs'))}
                >
                  Bugs
                </Link>
                {profile?.role === 'admin' && (
                  <Link
                    to="/admin"
                    className={getTabClassName(isRouteActive('/admin'))}
                  >
                    Admin Panel
                  </Link>
                )}
              </div>
            )}
          </div>
          <div className="hidden lg:flex items-center gap-2 whitespace-nowrap">
            {user ? (
              <>
                <Link
                  to="/inbox"
                  className={`relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-300 bg-white transition-all ${
                    isRouteActive('/inbox')
                      ? 'text-indigo-700 ring-1 ring-indigo-200 shadow-[0_0_14px_rgba(79,70,229,0.22)] dark:text-indigo-200 dark:ring-indigo-500/50'
                      : 'text-gray-700 hover:text-indigo-600 dark:text-gray-200 dark:hover:text-indigo-300'
                  }`}
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
                  className={`inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 transition-all ${
                    isRouteActive('/profile')
                      ? 'ring-1 ring-indigo-200 shadow-[0_0_14px_rgba(79,70,229,0.22)]'
                      : ''
                  }`}
                >
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="Profile" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                  ) : (
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-100">{profileInitial}</span>
                  )}
                </Link>
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
                  className="bg-blue-800 hover:bg-blue-900 text-white px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap"
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsMobileMenuOpen((previous) => !previous)}
            className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-md border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200"
            aria-label="Toggle navigation menu"
            aria-expanded={isMobileMenuOpen}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        </div>

        {isMobileMenuOpen && (
          <div className="lg:hidden border-t border-gray-200 dark:border-gray-800 py-4 space-y-3">
            {user && projects.length > 0 && (
              <select
                value={currentProjectId || ''}
                onChange={(event) => switchProject(event.target.value)}
                className="w-full border border-gray-300 dark:border-gray-700 rounded-md text-sm px-3 py-2.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-100"
                aria-label="Select current project"
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            )}

            {user ? (
              <>
                <Link to="/dashboard" className={getMobileTabClassName(isRouteActive('/dashboard'))}>Dashboard</Link>
                <Link to="/artifacts" className={getMobileTabClassName(isRouteActive('/artifacts'))}>Artifacts</Link>
                <Link to="/bugs" className={getMobileTabClassName(isRouteActive('/bugs'))}>Bugs</Link>
                {profile?.role === 'admin' && (
                  <Link to="/admin" className={getMobileTabClassName(isRouteActive('/admin'))}>Admin Panel</Link>
                )}
                <div className="flex items-center gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                  <Link
                    to="/inbox"
                    className={`relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 ${
                      isRouteActive('/inbox')
                        ? 'text-indigo-700 ring-1 ring-indigo-200 shadow-[0_0_14px_rgba(79,70,229,0.22)] dark:text-indigo-200 dark:ring-indigo-500/50'
                        : 'text-gray-700 dark:text-gray-200'
                    }`}
                    aria-label="Inbox"
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
                    className={`inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 ${
                      isRouteActive('/profile')
                        ? 'ring-1 ring-indigo-200 shadow-[0_0_14px_rgba(79,70,229,0.22)]'
                        : ''
                    }`}
                    aria-label="Profile"
                  >
                    {profile?.avatar_url ? (
                      <img src={profile.avatar_url} alt="Profile" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                    ) : (
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-100">{profileInitial}</span>
                    )}
                  </Link>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 pt-1">
                <Link to="/auth" className={getMobileTabClassName(isRouteActive('/auth'))}>Login</Link>
                <Link
                  to="/auth?mode=signup"
                  className="bg-blue-800 hover:bg-blue-900 text-white px-4 py-2 rounded-md text-sm font-medium"
                >
                  Sign Up
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  )
}

