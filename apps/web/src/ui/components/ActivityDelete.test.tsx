// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ActivityDelete } from './ActivityDelete'

afterEach(() => {
  cleanup()
})

function renderDelete(overrides: Partial<Parameters<typeof ActivityDelete>[0]> = {}) {
  const onDelete = vi.fn()
  render(
    <ActivityDelete
      savedId="saved-1"
      name="Morning run"
      busy={false}
      onDelete={onDelete}
      {...overrides}
    />,
  )
  return onDelete
}

describe('ActivityDelete', () => {
  it('names its activity on the button, since a list has many Delete buttons', () => {
    renderDelete()
    expect(screen.getByRole('button', { name: 'Delete Morning run' })).toBeTruthy()
  })

  it('asks in place before it deletes, with Cancel focused', async () => {
    const user = userEvent.setup()
    const onDelete = renderDelete()
    await user.click(screen.getByRole('button', { name: 'Delete Morning run' }))
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByText('Delete Morning run? It is removed from your library.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalledWith('saved-1')
  })

  it('closes on Cancel without deleting, and returns focus to the Delete button', async () => {
    const user = userEvent.setup()
    const onDelete = renderDelete()
    await user.click(screen.getByRole('button', { name: 'Delete Morning run' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Delete Morning run' })).toHaveFocus(),
    )
  })

  it('does not open the question while a removal is running', async () => {
    const user = userEvent.setup()
    renderDelete({ busy: true })
    const button = screen.getByRole('button', { name: 'Delete Morning run' })
    expect(button.getAttribute('aria-disabled')).toBe('true')
    await user.click(button)
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
  })
})
