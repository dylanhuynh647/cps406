import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { LoadingPulse } from './LoadingPulse'

describe('LoadingPulse', () => {
  it('renders default label text', () => {
    render(<LoadingPulse />)
    expect(screen.getByText('Syncing workspace')).toBeInTheDocument()
  })

  it('renders custom label and fullscreen container classes', () => {
    const { container } = render(<LoadingPulse label="Loading dashboard" fullscreen />)
    expect(screen.getByText('Loading dashboard')).toBeInTheDocument()
    expect(container.firstChild).toHaveClass('min-h-screen')
    expect(container.firstChild).toHaveClass('items-center')
    expect(container.firstChild).toHaveClass('justify-center')
  })

  it('uses inline container by default', () => {
    const { container } = render(<LoadingPulse label="Inline loading" />)
    expect(screen.getByText('Inline loading')).toBeInTheDocument()
    expect(container.firstChild).not.toHaveClass('min-h-screen')
  })
})