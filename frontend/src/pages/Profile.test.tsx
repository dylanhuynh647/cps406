import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Profile from './Profile'
import { useAuth } from '../contexts/AuthContext'

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../lib/api', () => ({
  api: {
    patch: vi.fn(),
  },
}))

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe('Profile page', () => {
  const createClient = () =>
    new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          refetchOnWindowFocus: false,
        },
      },
    })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders profile settings and toggles dark mode preference', async () => {
    const setDarkModePreference = vi.fn().mockResolvedValue(undefined)

    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-1' },
      profile: {
        id: 'user-1',
        email: 'user@example.com',
        full_name: 'Alex User',
        avatar_url: null,
        dark_mode: false,
      },
      loading: false,
      refreshProfile: vi.fn().mockResolvedValue(undefined),
      setDarkModePreference,
      signOut: vi.fn().mockResolvedValue(undefined),
    } as any)

    render(
      <QueryClientProvider client={createClient()}>
        <MemoryRouter>
          <Profile />
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(await screen.findByText('Profile Settings')).toBeInTheDocument()
    expect(screen.getByDisplayValue('user@example.com')).toBeInTheDocument()

    const darkModeToggle = screen.getByRole('checkbox')
    fireEvent.click(darkModeToggle)

    await waitFor(() => {
      expect(setDarkModePreference).toHaveBeenCalledWith(true)
    })
  })

  it('logs out and navigates to auth route', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined)

    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-1' },
      profile: {
        id: 'user-1',
        email: 'user@example.com',
        full_name: 'Alex User',
        avatar_url: null,
        dark_mode: false,
      },
      loading: false,
      refreshProfile: vi.fn().mockResolvedValue(undefined),
      setDarkModePreference: vi.fn().mockResolvedValue(undefined),
      signOut,
    } as any)

    render(
      <QueryClientProvider client={createClient()}>
        <MemoryRouter initialEntries={['/profile']}>
          <Routes>
            <Route path="/profile" element={<Profile />} />
            <Route path="/auth" element={<div>Auth Page</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(await screen.findByText('Profile Settings')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Logout' }))

    await waitFor(() => {
      expect(signOut).toHaveBeenCalledTimes(1)
    })

    expect(await screen.findByText('Auth Page')).toBeInTheDocument()
  })
})
