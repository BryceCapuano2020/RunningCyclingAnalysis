// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RETENTION_UNAVAILABLE } from '../analysis/copy'
import { FileRetention } from './FileRetention'

afterEach(() => {
  cleanup()
})

describe('FileRetention', () => {
  it('shows the choice as checked, with what turning it off deletes as its description', () => {
    render(<FileRetention keepFiles fileRetentionAvailable onChange={vi.fn()} />)

    const choice = screen.getByRole('checkbox', { name: 'Keep original files in my library' })
    expect(choice).toBeChecked()
    expect(choice).toBeEnabled()
    expect(choice).toHaveAccessibleDescription(/Turning this off deletes saved originals/)
  })

  it('reports the value the visitor chooses', () => {
    const onChange = vi.fn()
    render(<FileRetention keepFiles={false} fileRetentionAvailable onChange={onChange} />)

    fireEvent.click(screen.getByRole('checkbox', { name: 'Keep original files in my library' }))

    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('disables the choice and explains why, in plain text, when original storage is unavailable', () => {
    render(<FileRetention keepFiles fileRetentionAvailable={false} onChange={vi.fn()} />)

    expect(
      screen.getByRole('checkbox', { name: 'Keep original files in my library' }),
    ).toBeDisabled()
    const reason = screen.getByText(RETENTION_UNAVAILABLE)
    expect(reason).toBeVisible()
    expect(reason.closest('[role="status"]')).toBeNull()
  })

  it('leaves out the unavailable explanation when original storage is available', () => {
    render(<FileRetention keepFiles={false} fileRetentionAvailable onChange={vi.fn()} />)

    expect(screen.queryByText(RETENTION_UNAVAILABLE)).not.toBeInTheDocument()
  })
})
