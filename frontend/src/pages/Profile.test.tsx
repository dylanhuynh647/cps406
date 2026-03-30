import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Profile from './Profile'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'

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

  it('updates full name and avatar via profile update API', async () => {
    const refreshProfile = vi.fn().mockResolvedValue(undefined)

    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-1' },
      profile: {
        id: 'user-1',
        email: 'user@example.com',
        full_name: 'Old Name',
        avatar_url: null,
        dark_mode: false,
      },
      loading: false,
      refreshProfile,
      setDarkModePreference: vi.fn().mockResolvedValue(undefined),
      signOut: vi.fn().mockResolvedValue(undefined),
    } as any)

    const originalFileReader = globalThis.FileReader
    class MockFileReader {
      public result: string | null = 'data:image/png;base64,AAAA'
      public onload: null | (() => void) = null
      public onerror: null | (() => void) = null

      readAsDataURL() {
        if (this.onload) {
          this.onload()
        }
      }
    }
    ;(globalThis as any).FileReader = MockFileReader

    try {
      render(
        <QueryClientProvider client={createClient()}>
          <MemoryRouter>
            <Profile />
          </MemoryRouter>
        </QueryClientProvider>
      )

      expect(await screen.findByText('Profile Settings')).toBeInTheDocument()

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const avatarFile = new File(['avatar'], 'avatar.png', { type: 'image/png' })
      fireEvent.change(fileInput, { target: { files: [avatarFile] } })

      const nameInput = screen.getByPlaceholderText('Enter your full name')
      fireEvent.change(nameInput, { target: { value: 'Updated Name' } })
      fireEvent.click(screen.getByRole('button', { name: 'Update Profile' }))

      await waitFor(() => {
        expect(api.patch).toHaveBeenCalledWith('/user/me', {
          full_name: 'Updated Name',
          avatar_url: 'data:image/png;base64,AAAA',
        })
      })

      await waitFor(() => {
        expect(refreshProfile).toHaveBeenCalledTimes(1)
      })
    } finally {
      ;(globalThis as any).FileReader = originalFileReader
    }
  })
})
