import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ArtifactNew from './ArtifactNew'
import ArtifactDetail from './ArtifactDetail'
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

describe('Artifact workflows', () => {
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

  it('creates an artifact and persists through API', async () => {
    vi.mocked(useAuth).mockReturnValue({
      currentProjectId: 'project-1',
      currentProject: { id: 'project-1', my_role: 'developer' },
    } as any)

    vi.mocked(api.post).mockResolvedValue({ data: { id: 'artifact-1' } })

    render(
      <QueryClientProvider client={createClient()}>
        <MemoryRouter>
          <ArtifactNew />
        </MemoryRouter>
      </QueryClientProvider>
    )

    fireEvent.change(screen.getByPlaceholderText('Artifact name'), { target: { value: 'API Doc' } })
    fireEvent.change(screen.getByDisplayValue('Select a type'), { target: { value: 'design_document' } })
    fireEvent.change(screen.getByPlaceholderText('Artifact description'), { target: { value: 'Service contract' } })
    fireEvent.change(screen.getByPlaceholderText('https://example.com/artifact or /path/to/file'), {
      target: { value: 'https://example.com/doc' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Create Artifact' }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/artifacts', {
        name: 'API Doc',
        type: 'design_document',
        description: 'Service contract',
        reference: 'https://example.com/doc',
        project_id: 'project-1',
      })
    })
  })

  it('deletes an artifact from detail page for authorized roles', async () => {
    vi.mocked(useAuth).mockReturnValue({
      currentProject: { id: 'project-1', my_role: 'developer' },
      currentProjectId: 'project-1',
    } as any)

    vi.mocked(api.get).mockResolvedValue({
      data: {
        id: 'artifact-1',
        name: 'API Doc',
        type: 'design_document',
        description: 'desc',
        reference: 'https://example.com/doc',
      },
    })
    vi.mocked(api.delete).mockResolvedValue({ data: {} })

    render(
      <QueryClientProvider client={createClient()}>
        <MemoryRouter initialEntries={['/artifacts/artifact-1']}>
          <Routes>
            <Route path="/artifacts/:id" element={<ArtifactDetail />} />
            <Route path="/artifacts" element={<div>Artifacts List</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete' }))

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith('/artifacts/artifact-1', { params: { project_id: 'project-1' } })
    })
  })
})
