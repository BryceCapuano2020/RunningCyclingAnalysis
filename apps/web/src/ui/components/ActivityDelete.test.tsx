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
      signedIn
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

  it('says the removal is from the library when signed in, where the saved copy is kept', async () => {
    const user = userEvent.setup()
    renderDelete({ signedIn: true })
    await user.click(screen.getByRole('button', { name: 'Delete Morning run' }))
    expect(screen.getByText('Delete “Morning run”? It is removed from your library.')).toBeTruthy()
  })

  it('says a signed-in delete takes the original file too, and a signed-out one says nothing of files', async () => {
    const user = userEvent.setup()
    renderDelete({ signedIn: true })
    await user.click(screen.getByRole('button', { name: 'Delete Morning run' }))
    expect(screen.getByText('Its original file is deleted too, if one is stored.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveAccessibleDescription(
      /removed from your library\. Its original file is deleted too/,
    )
    cleanup()
    renderDelete({ signedIn: false })
    await user.click(screen.getByRole('button', { name: 'Delete Morning run' }))
    expect(screen.queryByText(/original file/)).toBeNull()
  })

  it('cancels on Escape without deleting, and returns focus to the Delete button', async () => {
    const user = userEvent.setup()
    const onDelete = renderDelete()
    await user.click(screen.getByRole('button', { name: 'Delete Morning run' }))
    await user.keyboard('{Escape}')
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.queryByRole('group')).toBeNull()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Delete Morning run' })).toHaveFocus(),
    )
  })

  it('says the removal is from this browser when signed out, where a summary is only kept', async () => {
    const user = userEvent.setup()
    renderDelete({ signedIn: false })
    await user.click(screen.getByRole('button', { name: 'Delete Morning run' }))
    expect(screen.getByText('Delete “Morning run”? It is removed from this browser.')).toBeTruthy()
    expect(screen.queryByText(/your library/)).toBeNull()
  })

  it('asks in place before it deletes, with Cancel focused', async () => {
    const user = userEvent.setup()
    const onDelete = renderDelete()
    await user.click(screen.getByRole('button', { name: 'Delete Morning run' }))
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByText('Delete “Morning run”? It is removed from your library.')).toBeTruthy()
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
