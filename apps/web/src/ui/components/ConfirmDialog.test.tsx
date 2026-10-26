// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from './ConfirmDialog'
import type { ConfirmDialogProps } from './ConfirmDialog'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function props(overrides: Partial<ConfirmDialogProps> = {}): ConfirmDialogProps {
  return {
    open: true,
    title: 'Remove all 2 activities kept in this browser?',
    description: 'Their summaries are removed from this browser and cannot be undone.',
    confirmLabel: 'Remove all',
    opener: null,
    onConfirm: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }
}

describe('ConfirmDialog', () => {
  it('is an alert dialog named by its title and described by what it does', () => {
    render(<ConfirmDialog {...props()} />)

    const dialog = screen.getByRole('alertdialog', {
      name: 'Remove all 2 activities kept in this browser?',
    })
    expect(dialog).toHaveAccessibleDescription(/cannot be undone/)
  })

  it('opens on Cancel, so an Enter straight after opening cancels rather than removes', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    render(<ConfirmDialog {...props({ onConfirm, onClose })} />)

    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(onClose).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('reports Cancel and Escape to the parent without confirming', () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()
    render(<ConfirmDialog {...props({ onClose, onConfirm })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    // A browser reports Escape on a modal dialog as a cancel event, which the dialog must not let close it.
    const escape = new Event('cancel', { cancelable: true })
    fireEvent(screen.getByRole('alertdialog'), escape)
    expect(escape.defaultPrevented).toBe(true)
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('confirms with the button it names, and only that one', () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    render(<ConfirmDialog {...props({ onConfirm, onClose })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Remove all' }))

    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('returns focus to the opener it is given when it closes, even though focus started on the body', () => {
    const opener = document.createElement('button')
    opener.textContent = 'Remove all my activities'
    document.body.append(opener)
    expect(document.activeElement).toBe(document.body)

    const { rerender } = render(<ConfirmDialog {...props({ open: false, opener })} />)
    rerender(<ConfirmDialog {...props({ open: true, opener })} />)
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()

    rerender(<ConfirmDialog {...props({ open: false, opener })} />)
    expect(opener).toHaveFocus()
    opener.remove()
  })

  it('does not try to focus an opener that has gone from the page', () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    const focus = vi.spyOn(opener, 'focus')

    const { rerender } = render(<ConfirmDialog {...props({ open: false, opener })} />)
    rerender(<ConfirmDialog {...props({ open: true, opener })} />)
    opener.remove()
    rerender(<ConfirmDialog {...props({ open: false, opener })} />)

    expect(focus).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(document.body)
  })

  it('shows no content while closed', () => {
    render(<ConfirmDialog {...props({ open: false })} />)
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
  })

  it('uses showModal and close when the browser provides them', () => {
    const showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '')
    })
    const close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute('open')
    })
    HTMLDialogElement.prototype.showModal = showModal
    HTMLDialogElement.prototype.close = close

    try {
      const { rerender } = render(<ConfirmDialog {...props({ open: false })} />)
      expect(showModal).not.toHaveBeenCalled()

      rerender(<ConfirmDialog {...props({ open: true })} />)
      expect(showModal).toHaveBeenCalledOnce()

      rerender(<ConfirmDialog {...props({ open: false })} />)
      expect(close).toHaveBeenCalledOnce()
    } finally {
      // jsdom does not implement these; remove the stubs so other tests see the default.
      Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
      Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
    }
  })
})
