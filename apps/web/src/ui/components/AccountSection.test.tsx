// @vitest-environment jsdom
import { useState } from 'react'
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

type PageProps = Omit<AccountSectionProps, 'deleteOpen' | 'onDeleteOpenChange'>

function props(overrides: Partial<PageProps> = {}): PageProps {
  return {
    email: EMAIL,
    onDownloadData: vi.fn(async () => FILE),
    onDeleteAccount: vi.fn(async () => {}),
    ...overrides,
  }
}

/** A page that holds the delete dialog's open state, as ProfilePage does. */
function Host(props: PageProps) {
  const [deleteOpen, setDeleteOpen] = useState(false)
  return <AccountSection {...props} deleteOpen={deleteOpen} onDeleteOpenChange={setDeleteOpen} />
}

function renderSection(overrides: Partial<PageProps> = {}) {
  return render(<Host {...props(overrides)} />)
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

  it('says when the download was saved, so an old note does not read as current', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 24, 14, 5))
    try {
      const user = userEvent.setup()
      renderSection()
      await user.click(screen.getByRole('button', { name: DOWNLOAD }))

      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent(/^Your data was downloaded at 2:05/),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the delete button in a danger zone of its own, under a heading', () => {
    renderSection()

    const zone = screen.getByRole('button', { name: DELETE }).closest('.account-section__danger')
    expect(zone).not.toBeNull()
    expect(
      within(zone as HTMLElement).getByRole('heading', { name: 'Delete account', level: 3 }),
    ).toBeInTheDocument()
    expect(within(zone as HTMLElement).queryByRole('button', { name: DOWNLOAD })).toBeNull()
  })

  it('reports to its page when the delete dialog opens, so the page can close what else is open', async () => {
    const user = userEvent.setup()
    const onDeleteOpenChange = vi.fn()
    render(
      <AccountSection {...props()} deleteOpen={false} onDeleteOpenChange={onDeleteOpenChange} />,
    )

    await user.click(screen.getByRole('button', { name: DELETE }))

    expect(onDeleteOpenChange).toHaveBeenCalledWith(true)
  })

  it('opens the delete dialog from the button', async () => {
    const user = userEvent.setup()
    renderSection()
    await user.click(screen.getByRole('button', { name: DELETE }))
    expect(screen.getByRole('alertdialog', { name: 'Delete your account?' })).toBeInTheDocument()
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
