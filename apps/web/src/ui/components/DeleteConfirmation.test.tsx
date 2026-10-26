// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from './ConfirmDialog'
import { DeleteConfirmation } from './DeleteConfirmation'
import { readStylesheet, ruleBody } from './stylesheet'

const libraryCss = await readStylesheet(import.meta.url, './SavedLibrary.css')

afterEach(() => {
  cleanup()
})

const DESCRIPTION = 'This removes the activity’s summary from this browser.'

function renderConfirmation(busy = false, critical = true) {
  const onCancel = vi.fn()
  const onConfirm = vi.fn()
  render(
    <>
      <DeleteConfirmation
        name="Morning run"
        description={DESCRIPTION}
        busy={busy}
        critical={critical}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
      <button type="button">Elsewhere</button>
    </>,
  )
  const dialog = screen.getByRole('group', { name: 'Delete “Morning run”?' })
  return { dialog, onCancel, onConfirm }
}

describe('DeleteConfirmation', () => {
  it('sets the activity name in its own span, so the heading does not change its case', () => {
    const { dialog } = renderConfirmation()
    const heading = within(dialog).getByRole('heading')
    expect(heading.querySelector('.saved-library__confirm-name')).toHaveTextContent('Morning run')
  })

  it('describes what the delete removes, as the caller words it', () => {
    const { dialog } = renderConfirmation()
    expect(dialog).toHaveAccessibleDescription(DESCRIPTION)
  })

  it('takes focus on its heading when it opens, so a stray Enter does not delete', async () => {
    const user = userEvent.setup()
    const { dialog, onConfirm } = renderConfirmation()
    expect(within(dialog).getByRole('heading')).toHaveFocus()

    await user.keyboard('{Enter}')
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('cancels without deleting', () => {
    const { dialog, onCancel, onConfirm } = renderConfirmation()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('confirms the delete with the one Delete button', () => {
    const { onCancel, onConfirm } = renderConfirmation()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('keeps the delete button focusable while busy, and ignores clicks on it', () => {
    const { onConfirm } = renderConfirmation(true)
    const button = screen.getByRole('button', { name: 'Delete' })

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
    const button = screen.getByRole('button', { name: 'Delete' })
    button.focus()

    rerender(<DeleteConfirmation {...props} busy />)
    expect(button).toHaveFocus()
  })

  it('cancels on Escape from outside its card when no modal dialog is open', () => {
    const { onCancel, onConfirm } = renderConfirmation()
    fireEvent.keyDown(screen.getByRole('button', { name: 'Elsewhere' }), { key: 'Escape' })

    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('leaves Escape from outside its card to a modal dialog that is open over it', () => {
    const onCancel = vi.fn()
    render(
      <>
        <DeleteConfirmation
          name="Morning run"
          description={DESCRIPTION}
          busy={false}
          onCancel={onCancel}
          onConfirm={vi.fn()}
        />
        <ConfirmDialog
          open
          title="Remove all 1 activity kept in this browser?"
          description="This cannot be undone."
          confirmLabel="Remove all"
          opener={null}
          onConfirm={vi.fn()}
          onClose={vi.fn()}
        />
      </>,
    )
    const removal = screen.getByRole('alertdialog', {
      name: 'Remove all 1 activity kept in this browser?',
    })

    fireEvent.keyDown(within(removal).getByRole('button', { name: 'Cancel' }), { key: 'Escape' })

    expect(onCancel).not.toHaveBeenCalled()
  })

  it('cancels on Escape from inside its own card, even with a modal dialog open', () => {
    const onCancel = vi.fn()
    render(
      <>
        <DeleteConfirmation
          name="Morning run"
          description={DESCRIPTION}
          busy={false}
          onCancel={onCancel}
          onConfirm={vi.fn()}
        />
        <ConfirmDialog
          open
          title="Remove all 1 activity kept in this browser?"
          description="This cannot be undone."
          confirmLabel="Remove all"
          opener={null}
          onConfirm={vi.fn()}
          onClose={vi.fn()}
        />
      </>,
    )

    const card = screen.getByRole('group', { name: 'Delete “Morning run”?' })
    fireEvent.keyDown(within(card).getByRole('button', { name: 'Cancel' }), { key: 'Escape' })

    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('keeps Tab inside the dialog, wrapping from the delete button to Cancel', async () => {
    const user = userEvent.setup()
    const { dialog } = renderConfirmation()
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' })
    const confirm = within(dialog).getByRole('button', { name: 'Delete' })

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
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toHaveFocus()
  })

  it('wraps Shift+Tab from the heading it opens on to the delete button', async () => {
    const user = userEvent.setup()
    const { dialog } = renderConfirmation()
    expect(within(dialog).getByRole('heading')).toHaveFocus()

    await user.tab({ shift: true })
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toHaveFocus()
  })

  it('leaves Tab alone when a removal dialog opened over it, so focus reaches that dialog', async () => {
    const user = userEvent.setup()
    render(
      <>
        <DeleteConfirmation
          name="Morning run"
          description={DESCRIPTION}
          busy={false}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
        />
        <ConfirmDialog
          open
          title="Remove all 1 activity kept in this browser?"
          description="This cannot be undone."
          confirmLabel="Remove all"
          opener={null}
          onConfirm={vi.fn()}
          onClose={vi.fn()}
        />
      </>,
    )
    const removal = screen.getByRole('alertdialog', {
      name: 'Remove all 1 activity kept in this browser?',
    })
    const cancel = within(removal).getByRole('button', { name: 'Cancel' })
    cancel.focus()

    await user.tab()

    expect(within(removal).getByRole('button', { name: 'Remove all' })).toHaveFocus()
  })
})

describe('DeleteConfirmation as an inline group', () => {
  it('is a named group, not an alert dialog, since it does not take over the page', () => {
    renderConfirmation()
    expect(screen.getByRole('group', { name: 'Delete “Morning run”?' })).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})

describe('DeleteConfirmation card tone', () => {
  it('is the red card for an original file, with the danger border', () => {
    const { dialog } = renderConfirmation(false, true)
    expect(dialog).toHaveClass('saved-library__confirmation')
    expect(dialog).not.toHaveClass('saved-library__confirmation--quiet')
    expect(ruleBody(libraryCss, '.saved-library__confirmation')).toMatch(
      /border:\s*1px solid var\(--status-critical\)/,
    )
  })

  it('is the neutral card for a summary, whose border is the ordinary rule colour', () => {
    const { dialog } = renderConfirmation(false, false)
    expect(dialog).toHaveClass('saved-library__confirmation--quiet')
    expect(ruleBody(libraryCss, '.saved-library__confirmation--quiet')).toMatch(
      /border-color:\s*var\(--border\)/,
    )
  })
})
