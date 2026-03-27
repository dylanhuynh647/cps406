import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Inbox from './Inbox'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}))

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe('Inbox page', () => {
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
    vi.mocked(api.patch).mockResolvedValue({ data: {} } as any)
  })

  it('renders invitations and opens bug details from inbox action', async () => {
    const setCurrentProjectId = vi.fn()

    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-1' },
      setCurrentProjectId,
      refreshProjects: vi.fn().mockResolvedValue(undefined),
    } as any)

    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url.includes('/bugs/assignment-invitations/inbox')) {
        return {
          data: [
            {
              id: 'bug-invite-1',
              bug_id: 'bug-123',
              project_id: 'project-1',
              invited_by: 'owner-1',
              status: 'pending',
              created_at: '2026-01-01T00:00:00.000Z',
              bug_title: 'Crash on dashboard',
              project_name: 'Alpha',
            },
          ],
        } as any
      }

      if (url.includes('/projects/member-invitations/inbox')) {
        return {
          data: [
            {
              id: 'project-invite-1',
              project_id: 'project-1',
              invited_by: 'owner-1',
              role: 'developer',
              status: 'pending',
              created_at: '2026-01-02T00:00:00.000Z',
              project_name: 'Alpha',
            },
          ],
        } as any
      }

      return { data: [] } as any
    })

    render(
      <QueryClientProvider client={createClient()}>
        <MemoryRouter initialEntries={['/inbox']}>
          <Routes>
            <Route path="/inbox" element={<Inbox />} />
            <Route path="/bugs/:id" element={<div>Bug Detail Route</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(await screen.findByText('Inbox')).toBeInTheDocument()
    expect(screen.getByText('Bug Assignment Invite')).toBeInTheDocument()
    expect(screen.getByText('Project Membership Invite')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'View bug' }))

    await waitFor(() => {
      expect(setCurrentProjectId).toHaveBeenCalledWith('project-1')
    })

    expect(await screen.findByText('Bug Detail Route')).toBeInTheDocument()
  })

  it('shows empty-state message when inbox has no invitations', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-1' },
      setCurrentProjectId: vi.fn(),
      refreshProjects: vi.fn().mockResolvedValue(undefined),
    } as any)

    vi.mocked(api.get).mockResolvedValue({ data: [] } as any)

    render(
      <QueryClientProvider client={createClient()}>
        <MemoryRouter>
          <Inbox />
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(await screen.findByText('No invitations found for this filter.')).toBeInTheDocument()
  })
})
