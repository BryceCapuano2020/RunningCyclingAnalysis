// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError } from '../../api/client'
import { DeleteAccountDialog } from './DeleteAccountDialog'
import { readStylesheet, ruleBody } from './stylesheet'

const dialogCss = await readStylesheet(import.meta.url, './DeleteAccountDialog.css')

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const EMAIL = 'bryce@example.com'
const HINT = 'Type your email to confirm'

function dialogElement(): HTMLDialogElement {
  const dialog = document.querySelector('dialog')
  if (dialog === null) throw new Error('no dialog rendered')
  return dialog
}

function emailInput(): HTMLElement {
  return screen.getByLabelText('Email address')
}

function confirmButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Delete account' })
}

describe('DeleteAccountDialog', () => {
  it('is closed when open is false', () => {
    render(<DeleteAccountDialog open={false} email={EMAIL} onConfirm={vi.fn()} onClose={vi.fn()} />)
    expect(dialogElement()).not.toHaveAttribute('open')
  })

  it('opens with the open attribute when the browser has no showModal', () => {
    render(<DeleteAccountDialog open email={EMAIL} onConfirm={vi.fn()} onClose={vi.fn()} />)
    expect(dialogElement()).toHaveAttribute('open')
    expect(screen.getByRole('dialog', { name: 'Delete your account?' })).toBeInTheDocument()
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
      const { rerender } = render(
        <DeleteAccountDialog open={false} email={EMAIL} onConfirm={vi.fn()} onClose={vi.fn()} />,
      )
      expect(showModal).not.toHaveBeenCalled()

      rerender(<DeleteAccountDialog open email={EMAIL} onConfirm={vi.fn()} onClose={vi.fn()} />)
      expect(showModal).toHaveBeenCalledTimes(1)
      expect(dialogElement()).toHaveAttribute('open')

      rerender(
        <DeleteAccountDialog open={false} email={EMAIL} onConfirm={vi.fn()} onClose={vi.fn()} />,
      )
      expect(close).toHaveBeenCalledTimes(1)
      expect(dialogElement()).not.toHaveAttribute('open')
    } finally {
      // jsdom has no native dialog methods; remove the stubs so other tests see the default.
      delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).showModal
      delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).close
    }
  })

  it('explains that deletion is permanent and cannot be undone', () => {
    render(<DeleteAccountDialog open email={EMAIL} onConfirm={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Delete your account?' })).toBeInTheDocument()
    expect(
      screen.getByText(
        'This permanently deletes your profile, every activity and every stored file. It cannot be undone. Activities kept in this browser from before you signed in are not part of your account, so deleting it does not remove them; sign out and choose Start over to remove them.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText(EMAIL)).toBeInTheDocument()
  })

  it('marks the confirm button aria-disabled until the email is typed exactly', async () => {
    const user = userEvent.setup()
    render(<DeleteAccountDialog open email={EMAIL} onConfirm={vi.fn()} onClose={vi.fn()} />)
    const input = emailInput()
    expect(confirmButton()).toHaveAttribute('aria-disabled', 'true')

    await user.type(input, 'bryce@example.co')
    expect(confirmButton()).toHaveAttribute('aria-disabled', 'true')

    await user.clear(input)
    await user.type(input, 'BRYCE@example.com')
    expect(confirmButton()).toHaveAttribute('aria-disabled', 'true')

    await user.clear(input)
    await user.type(input, `${EMAIL} `)
    expect(confirmButton()).toHaveAttribute('aria-disabled', 'true')

    await user.clear(input)
    await user.type(input, EMAIL)
    expect(confirmButton()).toHaveAttribute('aria-disabled', 'false')
  })

  it('keeps the aria-disabled confirm button focusable and links the visible hint to it', () => {
    render(<DeleteAccountDialog open email={EMAIL} onConfirm={vi.fn()} onClose={vi.fn()} />)
    const confirm = confirmButton()
    expect(confirm).toBeEnabled()
    expect(confirm).toHaveAttribute('aria-disabled', 'true')
    confirm.focus()
    expect(confirm).toHaveFocus()
    expect(confirm).toHaveAccessibleDescription(HINT)
    expect(screen.getByText(HINT)).toHaveClass('delete-dialog__hint')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('explains a mismatch in the hint, which is always a status region and never an alert', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn(async () => {})
    render(<DeleteAccountDialog open email={EMAIL} onConfirm={onConfirm} onClose={vi.fn()} />)
    const hint = screen.getByRole('status')
    expect(hint).toHaveTextContent(HINT)
    await user.type(emailInput(), 'nope')
    await user.click(confirmButton())

    expect(onConfirm).not.toHaveBeenCalled()
    // The same node, so the changed instruction is announced rather than mounted with its text.
    expect(screen.getByRole('status')).toBe(hint)
    expect(hint).toHaveTextContent(HINT)
    expect(hint).toHaveTextContent('The email does not match yet.')
    expect(hint).toHaveClass('delete-dialog__error')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(confirmButton()).toHaveAccessibleDescription(`${HINT}. The email does not match yet.`)
  })

  it('shows the same alert when Enter is pressed in the email field without a match', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn(async () => {})
    render(<DeleteAccountDialog open email={EMAIL} onConfirm={onConfirm} onClose={vi.fn()} />)
    await user.type(emailInput(), 'nope{Enter}')
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('The email does not match yet.')
  })

  it('clears the mismatch explanation once the user edits the email', async () => {
    const user = userEvent.setup()
    render(<DeleteAccountDialog open email={EMAIL} onConfirm={vi.fn()} onClose={vi.fn()} />)
    await user.click(confirmButton())
    expect(screen.getByRole('status')).toHaveTextContent('The email does not match yet.')
    await user.type(emailInput(), 'b')
    expect(screen.getByRole('status')).not.toHaveTextContent('does not match')
    expect(screen.getByText(HINT)).toHaveClass('delete-dialog__hint')
  })

  it('calls onConfirm once the email matches, then closes', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn(async () => {})
    const onClose = vi.fn()
    render(<DeleteAccountDialog open email={EMAIL} onConfirm={onConfirm} onClose={onClose} />)
    await user.type(emailInput(), EMAIL)
    await user.click(confirmButton())
    expect(onConfirm).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a pending state and blocks cancel and edits while the delete runs', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn(() => new Promise<void>(() => {}))
    const onClose = vi.fn()
    render(<DeleteAccountDialog open email={EMAIL} onConfirm={onConfirm} onClose={onClose} />)
    const input = emailInput()
    await user.type(input, EMAIL)
    await user.click(confirmButton())

    const pending = screen.getByRole('button', { name: 'Deleting…' })
    expect(pending).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(input).toHaveAttribute('readonly')

    // A second activation while pending does not start another delete.
    await user.click(pending)
    expect(onConfirm).toHaveBeenCalledTimes(1)

    fireEvent(dialogElement(), new Event('cancel', { cancelable: true }))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows an alert and stays open when onConfirm rejects, then allows a retry', async () => {
    const user = userEvent.setup()
    const onConfirm = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(undefined)
    const onClose = vi.fn()
    render(<DeleteAccountDialog open email={EMAIL} onConfirm={onConfirm} onClose={onClose} />)
    const input = emailInput()
    await user.type(input, EMAIL)
    await user.click(confirmButton())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Your account could not be deleted. Try again.')
    expect(alert).not.toHaveTextContent('network down')
    expect(input).toHaveAttribute('aria-describedby', alert.id)
    expect(onClose).not.toHaveBeenCalled()
    expect(dialogElement()).toHaveAttribute('open')
    expect(confirmButton()).toHaveAttribute('aria-disabled', 'false')

    await user.click(confirmButton())
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('clears the delete error when the user edits the email again', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('boom'))
    render(<DeleteAccountDialog open email={EMAIL} onConfirm={onConfirm} onClose={vi.fn()} />)
    const input = emailInput()
    await user.type(input, EMAIL)
    await user.click(confirmButton())
    await screen.findByRole('alert')
    await user.type(input, 'x')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(input).not.toHaveAttribute('aria-describedby')
  })

  it('closes on Cancel', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<DeleteAccountDialog open email={EMAIL} onConfirm={vi.fn()} onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape, taking the close decision from the parent', () => {
    const onClose = vi.fn()
    render(<DeleteAccountDialog open email={EMAIL} onConfirm={vi.fn()} onClose={onClose} />)
    const cancel = new Event('cancel', { cancelable: true })
    fireEvent(dialogElement(), cancel)
    expect(cancel.defaultPrevented).toBe(true)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('resets the typed email and any alert when it is closed and reopened', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <DeleteAccountDialog open email={EMAIL} onConfirm={vi.fn()} onClose={vi.fn()} />,
    )
    await user.type(emailInput(), 'nope')
    await user.click(confirmButton())
    expect(screen.getByRole('status')).toHaveTextContent('does not match')

    rerender(
      <DeleteAccountDialog open={false} email={EMAIL} onConfirm={vi.fn()} onClose={vi.fn()} />,
    )
    rerender(<DeleteAccountDialog open email={EMAIL} onConfirm={vi.fn()} onClose={vi.fn()} />)
    expect(emailInput()).toHaveValue('')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).not.toHaveTextContent('does not match')
    expect(confirmButton()).toHaveAttribute('aria-disabled', 'true')
  })

  it('shows the server message when file storage is unavailable, and offers retry', async () => {
    const user = userEvent.setup()
    const onConfirm = vi
      .fn<() => Promise<void>>()
      .mockRejectedValue(
        new ApiRequestError(
          503,
          'storage_unavailable',
          'File storage is unavailable. Try again later.',
        ),
      )
    render(<DeleteAccountDialog open email={EMAIL} onConfirm={onConfirm} onClose={vi.fn()} />)
    await user.type(emailInput(), EMAIL)
    await user.click(confirmButton())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('File storage is unavailable. Try again later.')
    expect(alert).not.toHaveTextContent('Try again.')
    expect(confirmButton()).toBeInTheDocument()
  })

  it('does not offer retry when the server rejects the request for a reason retrying cannot fix', async () => {
    const user = userEvent.setup()
    const onConfirm = vi
      .fn<() => Promise<void>>()
      .mockRejectedValue(
        new ApiRequestError(401, 'unauthenticated', 'Your session has ended. Sign in again.'),
      )
    render(<DeleteAccountDialog open email={EMAIL} onConfirm={onConfirm} onClose={vi.fn()} />)
    await user.type(emailInput(), EMAIL)
    await user.click(confirmButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your session has ended. Sign in again.',
    )
    expect(screen.queryByRole('button', { name: 'Delete account' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled()
  })

  it('moves focus to the explanation when a refusal removes the confirm button', async () => {
    const user = userEvent.setup()
    const onConfirm = vi
      .fn<() => Promise<void>>()
      .mockRejectedValue(new ApiRequestError(403, 'forbidden', 'This account cannot be deleted.'))
    render(<DeleteAccountDialog open email={EMAIL} onConfirm={onConfirm} onClose={vi.fn()} />)
    await user.type(emailInput(), EMAIL)
    await user.click(confirmButton())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveFocus()
    expect(alert).toHaveAttribute('tabindex', '-1')
  })

  it('leaves focus on the confirm button when a retry is offered', async () => {
    const user = userEvent.setup()
    const onConfirm = vi
      .fn<() => Promise<void>>()
      .mockRejectedValue(new ApiRequestError(503, 'storage_unavailable', 'Try again later.'))
    render(<DeleteAccountDialog open email={EMAIL} onConfirm={onConfirm} onClose={vi.fn()} />)
    await user.type(emailInput(), EMAIL)
    await user.click(confirmButton())

    await screen.findByRole('alert')
    expect(confirmButton()).toBeInTheDocument()
    expect(screen.getByRole('alert')).not.toHaveFocus()
  })

  it('offers retry after a lost connection, which a later attempt can fix', async () => {
    const user = userEvent.setup()
    const onConfirm = vi
      .fn<() => Promise<void>>()
      .mockRejectedValue(new ApiRequestError(0, 'network_error', 'Could not reach the server'))
    render(<DeleteAccountDialog open email={EMAIL} onConfirm={onConfirm} onClose={vi.fn()} />)
    await user.type(emailInput(), EMAIL)
    await user.click(confirmButton())

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server')
    expect(confirmButton()).toBeInTheDocument()
  })

  it('wraps a long email address inside the dialog at 320 px', () => {
    const rule = ruleBody(dialogCss, '.delete-dialog')
    expect(rule).toMatch(/overflow-wrap:\s*anywhere/)
  })
})
