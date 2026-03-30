import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Auth from './Auth'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      updateUser: vi.fn(),
      signOut: vi.fn(),
    },
  },
}))

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe('Auth page', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(useAuth).mockReturnValue({ user: null } as any)

    vi.mocked(supabase.auth.getSession as any).mockResolvedValue({
      data: { session: null },
    })

    vi.mocked(supabase.auth.onAuthStateChange as any).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    })

    vi.mocked(supabase.auth.resetPasswordForEmail as any).mockResolvedValue({ error: null })
    vi.mocked(supabase.auth.signInWithPassword as any).mockResolvedValue({ error: null })
    vi.mocked(supabase.auth.signUp as any).mockResolvedValue({ error: null })
    vi.mocked(supabase.auth.updateUser as any).mockResolvedValue({ error: null })
    vi.mocked(supabase.auth.signOut as any).mockResolvedValue({ error: null })
  })

  it('switches from login mode to signup mode', async () => {
    render(
      <MemoryRouter initialEntries={['/auth?mode=login']}>
        <Auth />
      </MemoryRouter>
    )

    expect(screen.getByText('Sign in to your account')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: "Don't have an account? Sign up" }))

    expect(await screen.findByText('Create a new account')).toBeInTheDocument()
  })

  it('opens password reset modal and sends reset link', async () => {
    render(
      <MemoryRouter initialEntries={['/auth?mode=login']}>
        <Auth />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Forgot your password?' }))

    expect(screen.getByText('Reset Password')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'user@example.com' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Send Reset Link' }))

    await waitFor(() => {
      expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
        'user@example.com',
        expect.objectContaining({
          redirectTo: expect.stringContaining('/auth?mode=reset'),
        })
      )
    })
  })

  it('submits login credentials and calls sign in API', async () => {
    render(
      <MemoryRouter initialEntries={['/auth?mode=login']}>
        <Auth />
      </MemoryRouter>
    )

    fireEvent.change(screen.getByPlaceholderText('Email address'), {
      target: { value: 'dev@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'password123' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => {
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'dev@example.com',
        password: 'password123',
      })
    })
  })

  it('creates an account with signup flow', async () => {
    render(
      <MemoryRouter initialEntries={['/auth?mode=login']}>
        <Auth />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: "Don't have an account? Sign up" }))

    fireEvent.change(screen.getByPlaceholderText('Full Name'), {
      target: { value: 'Alex User' },
    })
    fireEvent.change(screen.getByPlaceholderText('Email address'), {
      target: { value: 'alex@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'password123' },
    })
    fireEvent.change(screen.getByPlaceholderText('Confirm Password'), {
      target: { value: 'password123' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }))

    await waitFor(() => {
      expect(supabase.auth.signUp).toHaveBeenCalledWith({
        email: 'alex@example.com',
        password: 'password123',
        options: {
          data: {
            full_name: 'Alex User',
          },
        },
      })
    })
  })

  it('updates password in reset mode and signs out recovery session', async () => {
    vi.mocked(supabase.auth.getSession as any).mockResolvedValue({
      data: { session: { access_token: 'token' } },
    })
    vi.mocked(supabase.auth.onAuthStateChange as any).mockImplementation((callback: any) => {
      callback('PASSWORD_RECOVERY', { access_token: 'token' })
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })

    render(
      <MemoryRouter initialEntries={['/auth?mode=reset']}>
        <Auth />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Set New Password' })).toBeEnabled()
    })

    fireEvent.change(screen.getByPlaceholderText('New password'), {
      target: { value: 'newpassword123' },
    })
    fireEvent.change(screen.getByPlaceholderText('Confirm new password'), {
      target: { value: 'newpassword123' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Set New Password' }))

    await waitFor(() => {
      expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'newpassword123' })
      expect(supabase.auth.signOut).toHaveBeenCalledTimes(1)
    })
  })
})
