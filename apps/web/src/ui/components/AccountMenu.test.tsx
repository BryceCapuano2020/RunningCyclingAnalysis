// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Me } from '@rca/contract'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountMenu } from './AccountMenu'
import type { AccountMenuProps } from './AccountMenu'

afterEach(() => {
  cleanup()
})

const EMAIL = 'bryce@example.com'

function makeMe(overrides: Partial<Me['user']> = {}): Me {
  return {
    user: {
      id: 'user-1',
      email: EMAIL,
      name: 'Bryce Capuano',
      pictureUrl: null,
      ...overrides,
    },
    profile: {
      massKg: 80,
      bikeMassKg: 10,
      units: 'metric',
      keepFiles: true,
      updatedAt: 1,
    },
  }
}

function props(overrides: Partial<AccountMenuProps> = {}): AccountMenuProps {
  return {
    status: 'signed-in',
    me: makeMe(),
    onSignIn: vi.fn(),
    onSignOut: vi.fn(),
    onDeleteAccount: vi.fn(async () => {}),
    ...overrides,
  }
}

function renderMenu(overrides: Partial<AccountMenuProps> = {}) {
  return render(<AccountMenu {...props(overrides)} />)
}

function trigger(name = 'Bryce'): HTMLElement {
  return screen.getByRole('button', { name })
}

function panel(container: HTMLElement): HTMLElement {
  const id = trigger().getAttribute('aria-controls')
  if (id === null) throw new Error('trigger has no aria-controls')
  const element = container.ownerDocument.getElementById(id)
  if (element === null) throw new Error('panel not found')
  return element
}

describe('AccountMenu states', () => {
  it('renders nothing while accounts are unavailable', () => {
    const { container } = renderMenu({ status: 'unavailable', me: null })
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a neutral placeholder while loading, with no button', () => {
    const { container } = renderMenu({ status: 'loading', me: null })
    const placeholder = container.querySelector('.account-menu__placeholder')
    expect(placeholder).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('offers Google sign-in when signed out and calls onSignIn', async () => {
    const user = userEvent.setup()
    const onSignIn = vi.fn()
    renderMenu({ status: 'signed-out', me: null, onSignIn })
    await user.click(screen.getByRole('button', { name: 'Sign in with Google' }))
    expect(onSignIn).toHaveBeenCalledTimes(1)
  })

  it('shows the first name and initials when there is no picture', () => {
    renderMenu()
    expect(trigger()).toHaveTextContent('Bryce')
    expect(trigger().querySelector('.account-menu__avatar')).toHaveTextContent('BC')
    expect(trigger().querySelector('img')).toBeNull()
  })

  it('shows the picture, with empty alt text, when there is one', () => {
    const { container } = renderMenu({
      me: makeMe({ pictureUrl: 'https://lh3.example.com/photo.jpg' }),
    })
    const image = container.querySelector('img')
    expect(image).toHaveAttribute('src', 'https://lh3.example.com/photo.jpg')
    expect(image).toHaveAttribute('alt', '')
    expect(image).toHaveAttribute('referrerpolicy', 'no-referrer')
  })

  it('uses the first and last initials for a longer name', () => {
    renderMenu({ me: makeMe({ name: 'Mary Ann Smith' }) })
    expect(trigger('Mary').querySelector('.account-menu__avatar')).toHaveTextContent('MS')
  })

  it('uses the single initial of a one-word name', () => {
    renderMenu({ me: makeMe({ name: 'Cher' }) })
    expect(trigger('Cher').querySelector('.account-menu__avatar')).toHaveTextContent('C')
  })

  it('falls back to the email when the name is blank', () => {
    renderMenu({ me: makeMe({ name: '   ' }) })
    expect(trigger('bryce').querySelector('.account-menu__avatar')).toHaveTextContent('B')
  })

  it('shows the sign-in button instead of the menu when signed-in has no user', () => {
    renderMenu({ status: 'signed-in', me: null })
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
  })
})

describe('AccountMenu disclosure', () => {
  it('starts closed, with the panel hidden and aria-expanded false', () => {
    const { container } = renderMenu()
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(panel(container)).not.toBeVisible()
  })

  it('opens and closes from the trigger, and links the panel with aria-controls', async () => {
    const user = userEvent.setup()
    const { container } = renderMenu()
    await user.click(trigger())
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
    expect(panel(container)).toBeVisible()
    expect(panel(container).id).not.toBe('')

    await user.click(trigger())
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(panel(container)).not.toBeVisible()
  })

  it('lists the email as muted text, with sign out and delete account', async () => {
    const user = userEvent.setup()
    const { container } = renderMenu()
    await user.click(trigger())
    const body = panel(container)
    expect(body).toHaveTextContent(EMAIL)
    expect(body.querySelector('.account-menu__email')).toHaveTextContent(EMAIL)
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Delete account…' })).toBeVisible()
  })

  it('moves focus through the items with Tab and closes on Escape, returning focus to the trigger', async () => {
    const user = userEvent.setup()
    const { container } = renderMenu()
    await user.click(trigger())
    await user.tab()
    expect(screen.getByRole('button', { name: 'Sign out' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Delete account…' })).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(panel(container)).not.toBeVisible()
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(trigger()).toHaveFocus()
  })

  it('opens from the keyboard with Enter and closes on Escape from the trigger', async () => {
    const user = userEvent.setup()
    const { container } = renderMenu()
    trigger().focus()
    await user.keyboard('{Enter}')
    expect(panel(container)).toBeVisible()
    await user.keyboard('{Escape}')
    expect(panel(container)).not.toBeVisible()
    expect(trigger()).toHaveFocus()
  })

  it('ignores Escape and other keys while closed', async () => {
    const user = userEvent.setup()
    renderMenu()
    trigger().focus()
    await user.keyboard('{Escape}')
    await user.keyboard('a')
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(trigger()).toHaveFocus()
  })

  it('closes when the user clicks outside', async () => {
    const user = userEvent.setup()
    const { container } = renderMenu()
    await user.click(trigger())
    expect(panel(container)).toBeVisible()
    await user.click(document.body)
    expect(panel(container)).not.toBeVisible()
  })

  it('stays open when the user clicks inside the panel', async () => {
    const user = userEvent.setup()
    const { container } = renderMenu()
    await user.click(trigger())
    const email = panel(container).querySelector('.account-menu__email')
    if (email === null) throw new Error('email not in panel')
    await user.click(email)
    expect(panel(container)).toBeVisible()
  })

  it('closes when focus moves to an element outside the menu with Tab', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <>
        <AccountMenu {...props()} />
        <button type="button">Outside</button>
      </>,
    )
    await user.click(trigger())
    await user.tab()
    await user.tab()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Outside' })).toHaveFocus()
    expect(panel(container)).not.toBeVisible()
  })

  it('does not close when focus moves between the trigger and the panel items', async () => {
    const user = userEvent.setup()
    const { container } = renderMenu()
    await user.click(trigger())
    await user.tab()
    expect(panel(container)).toBeVisible()
  })
})

describe('AccountMenu actions', () => {
  it('signs out and closes the menu', async () => {
    const user = userEvent.setup()
    const onSignOut = vi.fn()
    const { container } = renderMenu({ onSignOut })
    await user.click(trigger())
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(onSignOut).toHaveBeenCalledTimes(1)
    expect(panel(container)).not.toBeVisible()
  })

  it('opens the delete dialog from the menu and closes the menu', async () => {
    const user = userEvent.setup()
    const { container } = renderMenu()
    await user.click(trigger())
    await user.click(screen.getByRole('button', { name: 'Delete account…' }))
    expect(panel(container)).not.toBeVisible()
    expect(screen.getByRole('dialog', { name: 'Delete your account?' })).toBeInTheDocument()
  })

  it('deletes the account after the email is typed, then returns focus to the trigger', async () => {
    const user = userEvent.setup()
    const onDeleteAccount = vi.fn(async () => {})
    renderMenu({ onDeleteAccount })
    await user.click(trigger())
    await user.click(screen.getByRole('button', { name: 'Delete account…' }))
    await user.type(screen.getByLabelText('Email address'), EMAIL)
    await user.click(screen.getByRole('button', { name: 'Delete account' }))

    expect(onDeleteAccount).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(trigger()).toHaveFocus())
    expect(document.querySelector('dialog')).not.toHaveAttribute('open')
  })

  it('closes the delete dialog with Cancel and returns focus to the trigger', async () => {
    const user = userEvent.setup()
    const onDeleteAccount = vi.fn(async () => {})
    renderMenu({ onDeleteAccount })
    await user.click(trigger())
    await user.click(screen.getByRole('button', { name: 'Delete account…' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onDeleteAccount).not.toHaveBeenCalled()
    expect(document.querySelector('dialog')).not.toHaveAttribute('open')
    expect(trigger()).toHaveFocus()
  })

  it('replaces the menu with the sign-in button when the status changes to signed-out', async () => {
    const user = userEvent.setup()
    const { container, rerender } = renderMenu()
    await user.click(trigger())
    rerender(<AccountMenu {...props({ status: 'signed-out', me: null })} />)
    expect(container.querySelector('.account-menu')).toBeNull()
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument()
  })

  it('moves focus to the sign-in button when signing out removes the trigger', async () => {
    const user = userEvent.setup()
    const onSignOut = vi.fn()
    const { rerender } = renderMenu({ onSignOut })
    await user.click(trigger())
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(onSignOut).toHaveBeenCalledTimes(1)

    rerender(<AccountMenu {...props({ status: 'signed-out', me: null, onSignOut })} />)
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toHaveFocus()
  })

  it('moves focus to the sign-in button after a successful delete', async () => {
    const user = userEvent.setup()
    const onDeleteAccount = vi.fn(async () => {})
    const { rerender } = renderMenu({ onDeleteAccount })
    await user.click(trigger())
    await user.click(screen.getByRole('button', { name: 'Delete account…' }))
    await user.type(screen.getByLabelText('Email address'), EMAIL)
    await user.click(screen.getByRole('button', { name: 'Delete account' }))
    expect(onDeleteAccount).toHaveBeenCalledTimes(1)

    rerender(<AccountMenu {...props({ status: 'signed-out', me: null, onDeleteAccount })} />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Sign in with Google' })).toHaveFocus(),
    )
  })

  it('does not move focus when the session is still loading', () => {
    const { rerender } = renderMenu({ status: 'loading', me: null })
    rerender(<AccountMenu {...props({ status: 'signed-out', me: null })} />)
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).not.toHaveFocus()
  })
})
