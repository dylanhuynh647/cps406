import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
})

const resetSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(8, 'Password must be at least 8 characters'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
})

type LoginFormData = z.infer<typeof loginSchema>
type SignupFormData = z.infer<typeof signupSchema>
type ResetFormData = z.infer<typeof resetSchema>

export default function Auth() {
  const [searchParams] = useSearchParams()
  const mode = searchParams.get('mode') || 'login'
  const isResetMode = mode === 'reset'
  const [isLogin, setIsLogin] = useState(mode === 'login')
  const [loading, setLoading] = useState(false)
  const [hasRecoverySession, setHasRecoverySession] = useState(false)
  const [showResetModal, setShowResetModal] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const navigate = useNavigate()
  const { user } = useAuth()

  useEffect(() => {
    if (user && !isResetMode) {
      navigate('/dashboard')
    }
  }, [user, navigate, isResetMode])

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setHasRecoverySession(!!data.session && isResetMode)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return
      if (event === 'PASSWORD_RECOVERY') {
        setHasRecoverySession(!!session)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [isResetMode])

  const {
    register: registerLogin,
    handleSubmit: handleSubmitLogin,
    formState: { errors: errorsLogin },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  const {
    register: registerSignup,
    handleSubmit: handleSubmitSignup,
    formState: { errors: errorsSignup },
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
  })

  const {
    register: registerReset,
    handleSubmit: handleSubmitReset,
    formState: { errors: errorsReset },
  } = useForm<ResetFormData>({
    resolver: zodResolver(resetSchema),
  })

  const onLogin = async (data: LoginFormData) => {
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      })

      if (error) throw error

      toast.success('Logged in successfully!')
      navigate('/dashboard')
    } catch (error: any) {
      toast.error(error.message || 'Failed to log in')
    } finally {
      setLoading(false)
    }
  }

  const onSignup = async (data: SignupFormData) => {
    setLoading(true)
    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            full_name: data.fullName || null,
          },
        },
      })

      if (signUpError) throw signUpError

      toast.success('Account created successfully! Please check your email to verify your account.')
      setIsLogin(true)
    } catch (error: any) {
      toast.error(error.message || 'Failed to create account')
    } finally {
      setLoading(false)
    }
  }

  const handlePasswordReset = async (email: string) => {
    if (!email.trim()) {
      toast.error('Email is required')
      return
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth?mode=reset`,
      })

      if (error) throw error

      toast.success('Password reset email sent! Check your inbox.')
      setShowResetModal(false)
      setResetEmail('')
    } catch (error: any) {
      toast.error(error.message || 'Failed to send password reset email')
    }
  }

  const onResetPassword = async (data: ResetFormData) => {
    if (!hasRecoverySession) {
      toast.error('Invalid or expired password reset session. Request a new reset email.')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: data.password })
      if (error) throw error
      toast.success('Password updated successfully. Please sign in.')
      await supabase.auth.signOut()
      navigate('/auth?mode=login')
    } catch (error: any) {
      toast.error(error.message || 'Failed to update password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            {isResetMode ? 'Reset your password' : isLogin ? 'Sign in to your account' : 'Create a new account'}
          </h2>
        </div>
        <div className="bg-white py-8 px-6 shadow rounded-lg sm:px-10">
          {isResetMode ? (
            <form className="space-y-6" onSubmit={handleSubmitReset(onResetPassword)}>
              {!hasRecoverySession && (
                <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                  Password reset links are one-time and time-limited. Request a new reset email if this session is invalid.
                </div>
              )}

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  New Password
                </label>
                <input
                  {...registerReset('password')}
                  type="password"
                  autoComplete="new-password"
                  className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                  placeholder="New password"
                />
                {errorsReset.password && (
                  <p className="mt-1 text-sm text-red-600">{errorsReset.password.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                  Confirm New Password
                </label>
                <input
                  {...registerReset('confirmPassword')}
                  type="password"
                  autoComplete="new-password"
                  className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                  placeholder="Confirm new password"
                />
                {errorsReset.confirmPassword && (
                  <p className="mt-1 text-sm text-red-600">{errorsReset.confirmPassword.message}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading || !hasRecoverySession}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading ? 'Updating...' : 'Set New Password'}
              </button>
            </form>
          ) : isLogin ? (
            <form className="space-y-6" onSubmit={handleSubmitLogin(onLogin)}>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email address
                </label>
                <input
                  {...registerLogin('email')}
                  type="email"
                  autoComplete="email"
                  className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                  placeholder="Email address"
                />
                {errorsLogin.email && (
                  <p className="mt-1 text-sm text-red-600">{errorsLogin.email.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <input
                  {...registerLogin('password')}
                  type="password"
                  autoComplete="current-password"
                  className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                  placeholder="Password"
                />
                {errorsLogin.password && (
                  <p className="mt-1 text-sm text-red-600">{errorsLogin.password.message}</p>
                )}
              </div>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowResetModal(true)}
                  className="text-sm text-indigo-600 hover:text-indigo-500"
                >
                  Forgot your password?
                </button>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                >
                  {loading ? 'Signing in...' : 'Sign in'}
                </button>
              </div>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setIsLogin(false)}
                  className="text-sm text-indigo-600 hover:text-indigo-500"
                >
                  Don't have an account? Sign up
                </button>
              </div>
            </form>
          ) : (
            <form className="space-y-6" onSubmit={handleSubmitSignup(onSignup)}>
              <div>
                <label htmlFor="fullName" className="block text-sm font-medium text-gray-700">
                  Full Name (optional)
                </label>
                <input
                  {...registerSignup('fullName')}
                  type="text"
                  className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                  placeholder="Full Name"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email address
                </label>
                <input
                  {...registerSignup('email')}
                  type="email"
                  autoComplete="email"
                  className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                  placeholder="Email address"
                />
                {errorsSignup.email && (
                  <p className="mt-1 text-sm text-red-600">{errorsSignup.email.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <input
                  {...registerSignup('password')}
                  type="password"
                  autoComplete="new-password"
                  className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                  placeholder="Password"
                />
                {errorsSignup.password && (
                  <p className="mt-1 text-sm text-red-600">{errorsSignup.password.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                  Confirm Password
                </label>
                <input
                  {...registerSignup('confirmPassword')}
                  type="password"
                  autoComplete="new-password"
                  className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                  placeholder="Confirm Password"
                />
                {errorsSignup.confirmPassword && (
                  <p className="mt-1 text-sm text-red-600">{errorsSignup.confirmPassword.message}</p>
                )}
              </div>

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                >
                  {loading ? 'Creating account...' : 'Sign up'}
                </button>
              </div>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setIsLogin(true)}
                  className="text-sm text-indigo-600 hover:text-indigo-500"
                >
                  Already have an account? Sign in
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {showResetModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setShowResetModal(false)
              setResetEmail('')
            }
          }}
        >
          <div className="w-full max-w-md rounded-lg bg-white border border-gray-200 shadow-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Reset Password</h3>
              <button
                type="button"
                onClick={() => {
                  setShowResetModal(false)
                  setResetEmail('')
                }}
                className="text-gray-600 hover:text-gray-900"
              >
                x
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-3">
              Enter your account email and we will send you a password reset link.
            </p>
            <input
              type="email"
              value={resetEmail}
              onChange={(event) => setResetEmail(event.target.value)}
              placeholder="you@example.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowResetModal(false)
                  setResetEmail('')
                }}
                className="bg-gray-300 hover:bg-gray-400 text-gray-900 border border-gray-400 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white dark:border-gray-500 px-3 py-2 rounded-md text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handlePasswordReset(resetEmail)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-md text-sm"
              >
                Send Reset Link
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
