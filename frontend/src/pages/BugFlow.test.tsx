import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import BugNew from './BugNew'
import BugDetail from './BugDetail'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe('Bug workflows', () => {
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

  it('creates a bug after duplicate check', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-1' },
      loading: false,
      currentProject: { id: 'project-1', my_role: 'developer' },
      currentProjectId: 'project-1',
    } as any)

    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === '/artifacts') return { data: [] }
      if (url === '/users/developers') return { data: [] }
      if (url.startsWith('/bugs/')) return { data: { id: 'bug-1', title: 'Auth failure' } }
      return { data: [] }
    })

    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === '/bugs/duplicate-candidates') return { data: { candidates: [] } }
      if (url === '/bugs') return { data: { id: 'bug-1' } }
      return { data: {} }
    })

    render(
      <QueryClientProvider client={createClient()}>
        <MemoryRouter>
          <BugNew />
        </MemoryRouter>
      </QueryClientProvider>
    )

    fireEvent.change(screen.getByPlaceholderText('Bug title'), { target: { value: 'Auth failure' } })
    fireEvent.change(screen.getByPlaceholderText('Detailed bug description'), { target: { value: 'Login fails on valid token' } })

    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[0], { target: { value: 'security' } })
    fireEvent.change(selects[2], { target: { value: 'high' } })

    fireEvent.click(screen.getByRole('button', { name: 'Create Bug' }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/bugs/duplicate-candidates', {
        project_id: 'project-1',
        title: 'Auth failure',
        description: 'Login fails on valid token',
        limit: 5,
      })
    })

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/bugs', expect.objectContaining({
        project_id: 'project-1',
        title: 'Auth failure',
      }))
    })
  })

  it('shows duplicate candidates and allows creating anyway', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-1' },
      loading: false,
      currentProject: { id: 'project-1', my_role: 'developer' },
      currentProjectId: 'project-1',
    } as any)

    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === '/artifacts') return { data: [] }
      if (url === '/users/developers') return { data: [] }
      if (url.startsWith('/bugs/')) {
        return {
          data: {
            id: 'bug-existing',
            title: 'Existing auth bug',
            description: 'existing issue',
            status: 'open',
            severity: 'high',
          },
        }
      }
      return { data: [] }
    })

    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === '/bugs/duplicate-candidates') {
        return {
          data: {
            candidates: [
              {
                id: 'bug-existing',
                title: 'Existing auth bug',
                status: 'open',
                severity: 'high',
                similarity_score: 0.92,
              },
            ],
          },
        }
      }
      if (url === '/bugs') return { data: { id: 'bug-new' } }
      return { data: {} }
    })

    render(
      <QueryClientProvider client={createClient()}>
        <MemoryRouter>
          <BugNew />
        </MemoryRouter>
      </QueryClientProvider>
    )

    fireEvent.change(screen.getByPlaceholderText('Bug title'), { target: { value: 'Auth issue' } })
    fireEvent.change(screen.getByPlaceholderText('Detailed bug description'), { target: { value: 'description' } })
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'security' } })

    fireEvent.click(screen.getByRole('button', { name: 'Create Bug' }))

    expect(await screen.findByText('Potential duplicate bugs found')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Create as New' }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/bugs', expect.objectContaining({
        title: 'Auth issue',
      }))
    })
  })

  it('deletes a bug from bug detail page for authorized roles', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-1' },
      currentProject: { id: 'project-1', my_role: 'developer' },
      currentProjectId: 'project-1',
    } as any)

    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url.startsWith('/bugs/')) {
        return {
          data: {
            id: 'bug-1',
            title: 'Auth bug',
            description: 'desc',
            bug_type: 'security',
            status: 'open',
            severity: 'high',
            assigned_to: null,
            reporter_id: 'user-1',
            artifacts: [],
          },
        }
      }
      if (url === '/artifacts') return { data: [] }
      if (url === '/users/developers') return { data: [] }
      if (url === '/users/profiles') return { data: [] }
      if (url === '/bugs') return { data: [] }
      return { data: [] }
    })

    vi.mocked(api.delete).mockResolvedValue({ data: {} })

    render(
      <QueryClientProvider client={createClient()}>
        <MemoryRouter initialEntries={['/bugs/bug-1']}>
          <Routes>
            <Route path="/bugs/:id" element={<BugDetail />} />
            <Route path="/bugs" element={<div>Bugs List</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete' }))

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith('/bugs/bug-1', { params: { project_id: 'project-1' } })
    })
  })
})
