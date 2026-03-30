import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent } from '@testing-library/react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Bugs from './Bugs'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
      refreshSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
      signOut: vi.fn(() => Promise.resolve()),
    },
    channel: vi.fn(() => {
      const chain: any = {
        on: vi.fn(() => chain),
        subscribe: vi.fn(() => ({ id: 'mock-channel' })),
      }
      return chain
    }),
    removeChannel: vi.fn(),
  },
}))

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn(),
  },
}))

describe('Bugs page', () => {
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

  it('shows project selection prompt when no project is selected', () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      user: { id: 'user-1' },
      currentProject: null,
      currentProjectId: null,
    } as any)

    render(
      <QueryClientProvider client={createClient()}>
        <MemoryRouter>
          <Bugs />
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(screen.getByText('Select a project from the dashboard to view bugs.')).toBeInTheDocument()
  })

  it('shows loading pulse while auth state is loading', () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: true,
      user: null,
      currentProject: null,
      currentProjectId: null,
    } as any)

    render(
      <QueryClientProvider client={createClient()}>
        <MemoryRouter>
          <Bugs />
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(screen.getByText('Loading bugs')).toBeInTheDocument()
  })

  it('filters and searches bugs from loaded data', async () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      user: { id: 'user-1' },
      currentProject: { id: 'project-1', my_role: 'developer' },
      currentProjectId: 'project-1',
    } as any)

    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === '/bugs') {
        return {
          data: [
            {
              id: 'bug-1',
              title: 'Authentication failure',
              description: 'Login fails with valid token',
              bug_type: 'security',
              status: 'open',
              severity: 'high',
              reporter_id: 'user-1',
              assigned_to: null,
              found_at: '2026-03-01T00:00:00Z',
              fixed_at: null,
              created_at: '2026-03-01T00:00:00Z',
              updated_at: '2026-03-01T00:00:00Z',
              artifact_ids: [],
              artifact_count: 0,
            },
            {
              id: 'bug-2',
              title: 'UI alignment issue',
              description: 'Misaligned dashboard buttons',
              bug_type: 'ui/ux',
              status: 'resolved',
              severity: 'low',
              reporter_id: 'user-1',
              assigned_to: null,
              found_at: '2026-03-02T00:00:00Z',
              fixed_at: null,
              created_at: '2026-03-02T00:00:00Z',
              updated_at: '2026-03-02T00:00:00Z',
              artifact_ids: [],
              artifact_count: 0,
            },
          ],
        }
      }

      if (url === '/artifacts') {
        return { data: [] }
      }

      if (url === '/users/developers' || url === '/users/profiles' || url === '/bugs/assignment-invitations') {
        return { data: [] }
      }

      return { data: {} }
    })

    render(
      <QueryClientProvider client={createClient()}>
        <MemoryRouter>
          <Bugs />
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(await screen.findByText('Authentication failure')).toBeInTheDocument()
    expect(screen.getByText('UI alignment issue')).toBeInTheDocument()

    fireEvent.change(
      screen.getByPlaceholderText('Search bugs by title, description, status, type, severity, reporter, or artifact'),
      { target: { value: 'authentication' } }
    )

    expect(screen.getByText('Authentication failure')).toBeInTheDocument()
    expect(screen.queryByText('UI alignment issue')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show Filter Options' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))

    expect(screen.getByText('Authentication failure')).toBeInTheDocument()
    expect(screen.queryByText('UI alignment issue')).not.toBeInTheDocument()
  })
})
