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
})
