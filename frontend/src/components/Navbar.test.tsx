import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Navbar } from './Navbar'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn(),
  },
}))

describe('Navbar', () => {
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

  it('renders authenticated navigation and invitation badge count', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-1' },
      profile: { email: 'user@example.com', full_name: 'Alice', avatar_url: null },
      projects: [{ id: 'project-1', name: 'Project One' }],
      currentProjectId: 'project-1',
      setCurrentProjectId: vi.fn(),
    } as any)

    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url.includes('/bugs/assignment-invitations/pending-count')) {
        return { data: { count: 2 } } as any
      }
      if (url.includes('/projects/member-invitations/pending-count')) {
        return { data: { count: 3 } } as any
      }
      return { data: { count: 0 } } as any
    })

    render(
      <QueryClientProvider client={createClient()}>
        <MemoryRouter initialEntries={['/bugs']}>
          <Navbar />
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Artifacts' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Bugs' })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument()
    })
  })

  it('renders login and signup links when user is not authenticated', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      profile: null,
      projects: [],
      currentProjectId: null,
      setCurrentProjectId: vi.fn(),
    } as any)

    render(
      <QueryClientProvider client={createClient()}>
        <MemoryRouter>
          <Navbar />
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(screen.getByRole('link', { name: 'Login' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign Up' })).toBeInTheDocument()
    expect(api.get).not.toHaveBeenCalled()
  })
})
