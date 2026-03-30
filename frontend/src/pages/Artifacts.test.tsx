import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Artifacts from './Artifacts'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn(),
    defaults: { baseURL: 'http://localhost:8000/api' },
  },
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
    },
  },
}))

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe('Artifacts page', () => {
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
      currentProject: null,
      currentProjectId: null,
    } as any)

    render(
      <QueryClientProvider client={createClient()}>
        <MemoryRouter>
          <Artifacts />
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(screen.getByText('Select a project from the dashboard to view artifacts.')).toBeInTheDocument()
  })

  it('filters artifacts by search query and type', async () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      currentProjectId: 'project-1',
      currentProject: { id: 'project-1', my_role: 'developer' },
    } as any)

    vi.mocked(api.get).mockResolvedValue({
      data: [
        {
          id: 'artifact-1',
          project_id: 'project-1',
          name: 'API design',
          type: 'design_document',
          description: 'Design for auth service',
          reference: 'https://example.com/api-design',
          created_at: '2026-03-01T00:00:00Z',
          created_by: 'user-1',
          updated_at: '2026-03-01T00:00:00Z',
        },
        {
          id: 'artifact-2',
          project_id: 'project-1',
          name: 'Binary dump',
          type: 'binary',
          description: 'Compiled binary',
          reference: '/build/output.bin',
          created_at: '2026-03-10T00:00:00Z',
          created_by: 'user-1',
          updated_at: '2026-03-10T00:00:00Z',
        },
      ],
    })

    render(
      <QueryClientProvider client={createClient()}>
        <MemoryRouter>
          <Artifacts />
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(await screen.findByText('API design')).toBeInTheDocument()
    expect(screen.getByText('Binary dump')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Search artifacts by name, type, or description'), {
      target: { value: 'auth service' },
    })

    expect(screen.getByText('API design')).toBeInTheDocument()
    expect(screen.queryByText('Binary dump')).not.toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Search artifacts by name, type, or description'), {
      target: { value: '' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Show Filter Options' }))
    fireEvent.click(screen.getByRole('button', { name: /design_document/i }))

    await waitFor(() => {
      expect(screen.getByText('API design')).toBeInTheDocument()
      expect(screen.queryByText('Binary dump')).not.toBeInTheDocument()
    })
  })
})
