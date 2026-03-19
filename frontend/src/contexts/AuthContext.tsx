import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'

interface UserProfile {
  id: string
  email: string
  role: 'reporter' | 'developer' | 'admin'
  full_name: string | null
  avatar_url: string | null
}

interface AuthContextType {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
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
      const response = await api.get('/user/me')
      setProfile(response.data)
    } catch (error) {
      console.error('Error fetching profile:', error)
      setProfile(null)
    } finally {
      profileFetchInFlightRef.current = false
      if (profileFetchPendingRef.current) {
        profileFetchPendingRef.current = false
        void fetchProfile()
      }
    }
  }

  const scheduleProfileFetch = () => {
    if (profileFetchTimeoutRef.current) {
      window.clearTimeout(profileFetchTimeoutRef.current)
    }

    profileFetchTimeoutRef.current = window.setTimeout(() => {
      profileFetchTimeoutRef.current = null
      void fetchProfile()
    }, 150)
  }

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile()
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
          scheduleProfileFetch()
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
        scheduleProfileFetch()
      } else {
        if (profileFetchTimeoutRef.current) {
          window.clearTimeout(profileFetchTimeoutRef.current)
          profileFetchTimeoutRef.current = null
        }
        setProfile(null)
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

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut, refreshProfile }}>
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
