// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RestoringPage } from './RestoringPage'

describe('RestoringPage', () => {
  it('says the results are being restored, as the page heading, while it is busy', () => {
    const { container } = render(<RestoringPage onFiles={vi.fn()} />)

    expect(
      screen.getByRole('heading', { level: 1, name: 'Restoring your results' }),
    ).toHaveAttribute('id', 'page-heading')
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
  })

  it('offers Add files, so a visitor is never left with nothing to do while it waits', () => {
    render(<RestoringPage onFiles={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Add files' })).toBeInTheDocument()
  })

  it('has no live status of its own, since its heading already says what it is doing', () => {
    render(<RestoringPage onFiles={vi.fn()} />)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
