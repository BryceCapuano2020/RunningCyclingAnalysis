// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readStylesheet, ruleBody } from './stylesheet'
import { ConfirmActions } from './ConfirmActions'

const actionsCss = await readStylesheet(import.meta.url, './ConfirmActions.css')

afterEach(() => {
  cleanup()
})

function renderActions(busy = false) {
  const onCancel = vi.fn()
  const onConfirm = vi.fn()
  render(
    <ConfirmActions
      confirmLabel="Remove all"
      busy={busy}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />,
  )
  return { onCancel, onConfirm }
}

describe('ConfirmActions', () => {
  it('runs the confirm action it names, and cancels without confirming', () => {
    const { onCancel, onConfirm } = renderActions()

    fireEvent.click(screen.getByRole('button', { name: 'Remove all' }))
    expect(onConfirm).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('keeps the confirm button focusable but ignores it while busy', async () => {
    const user = userEvent.setup()
    const { onConfirm } = renderActions(true)
    const confirm = screen.getByRole('button', { name: 'Remove all' })

    expect(confirm).toHaveAttribute('aria-disabled', 'true')
    expect(confirm).not.toBeDisabled()
    await user.click(confirm)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('blocks Cancel as well while busy, so a delete in flight cannot be dismissed', () => {
    const onCancel = vi.fn()
    render(
      <ConfirmActions confirmLabel="Remove all" busy onCancel={onCancel} onConfirm={vi.fn()} />,
    )

    const cancel = screen.getByRole('button', { name: 'Cancel' })
    expect(cancel).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(cancel)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('looks unavailable but still runs its handler when unready, so the handler can say why', () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmActions
        confirmLabel="Delete account"
        unready
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    )

    const confirm = screen.getByRole('button', { name: 'Delete account' })
    expect(confirm).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(confirm)
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('leaves out the confirm button when there is nothing to confirm', () => {
    render(<ConfirmActions confirmLabel="Delete account" onCancel={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete account' })).not.toBeInTheDocument()
  })

  it('links the confirm button to a description it is given', () => {
    render(
      <>
        <p id="hint">Type your email to confirm</p>
        <ConfirmActions
          confirmLabel="Delete account"
          confirmDescribedBy="hint"
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
        />
      </>,
    )

    expect(screen.getByRole('button', { name: 'Delete account' })).toHaveAccessibleDescription(
      'Type your email to confirm',
    )
  })

  it('gives every removal one destructive colour for its confirm button', () => {
    // The confirm button is the only place a removal is coloured, so every confirm reads the same.
    expect(ruleBody(actionsCss, '.btn.confirm-actions__confirm')).toMatch(
      /background:\s*var\(--status-critical\)/,
    )
    expect(ruleBody(actionsCss, '.btn.confirm-actions__confirm')).toMatch(
      /color:\s*var\(--surface-1\)/,
    )
  })
})
