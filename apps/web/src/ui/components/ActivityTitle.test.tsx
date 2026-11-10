// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ActivityTitle } from './ActivityTitle'

afterEach(() => cleanup())

function renderTitle(over: Partial<Parameters<typeof ActivityTitle>[0]> = {}) {
  const onRename = vi.fn()
  const ui = (props: Partial<Parameters<typeof ActivityTitle>[0]>) => (
    <ActivityTitle
      name="Morning run"
      savedId="saved-1"
      onRename={onRename}
      libraryNotice={null}
      libraryError={null}
      {...props}
    />
  )
  const view = render(ui(over))
  return {
    onRename,
    again: (props: Parameters<typeof ActivityTitle>[0]) => view.rerender(ui(props)),
  }
}

describe('ActivityTitle', () => {
  it('shows the name as the page heading with an Edit name button', () => {
    renderTitle()
    expect(screen.getByRole('heading', { level: 1, name: 'Morning run' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Edit name' })).toBeTruthy()
  })

  it('has no Edit name for an activity with no saved copy, or with no way to save', () => {
    renderTitle({ savedId: null })
    expect(screen.queryByRole('button', { name: 'Edit name' })).toBeNull()
    cleanup()
    renderTitle({ onRename: undefined })
    expect(screen.queryByRole('button', { name: 'Edit name' })).toBeNull()
  })

  it('saves the trimmed name on Enter', async () => {
    const user = userEvent.setup()
    const { onRename } = renderTitle()
    await user.click(screen.getByRole('button', { name: 'Edit name' }))
    const field = screen.getByRole('textbox', { name: 'Activity name' })
    expect(field).toHaveValue('Morning run')
    await user.clear(field)
    await user.type(field, '  Tempo loop  {Enter}')
    expect(onRename).toHaveBeenCalledWith('saved-1', 'Tempo loop')
  })

  it('saves with the Save button, and Cancel leaves the name as it was', async () => {
    const user = userEvent.setup()
    const { onRename } = renderTitle()
    await user.click(screen.getByRole('button', { name: 'Edit name' }))
    await user.type(screen.getByRole('textbox', { name: 'Activity name' }), ' 2')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onRename).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { level: 1, name: 'Morning run' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Edit name' }))
    await user.type(screen.getByRole('textbox', { name: 'Activity name' }), ' 2')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onRename).toHaveBeenCalledWith('saved-1', 'Morning run 2')
  })

  it('cancels on Escape, and puts focus back on Edit name', async () => {
    const user = userEvent.setup()
    const { onRename } = renderTitle()
    await user.click(screen.getByRole('button', { name: 'Edit name' }))
    await user.type(screen.getByRole('textbox', { name: 'Activity name' }), 'x{Escape}')
    expect(onRename).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByRole('button', { name: 'Edit name' })).toHaveFocus()
  })

  it('refuses an empty name with a reason, and sends nothing', async () => {
    const user = userEvent.setup()
    const { onRename } = renderTitle()
    await user.click(screen.getByRole('button', { name: 'Edit name' }))
    const field = screen.getByRole('textbox', { name: 'Activity name' })
    await user.clear(field)
    await user.type(field, '   {Enter}')
    expect(onRename).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('1 to 100 characters')
  })

  it('holds the field to 100 characters', async () => {
    const user = userEvent.setup()
    renderTitle()
    await user.click(screen.getByRole('button', { name: 'Edit name' }))
    expect(screen.getByRole('textbox', { name: 'Activity name' })).toHaveAttribute(
      'maxlength',
      '100',
    )
  })

  it('closes without a request when the name is unchanged', async () => {
    const user = userEvent.setup()
    const { onRename } = renderTitle()
    await user.click(screen.getByRole('button', { name: 'Edit name' }))
    await user.type(screen.getByRole('textbox', { name: 'Activity name' }), '{Enter}')
    expect(onRename).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('closes when the library confirms the save, and keeps the field with the reason when it fails', async () => {
    const user = userEvent.setup()
    const { onRename, again } = renderTitle()
    await user.click(screen.getByRole('button', { name: 'Edit name' }))
    await user.type(screen.getByRole('textbox', { name: 'Activity name' }), ' 2{Enter}')
    expect(onRename).toHaveBeenCalledTimes(1)
    again({
      name: 'Morning run',
      savedId: 'saved-1',
      onRename,
      libraryNotice: null,
      libraryError: 'Could not save the name. Offline.',
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the name. Offline.')
    expect(screen.getByRole('textbox', { name: 'Activity name' })).toBeTruthy()
    // A second try that works closes it and shows the new name.
    // Sending a request clears the library's notice and error in the same step.
    again({
      name: 'Morning run',
      savedId: 'saved-1',
      onRename,
      libraryNotice: null,
      libraryError: null,
    })
    await user.type(screen.getByRole('textbox', { name: 'Activity name' }), '{Enter}')
    expect(onRename).toHaveBeenCalledTimes(2)
    again({
      name: 'Morning run 2',
      savedId: 'saved-1',
      onRename,
      libraryNotice: 'Name saved.',
      libraryError: null,
    })
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull())
    expect(screen.getByRole('heading', { level: 1, name: 'Morning run 2' })).toBeTruthy()
  })
})
