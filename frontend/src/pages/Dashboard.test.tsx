import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Dashboard from './Dashboard'
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
    defaults: { baseURL: 'http://localhost:8000/api' },
  },
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
    },
    channel: vi.fn(() => {
      const chain: any = {
        on: vi.fn(() => chain),
        subscribe: vi.fn(() => ({ id: 'dashboard-channel' })),
      }
      return chain
    }),
    removeChannel: vi.fn(),
  },
}))

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe('Dashboard page', () => {
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

    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === '/projects/project-1/members') {
        return {
          data: [
            {
              user_id: 'member-1',
              role: 'developer',
              email: 'dev@example.com',
              full_name: 'Dev One',
              avatar_url: null,
              created_at: '2026-03-01T00:00:00Z',
              updated_at: '2026-03-01T00:00:00Z',
            },
          ],
        }
      }

      if (url === '/projects/project-1/phases') {
        return {
          data: [
            {
              id: 'phase-3',
              project_id: 'project-1',
              phase_number: 3,
              started_at: '2026-03-20T00:00:00Z',
              ended_at: null,
              transition_type: 'manual',
            },
            {
              id: 'phase-2',
              project_id: 'project-1',
              phase_number: 2,
              started_at: '2026-03-10T00:00:00Z',
              ended_at: '2026-03-20T00:00:00Z',
              transition_type: 'manual',
            },
            {
              id: 'phase-1',
              project_id: 'project-1',
              phase_number: 1,
              started_at: '2026-03-01T00:00:00Z',
              ended_at: '2026-03-10T00:00:00Z',
              transition_type: 'initial',
            },
          ],
        }
      }

      if (url === '/projects/project-1/users/search') {
        return {
          data: [
            {
              id: 'new-user-1',
              email: 'new.user@example.com',
              full_name: 'New User',
              is_member: false,
              has_pending_invitation: false,
            },
          ],
        }
      }

      return { data: [] }
    })

    vi.mocked(api.post).mockResolvedValue({ data: { id: 'project-2' } })
    vi.mocked(api.patch).mockResolvedValue({ data: {} })
    vi.mocked(api.delete).mockResolvedValue({ data: {} })
  })

  const renderDashboard = () => {
    const refreshProjects = vi.fn().mockResolvedValue(undefined)
    const setCurrentProjectId = vi.fn()

    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-1', email: 'owner@example.com' },
      profile: { full_name: 'Owner User' },
      loading: false,
      projects: [
        {
          id: 'project-1',
          name: 'Alpha',
          description: 'Main project',
          cover_image_url: null,
          owner_id: 'user-1',
          my_role: 'owner',
          current_phase_number: 2,
          current_phase_started_at: '2026-03-10T00:00:00Z',
          created_at: '2026-03-01T00:00:00Z',
          updated_at: '2026-03-10T00:00:00Z',
        },
      ],
      currentProject: {
        id: 'project-1',
        name: 'Alpha',
        description: 'Main project',
        cover_image_url: null,
        owner_id: 'user-1',
        my_role: 'owner',
        current_phase_number: 2,
        current_phase_started_at: '2026-03-10T00:00:00Z',
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-10T00:00:00Z',
      },
      currentProjectId: 'project-1',
      setCurrentProjectId,
      refreshProjects,
    } as any)

    render(
      <QueryClientProvider client={createClient()}>
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      </QueryClientProvider>
    )

    return { refreshProjects, setCurrentProjectId }
  }

  it('creates a project from create modal', async () => {
    renderDashboard()

    fireEvent.click(screen.getByRole('button', { name: 'Create project' }))
    expect(await screen.findByRole('heading', { name: 'Create Project' })).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Project name'), { target: { value: 'Beta Project' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Project' }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/projects', {
        name: 'Beta Project',
        description: null,
      })
    })
  })

  it('updates member roles, sends invite, and removes member', async () => {
    renderDashboard()

    const memberSearch = await screen.findByPlaceholderText('Search members and invite users by name/email')
    fireEvent.change(memberSearch, { target: { value: 'new' } })

    const addButtons = await screen.findAllByRole('button', { name: 'Add' })
    fireEvent.click(addButtons[0])

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/projects/project-1/member-invitations', {
        user_id: 'new-user-1',
        role: 'developer',
      })
    })

    fireEvent.change(memberSearch, { target: { value: '' } })
    expect(await screen.findByText('Dev One')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Manage Dev One/i }))
    fireEvent.change(screen.getAllByRole('combobox').at(-1) as HTMLSelectElement, { target: { value: 'admin' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Role' }))

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/projects/project-1/members/member-1', { role: 'admin' })
    })

    fireEvent.click(screen.getByRole('button', { name: /Manage Dev One/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove Member' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove Member' }).at(-1) as HTMLButtonElement)

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith('/projects/project-1/members/member-1')
    })
  })

  it('updates phase settings and rolls phases backward and forward', async () => {
    renderDashboard()

    const cadenceSelect = await screen.findByDisplayValue('Manual updates only')
    fireEvent.change(cadenceSelect, { target: { value: 'weekly' } })

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/projects/project-1/phase-settings', {
        phase_auto_mode: 'weekly',
      })
    })

    fireEvent.click(screen.getByRole('button', { name: 'Advance Phase Now' }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/projects/project-1/phases/advance')
    })

    fireEvent.click(screen.getByRole('button', { name: /Phase #1/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Rollback' }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/projects/project-1/phases/1/rollback')
    })

    fireEvent.click(screen.getAllByRole('button', { name: /Phase #3/i }).at(-1) as HTMLButtonElement)
    fireEvent.click(screen.getByRole('button', { name: 'Roll forward' }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/projects/project-1/phases/3/rollforward')
    })
  })

  it('deletes a project through confirmation dialog', async () => {
    renderDashboard()

    fireEvent.click(screen.getByRole('button', { name: 'Edit project' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Project' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete Project' }).at(-1) as HTMLButtonElement)

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith('/projects/project-1')
    })
  })
})
