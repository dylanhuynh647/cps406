import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'
import { GLOBAL_THEME_STORAGE_KEY, applyThemeClass, getThemeStorageKey, readBooleanFromStorage } from '../lib/theme'

interface UserProfile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  dark_mode?: boolean | null
}

interface ProjectMembership {
  id: string
  name: string
  description: string | null
  cover_image_url?: string | null
  owner_id: string
  my_role: 'owner' | 'admin' | 'developer' | 'reporter'
  current_phase_number: number
  current_phase_started_at: string
  phase_auto_mode?: 'weekly' | 'biweekly' | 'monthly' | null
  created_at: string
  updated_at: string
}

interface AuthContextType {
  user: User | null
  profile: UserProfile | null
  projects: ProjectMembership[]
  currentProject: ProjectMembership | null
  currentProjectId: string | null
  loading: boolean
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  refreshProjects: () => Promise<void>
  setCurrentProjectId: (projectId: string | null) => void
  setDarkModePreference: (enabled: boolean) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const getProjectStorageKey = (userId: string) => `current-project:${userId}`

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [projects, setProjects] = useState<ProjectMembership[]>([])
  const [currentProjectId, setCurrentProjectIdState] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const profileFetchInFlightRef = useRef(false)
  const profileFetchPendingRef = useRef(false)
  const profileFetchTimeoutRef = useRef<number | null>(null)

  const fetchProfile = async () => {
    if (profileFetchInFlightRef.current) {
      profileFetchPendingRef.current = true
      return
    }

    profileFetchInFlightRef.current = true
    try {
      let response: any = null
      let lastError: any = null

      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          response = await api.get('/user/me')
          break
        } catch (error: any) {
          lastError = error
          if (attempt < 2) {
            await new Promise((resolve) => window.setTimeout(resolve, 200 * (attempt + 1)))
          }
        }
      }

      if (!response) {
        throw lastError
      }

      const fetchedProfile = response.data as UserProfile
      const storedTheme = readBooleanFromStorage(getThemeStorageKey(fetchedProfile.id))
      const resolvedDarkMode = storedTheme !== null
        ? storedTheme
        : typeof fetchedProfile.dark_mode === 'boolean'
          ? fetchedProfile.dark_mode
          : false

      window.localStorage.setItem(GLOBAL_THEME_STORAGE_KEY, String(resolvedDarkMode))
      applyThemeClass(resolvedDarkMode)

      setProfile({
        ...fetchedProfile,
        dark_mode: resolvedDarkMode,
      })
    } catch (error) {
      console.error('Error fetching profile:', error)
      // Preserve any existing profile on transient failures to avoid UI flicker.
      setProfile((current) => current)
    } finally {
      profileFetchInFlightRef.current = false
      if (profileFetchPendingRef.current) {
        profileFetchPendingRef.current = false
        void fetchProfile()
      }
    }
  }

  const resolveSelectedProjectId = (userId: string, nextProjects: ProjectMembership[]) => {
    const stored = window.localStorage.getItem(getProjectStorageKey(userId))
    if (stored && nextProjects.some((project) => project.id === stored)) {
      return stored
    }
    return nextProjects[0]?.id ?? null
  }

  const fetchProjects = async (requestedUserId?: string) => {
    const activeUserId = requestedUserId || user?.id
    if (!activeUserId) {
      setProjects([])
      setCurrentProjectIdState(null)
      return
    }

    try {
      const response = await api.get('/projects')
      const nextProjects = Array.isArray(response.data) ? (response.data as ProjectMembership[]) : []
      setProjects(nextProjects)

      const nextCurrentProjectId = resolveSelectedProjectId(activeUserId, nextProjects)
      setCurrentProjectIdState(nextCurrentProjectId)
      if (nextCurrentProjectId) {
        window.localStorage.setItem(getProjectStorageKey(activeUserId), nextCurrentProjectId)
      } else {
        window.localStorage.removeItem(getProjectStorageKey(activeUserId))
      }
    } catch (error) {
      console.error('Error fetching projects:', error)
      setProjects([])
      setCurrentProjectIdState(null)
    }
  }

  const scheduleProfileFetch = () => {
    if (profileFetchTimeoutRef.current) {
      window.clearTimeout(profileFetchTimeoutRef.current)
    }

    profileFetchTimeoutRef.current = window.setTimeout(() => {
      profileFetchTimeoutRef.current = null
      void fetchProfile()
    }, 0)
  }

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile()
    }
  }

  const refreshProjects = async () => {
    if (user) {
      await fetchProjects(user.id)
    }
  }

  const setCurrentProjectId = (projectId: string | null) => {
    setCurrentProjectIdState(projectId)
    if (!user) {
      return
    }

    if (projectId) {
      window.localStorage.setItem(getProjectStorageKey(user.id), projectId)
    } else {
      window.localStorage.removeItem(getProjectStorageKey(user.id))
    }
  }

  const setDarkModePreference = async (enabled: boolean) => {
    if (!user) {
      return
    }

    const userId = user.id
    applyThemeClass(enabled)
    window.localStorage.setItem(getThemeStorageKey(userId), String(enabled))
    window.localStorage.setItem(GLOBAL_THEME_STORAGE_KEY, String(enabled))

    setProfile((current) =>
      current
        ? {
            ...current,
            dark_mode: enabled,
          }
        : current
    )

    try {
      const response = await api.patch('/user/me', { dark_mode: enabled })
      const resolvedDarkMode =
        typeof response.data?.dark_mode === 'boolean'
          ? response.data.dark_mode
          : enabled

      setProfile((current) =>
        current
          ? {
              ...current,
              ...response.data,
              dark_mode: resolvedDarkMode,
            }
          : current
      )
      window.localStorage.setItem(getThemeStorageKey(userId), String(resolvedDarkMode))
      window.localStorage.setItem(GLOBAL_THEME_STORAGE_KEY, String(resolvedDarkMode))
      applyThemeClass(resolvedDarkMode)
    } catch (error) {
      // Keep the optimistic preference so the user's selected theme does not flicker off.
      console.error('Failed to persist theme preference to backend:', error)
    }
  }

  useEffect(() => {
    const loadingTimeout = window.setTimeout(() => {
      setLoading(false)
    }, 5000)

    // Get initial session
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setUser(session?.user ?? null)
        if (session?.user) {
          const userStoredTheme = readBooleanFromStorage(getThemeStorageKey(session.user.id))
          if (userStoredTheme !== null) {
            applyThemeClass(userStoredTheme)
            window.localStorage.setItem(GLOBAL_THEME_STORAGE_KEY, String(userStoredTheme))
          }
          scheduleProfileFetch()
          void fetchProjects(session.user.id)
        }
      })
      .catch((error) => {
        console.error('Error getting initial session:', error)
        setUser(null)
        setProfile(null)
      })
      .finally(() => {
        window.clearTimeout(loadingTimeout)
        setLoading(false)
      })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        const userStoredTheme = readBooleanFromStorage(getThemeStorageKey(session.user.id))
        if (userStoredTheme !== null) {
          applyThemeClass(userStoredTheme)
          window.localStorage.setItem(GLOBAL_THEME_STORAGE_KEY, String(userStoredTheme))
        }
        scheduleProfileFetch()
        void fetchProjects(session.user.id)
      } else {
        if (profileFetchTimeoutRef.current) {
          window.clearTimeout(profileFetchTimeoutRef.current)
          profileFetchTimeoutRef.current = null
        }
        setProfile(null)
        setProjects([])
        setCurrentProjectIdState(null)
      }
      setLoading(false)
    })

    return () => {
      window.clearTimeout(loadingTimeout)
      if (profileFetchTimeoutRef.current) {
        window.clearTimeout(profileFetchTimeoutRef.current)
      }
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (typeof profile?.dark_mode === 'boolean') {
      applyThemeClass(profile.dark_mode)
      window.localStorage.setItem(GLOBAL_THEME_STORAGE_KEY, String(profile.dark_mode))
    }
  }, [profile?.dark_mode])

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    setProjects([])
    setCurrentProjectIdState(null)
  }

  const currentProject = projects.find((project) => project.id === currentProjectId) || null

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        projects,
        currentProject,
        currentProjectId,
        loading,
        signOut,
        refreshProfile,
        refreshProjects,
        setCurrentProjectId,
        setDarkModePreference,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
