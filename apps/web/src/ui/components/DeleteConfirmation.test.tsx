// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeleteConfirmation } from './DeleteConfirmation'

afterEach(() => {
  cleanup()
})

const DESCRIPTION =
  'This permanently deletes the activity’s summary kept in this browser. This cannot be undone.'

function renderConfirmation(busy = false) {
  const onCancel = vi.fn()
  const onConfirm = vi.fn()
  render(
    <>
      <DeleteConfirmation
        name="Morning run"
        description={DESCRIPTION}
        busy={busy}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
      <button type="button">Elsewhere</button>
    </>,
  )
  const dialog = screen.getByRole('alertdialog', { name: 'Delete “Morning run”?' })
  return { dialog, onCancel, onConfirm }
}

describe('DeleteConfirmation', () => {
  it('describes what the delete removes, as the caller words it', () => {
    const { dialog } = renderConfirmation()
    expect(dialog).toHaveAccessibleDescription(DESCRIPTION)
  })

  it('takes focus on its heading when it opens', () => {
    const { dialog } = renderConfirmation()
    expect(within(dialog).getByRole('heading')).toHaveFocus()
  })

  it('cancels without deleting', () => {
    const { dialog, onCancel, onConfirm } = renderConfirmation()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('confirms the delete', () => {
    const { onCancel, onConfirm } = renderConfirmation()
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))

    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('keeps the delete button focusable while busy, and ignores clicks on it', () => {
    const { onConfirm } = renderConfirmation(true)
    const button = screen.getByRole('button', { name: 'Delete permanently' })

    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).not.toBeDisabled()
    fireEvent.click(button)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('keeps focus on the delete button when the dialog turns busy', () => {
    const props = {
      name: 'Morning run',
      description: DESCRIPTION,
      onCancel: vi.fn(),
      onConfirm: vi.fn(),
    }
    const { rerender } = render(<DeleteConfirmation {...props} busy={false} />)
    const button = screen.getByRole('button', { name: 'Delete permanently' })
    button.focus()

    rerender(<DeleteConfirmation {...props} busy />)
    expect(button).toHaveFocus()
  })

  it('cancels on Escape even when focus is outside the dialog', () => {
    const { onCancel, onConfirm } = renderConfirmation()
    fireEvent.keyDown(screen.getByRole('button', { name: 'Elsewhere' }), { key: 'Escape' })

    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('keeps Tab inside the dialog, wrapping from the delete button to Cancel', async () => {
    const user = userEvent.setup()
    const { dialog } = renderConfirmation()
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' })
    const confirm = within(dialog).getByRole('button', { name: 'Delete permanently' })

    await user.tab()
    expect(cancel).toHaveFocus()
    await user.tab()
    expect(confirm).toHaveFocus()
    await user.tab()
    expect(cancel).toHaveFocus()
  })

  it('wraps Shift+Tab from Cancel, the first control, to the delete button', async () => {
    const user = userEvent.setup()
    const { dialog } = renderConfirmation()
    await user.tab()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()

    await user.tab({ shift: true })
    expect(within(dialog).getByRole('button', { name: 'Delete permanently' })).toHaveFocus()
  })

  it('wraps Shift+Tab from the heading it opens on to the delete button', async () => {
    const user = userEvent.setup()
    const { dialog } = renderConfirmation()
    expect(within(dialog).getByRole('heading')).toHaveFocus()

    await user.tab({ shift: true })
    expect(within(dialog).getByRole('button', { name: 'Delete permanently' })).toHaveFocus()
  })
})
