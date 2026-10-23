// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { saveAccountExport } from '../../export/saveExport'
import { AccountSection } from './AccountSection'
import type { AccountSectionProps } from './AccountSection'

vi.mock('../../export/saveExport', () => ({ saveAccountExport: vi.fn() }))

afterEach(() => {
  cleanup()
})

const EMAIL = 'bryce@example.com'
const DOWNLOAD = 'Download my data'
const DELETE = 'Delete account…'
const FILE = new Blob(['{"format":"rca-export"}'], { type: 'application/json' })

function props(overrides: Partial<AccountSectionProps> = {}): AccountSectionProps {
  return {
    email: EMAIL,
    onDownloadData: vi.fn(async () => FILE),
    onDeleteAccount: vi.fn(async () => {}),
    ...overrides,
  }
}

function renderSection(overrides: Partial<AccountSectionProps> = {}) {
  return render(<AccountSection {...props(overrides)} />)
}

/** A download that stays in flight until the test resolves it. */
function pendingDownload() {
  let finish: (file: Blob) => void = () => undefined
  const onDownloadData = vi.fn(
    () =>
      new Promise<Blob>((resolve) => {
        finish = resolve
      }),
  )
  return { onDownloadData, finish: (file: Blob) => finish(file) }
}

describe('AccountSection', () => {
  beforeEach(() => {
    vi.mocked(saveAccountExport).mockClear()
  })

  it('shows the signed-in email in an Account section', () => {
    renderSection()
    const section = screen.getByRole('region', { name: 'Account' })
    expect(within(section).getByText(EMAIL, { selector: '.account-section__email' })).toBeVisible()
  })

  it('offers the download and the deletion as buttons', () => {
    renderSection()
    expect(screen.getByRole('button', { name: DOWNLOAD })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(screen.getByRole('button', { name: DELETE })).toBeInTheDocument()
  })

  it('marks the download busy while it is in flight, then saves the file and says so', async () => {
    const user = userEvent.setup()
    const { onDownloadData, finish } = pendingDownload()
    renderSection({ onDownloadData })
    const button = screen.getByRole('button', { name: DOWNLOAD })
    await user.click(button)

    expect(onDownloadData).toHaveBeenCalledTimes(1)
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(saveAccountExport).not.toHaveBeenCalled()

    await act(async () => finish(FILE))
    await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled', 'true'))
    expect(saveAccountExport).toHaveBeenCalledWith(FILE, expect.any(Date))
    expect(screen.getByRole('status')).toHaveTextContent('Your data was downloaded')
  })

  it('keeps keyboard focus on the download button while it is in flight', async () => {
    const user = userEvent.setup()
    const { onDownloadData } = pendingDownload()
    renderSection({ onDownloadData })
    const button = screen.getByRole('button', { name: DOWNLOAD })
    await user.click(button)

    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveFocus()
  })

  it('starts one download for a double click', async () => {
    const user = userEvent.setup()
    const { onDownloadData, finish } = pendingDownload()
    renderSection({ onDownloadData })
    await user.dblClick(screen.getByRole('button', { name: DOWNLOAD }))

    expect(onDownloadData).toHaveBeenCalledTimes(1)
    await act(async () => finish(FILE))
    await waitFor(() => expect(saveAccountExport).toHaveBeenCalledTimes(1))
  })

  it('announces a failed download, saves nothing and makes the button available again', async () => {
    const user = userEvent.setup()
    const onDownloadData = vi.fn(async () => {
      throw new Error('Could not download your data. Offline')
    })
    renderSection({ onDownloadData })
    await user.click(screen.getByRole('button', { name: DOWNLOAD }))

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Could not download your data. Offline'),
    )
    expect(saveAccountExport).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: DOWNLOAD })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('opens the delete dialog from the button', async () => {
    const user = userEvent.setup()
    renderSection()
    await user.click(screen.getByRole('button', { name: DELETE }))
    expect(screen.getByRole('dialog', { name: 'Delete your account?' })).toBeInTheDocument()
  })

  it('deletes the account once the email is typed', async () => {
    const user = userEvent.setup()
    const onDeleteAccount = vi.fn(async () => {})
    renderSection({ onDeleteAccount })
    await user.click(screen.getByRole('button', { name: DELETE }))
    await user.type(screen.getByLabelText('Email address'), EMAIL)
    await user.click(screen.getByRole('button', { name: 'Delete account' }))

    expect(onDeleteAccount).toHaveBeenCalledTimes(1)
  })

  it('closes the delete dialog with Cancel without deleting, and returns focus to the button', async () => {
    const user = userEvent.setup()
    const onDeleteAccount = vi.fn(async () => {})
    renderSection({ onDeleteAccount })
    await user.click(screen.getByRole('button', { name: DELETE }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onDeleteAccount).not.toHaveBeenCalled()
    expect(document.querySelector('dialog')).not.toHaveAttribute('open')
    expect(screen.getByRole('button', { name: DELETE })).toHaveFocus()
  })
})
