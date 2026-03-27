import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Bugs from './Bugs'
import { useAuth } from '../contexts/AuthContext'

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
})
