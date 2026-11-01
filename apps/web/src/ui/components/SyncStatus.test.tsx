// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SyncIssue } from '@rca/core/session'
import { SyncStatus } from './SyncStatus'
import type { SyncStatusProps } from './SyncStatus'

afterEach(() => {
  cleanup()
})

function props(overrides: Partial<SyncStatusProps> = {}): SyncStatusProps {
  return { uploading: null, issues: [], signedIn: true, ...overrides }
}

/** The line of text, which the notice region around it announces as it is added. */
function message(): HTMLElement {
  const line = document.querySelector<HTMLElement>('.sync-status__message')
  if (line === null) throw new Error('no status message is shown')
  return line
}

const issue = (code: SyncIssue['code'], count: number): SyncIssue => ({ code, count })

describe('SyncStatus', () => {
  it('renders nothing when idle, rather than an empty region', () => {
    const { container } = render(<SyncStatus {...props()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when signed out with nothing to report', () => {
    const { container, rerender } = render(<SyncStatus {...props({ signedIn: false })} />)
    rerender(<SyncStatus {...props({ signedIn: false, uploading: null })} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('says nothing of the start of an upload, since the analysis status already does', () => {
    const { rerender } = render(<SyncStatus {...props()} />)
    rerender(<SyncStatus {...props({ uploading: 0 })} />)
    rerender(<SyncStatus {...props({ uploading: 3 })} />)
    expect(document.querySelector('.sync-status__message')).toBeNull()
  })

  it('has no message text during the upload and shows the running count, hidden from readers', () => {
    const { rerender } = render(<SyncStatus {...props()} />)
    rerender(<SyncStatus {...props({ uploading: 0 })} />)
    rerender(<SyncStatus {...props({ uploading: 12 })} />)
    rerender(<SyncStatus {...props({ uploading: 13 })} />)

    expect(document.querySelector('.sync-status__message')).toBeNull()
    expect(screen.getByText('13 saved')).toHaveAttribute('aria-hidden', 'true')
  })

  it('announces a finished upload with the saved count, in the singular and the plural', () => {
    const { rerender } = render(<SyncStatus {...props({ uploading: 0 })} />)
    rerender(<SyncStatus {...props({ uploading: 12 })} />)
    rerender(<SyncStatus {...props({ uploading: null })} />)
    expect(message()).toHaveTextContent('Saved 12 activities to your library')
    expect(message()).not.toHaveClass('sync-status__message--failed')
    expect(screen.queryByText('12 saved')).not.toBeInTheDocument()

    rerender(<SyncStatus {...props({ uploading: 0 })} />)
    rerender(<SyncStatus {...props({ uploading: 1 })} />)
    rerender(<SyncStatus {...props({ uploading: null })} />)
    expect(message()).toHaveTextContent('Saved 1 activity to your library')
  })

  it('takes the saved count from the reply that ended the import, when the last progress lagged', () => {
    const { rerender } = render(<SyncStatus {...props({ uploading: 0 })} />)
    rerender(<SyncStatus {...props({ uploading: 1 })} />)
    rerender(<SyncStatus {...props({ uploading: null, savedCount: 12 })} />)
    expect(message()).toHaveTextContent('Saved 12 activities to your library')

    // The same count says the same: it is the end of the import that makes the sentence.
    rerender(<SyncStatus {...props({ uploading: 0, savedCount: null })} />)
    rerender(<SyncStatus {...props({ uploading: 4, savedCount: null })} />)
    rerender(<SyncStatus {...props({ uploading: null, savedCount: 0 })} />)
    expect(message()).toHaveTextContent('No new activities were saved to your library.')
  })

  it('never shows a saved count of zero, and says so when a signed-in import saved nothing', () => {
    const { rerender } = render(<SyncStatus {...props({ uploading: 0 })} />)
    expect(screen.queryByText('0 saved')).not.toBeInTheDocument()

    rerender(<SyncStatus {...props({ uploading: null })} />)
    const status = message()
    expect(status).toHaveTextContent('No new activities were saved to your library.')
    expect(status).not.toHaveTextContent('Saved 0')
    expect(status).not.toHaveClass('sync-status__message--failed')
  })

  it('does not announce a start or finish for an upload that was already running on mount', () => {
    const { rerender } = render(<SyncStatus {...props({ uploading: 5 })} />)
    expect(document.querySelector('.sync-status__message')).toBeNull()
    expect(screen.getByText('5 saved')).toHaveAttribute('aria-hidden', 'true')

    rerender(<SyncStatus {...props({ uploading: 6 })} />)
    expect(document.querySelector('.sync-status__message')).toBeNull()
  })

  it('groups the running count and the finished count from a thousand on', () => {
    const { rerender } = render(<SyncStatus {...props({ uploading: 0 })} />)
    rerender(<SyncStatus {...props({ uploading: 1240 })} />)
    expect(screen.getByText('1,240 saved')).toBeInTheDocument()
    rerender(<SyncStatus {...props({ uploading: null })} />)
    expect(message()).toHaveTextContent('Saved 1,240 activities to your library.')
  })

  it('groups the count in an issue sentence from a thousand on', () => {
    render(<SyncStatus {...props({ issues: [issue('activity-conflict', 1204)] })} />)
    expect(message()).toHaveTextContent('1,204 workouts are already saved from different files.')
  })

  it('shows no running count when no upload is in progress', () => {
    render(<SyncStatus {...props({ uploading: null })} />)
    expect(screen.queryByText(/saved$/)).not.toBeInTheDocument()
  })

  it('reports the issues of a finished upload in place of the saved message', () => {
    const { rerender } = render(<SyncStatus {...props({ uploading: 0 })} />)
    rerender(<SyncStatus {...props({ uploading: null, issues: [issue('network', 3)] })} />)
    const status = message()
    expect(status).toHaveTextContent(
      '3 activities were not fully saved because the connection dropped. They save when the connection returns.',
    )
    expect(status).toHaveClass('sync-status__message--failed')
  })

  it('draws a warning icon before a failed save, and none before a saved one', () => {
    const { rerender } = render(<SyncStatus {...props({ issues: [issue('network', 2)] })} />)
    const icon = message().querySelector('svg.icon')
    expect(icon).not.toBeNull()
    expect(icon).toHaveAttribute('aria-hidden', 'true')
    rerender(<SyncStatus {...props({ uploading: 0 })} />)
    rerender(<SyncStatus {...props({ uploading: null, savedCount: 2 })} />)
    expect(message().querySelector('svg')).toBeNull()
  })

  it('keeps reporting issues while idle, so they are not lost after the upload ends', () => {
    render(<SyncStatus {...props({ issues: [issue('server', 1)] })} />)
    expect(message()).toHaveTextContent(
      '1 activity was not fully saved because of a server error. It saves the next time the page loads.',
    )
  })

  it('names the profile setting when originals are off, not a server error', () => {
    render(<SyncStatus {...props({ issues: [issue('originals-off', 2)] })} />)
    expect(message()).toHaveTextContent(
      'Original files are turned off in your profile, so 2 originals were not kept. The summaries were saved. Turn on Keep original files in my library on Profile to keep them.',
    )
    expect(message()).not.toHaveTextContent(/server error/)
  })

  it('keeps earlier issues visible while a new upload runs', () => {
    const { rerender } = render(<SyncStatus {...props({ issues: [issue('server', 1)] })} />)
    rerender(<SyncStatus {...props({ uploading: 0, issues: [issue('server', 1)] })} />)
    expect(message()).toHaveTextContent('not fully saved because of a server error')
  })

  it('joins several issues into one message, one sentence each', () => {
    render(
      <SyncStatus {...props({ issues: [issue('storage-budget', 2), issue('rate-limited', 4)] })} />,
    )
    expect(message()).toHaveTextContent(
      'Original-file storage is paused for now, so 2 originals were not kept. The summaries were saved. Too many requests at once. 4 waiting. Wait a minute, then add the rest again.',
    )
  })

  it.each<[SyncIssue['code'], number, string]>([
    [
      'signed-out',
      2,
      '2 activities were not saved because you were signed out. Sign in and add them again.',
    ],
    [
      'signed-out',
      1,
      '1 activity was not saved because you were signed out. Sign in and add it again.',
    ],
    [
      'account-changed',
      3,
      'Your account changed in another tab, so 3 activities were not saved. Reload this page.',
    ],
    [
      'account-changed',
      1,
      'Your account changed in another tab, so 1 activity was not saved. Reload this page.',
    ],
    [
      'activity-quota',
      2,
      'Your library is full (5,000 activities). 2 waiting. Delete older activities to make room, then add the rest again.',
    ],
    [
      'activity-quota',
      1,
      'Your library is full (5,000 activities). 1 waiting. Delete older activities to make room, then add the rest again.',
    ],
    [
      'storage-quota',
      2,
      'Your original-file storage is full, so 2 originals were not kept. The summaries were saved.',
    ],
    [
      'storage-quota',
      1,
      'Your original-file storage is full, so 1 original was not kept. The summary was saved.',
    ],
    [
      'storage-budget',
      2,
      'Original-file storage is paused for now, so 2 originals were not kept. The summaries were saved.',
    ],
    [
      'storage-budget',
      1,
      'Original-file storage is paused for now, so 1 original was not kept. The summary was saved.',
    ],
    [
      'file-too-large',
      2,
      '2 originals were too large to keep (over 50 MB). The summaries were saved.',
    ],
    ['file-too-large', 1, '1 original was too large to keep (over 50 MB). The summary was saved.'],
    [
      'rate-limited',
      2,
      'Too many requests at once. 2 waiting. Wait a minute, then add the rest again.',
    ],
    [
      'rate-limited',
      1,
      'Too many requests at once. 1 waiting. Wait a minute, then add the rest again.',
    ],
    [
      'network',
      2,
      '2 activities were not fully saved because the connection dropped. They save when the connection returns.',
    ],
    [
      'network',
      1,
      '1 activity was not fully saved because the connection dropped. It saves when the connection returns.',
    ],
    [
      'server',
      2,
      '2 activities were not fully saved because of a server error. They save the next time the page loads.',
    ],
    [
      'server',
      1,
      '1 activity was not fully saved because of a server error. It saves the next time the page loads.',
    ],
    [
      'digest-quota',
      2,
      'Your saved analyses have reached the storage limit. Delete some saved activities to save more.',
    ],
    [
      'database-full',
      2,
      'Saving is paused because the service is near its storage capacity. Your analysis still works on this device.',
    ],
    [
      'read-only',
      2,
      'Saving is paused while the service is looked after. Your analysis still works on this device, and what is waiting is kept here and sent on a later visit.',
    ],
    [
      'activity-conflict',
      1,
      'This workout is already saved from a different file. Delete the saved copy first to replace it.',
    ],
    [
      'activity-conflict',
      2,
      '2 workouts are already saved from different files. Delete the saved copies first to replace them.',
    ],
  ])('says what happened and what works for %s with %i affected', (code, count, text) => {
    render(<SyncStatus {...props({ issues: [issue(code, count)] })} />)
    expect(message()).toHaveTextContent(text)
  })

  it('says the daily save limit resets at a local time, with no UTC in the words', () => {
    render(<SyncStatus {...props({ issues: [issue('daily-limit', 2)] })} />)
    expect(message()).toHaveTextContent(
      /^You have reached today's limit on saves\. 2 waiting\. It resets at .+, your time\. Add the rest again after that\.$/,
    )
  })

  it.each<[SyncIssue['code'], RegExp]>([
    [
      'daily-limit',
      /^You have reached today's limit on saves\. 1,240 saved, 310 waiting\. It resets at .+, your time\. Add the rest again after that\.$/,
    ],
    [
      'activity-quota',
      /^Your library is full \(5,000 activities\)\. 1,240 saved, 310 waiting\. Delete older activities to make room, then add the rest again\.$/,
    ],
    [
      'rate-limited',
      /^Too many requests at once\. 1,240 saved, 310 waiting\. Wait a minute, then add the rest again\.$/,
    ],
  ])('says how many saved and how many are waiting when an import stops at %s', (code, text) => {
    const { rerender } = render(<SyncStatus {...props({ uploading: 0 })} />)
    rerender(<SyncStatus {...props({ uploading: 1240 })} />)
    rerender(<SyncStatus {...props({ uploading: null, issues: [issue(code, 310)] })} />)
    const status = message()
    expect(status.textContent).toMatch(text)
    expect(status).toHaveClass('sync-status__message--failed')
  })

  it('counts only what the latest import left as waiting beside what it saved', () => {
    const { rerender } = render(<SyncStatus {...props({ uploading: 0 })} />)
    rerender(<SyncStatus {...props({ uploading: 90 })} />)
    rerender(
      <SyncStatus
        {...props({
          uploading: null,
          issues: [{ code: 'daily-limit', count: 310, latest: 10 }],
        })}
      />,
    )
    expect(message().textContent).toMatch(
      /^You have reached today's limit on saves\. 90 saved, 10 waiting\. /,
    )
  })

  it('leaves the saved count out for a limit an earlier import reached', () => {
    const { rerender } = render(<SyncStatus {...props({ uploading: 0 })} />)
    rerender(<SyncStatus {...props({ uploading: 4 })} />)
    rerender(
      <SyncStatus
        {...props({
          uploading: null,
          issues: [{ code: 'activity-quota', count: 310, latest: 0 }],
        })}
      />,
    )
    expect(message()).toHaveTextContent(
      'Your library is full (5,000 activities). 310 waiting. Delete older activities to make room, then add the rest again.',
    )
  })

  it('says how many of a full library’s rows are copies the analysis hides', () => {
    const { rerender } = render(<SyncStatus {...props({ uploading: 0 })} />)
    rerender(
      <SyncStatus
        {...props({
          uploading: null,
          issues: [{ code: 'activity-quota', count: 10, latest: 0 }],
          hiddenCopies: 120,
        })}
      />,
    )
    expect(message()).toHaveTextContent(
      'Your library is full (5,000 activities, 120 of them copies of the same workout from another file). 10 waiting.',
    )
    rerender(
      <SyncStatus
        {...props({
          uploading: null,
          issues: [{ code: 'activity-quota', count: 10, latest: 0 }],
          hiddenCopies: 1,
        })}
      />,
    )
    expect(message()).toHaveTextContent('1 of them a copy of the same workout from another file')
  })

  it('says none were saved when the limit came before the first save', () => {
    const { rerender } = render(<SyncStatus {...props({ uploading: 0 })} />)
    rerender(<SyncStatus {...props({ uploading: null, issues: [issue('rate-limited', 40)] })} />)
    expect(message()).toHaveTextContent(
      'Too many requests at once. 0 saved, 40 waiting. Wait a minute, then add the rest again.',
    )
  })

  it('shows issues to a signed-out visitor, who is the one who needs to sign in', () => {
    render(<SyncStatus {...props({ signedIn: false, issues: [issue('signed-out', 1)] })} />)
    expect(message()).toHaveTextContent('Sign in and add it again.')
  })

  it('shows no running count while signed out', () => {
    render(<SyncStatus {...props({ signedIn: false, uploading: 4 })} />)
    expect(screen.queryByText('4 saved')).not.toBeInTheDocument()
  })
})

describe('SyncStatus: what moved', () => {
  it('keeps the numbers note in the completion once the list has gone', () => {
    const { rerender } = render(<SyncStatus {...props({ uploading: 0, moved: true })} />)
    rerender(<SyncStatus {...props({ uploading: 3, moved: true })} />)
    rerender(<SyncStatus {...props({ uploading: null, moved: true })} />)
    rerender(<SyncStatus {...props({ uploading: null, moved: false })} />)
    expect(message()).toHaveTextContent('Saved 3 activities to your library. Your numbers moved.')
  })

  it('says the numbers moved in the completion announcement', () => {
    const { rerender } = render(<SyncStatus {...props({ uploading: 0, moved: true })} />)
    rerender(<SyncStatus {...props({ uploading: 3, moved: true })} />)
    rerender(<SyncStatus {...props({ uploading: null, moved: true })} />)
    expect(message()).toHaveTextContent('Saved 3 activities to your library. Your numbers moved.')
  })

  it('leaves the numbers out of the completion when nothing moved', () => {
    const { rerender } = render(<SyncStatus {...props({ uploading: 0 })} />)
    rerender(<SyncStatus {...props({ uploading: 3 })} />)
    rerender(<SyncStatus {...props({ uploading: null })} />)
    expect(message().textContent).toBe('Saved 3 activities to your library.')
  })
})

describe('SyncStatus retry', () => {
  it.each(['network', 'server'] as const)(
    'offers Try again now for a %s failure, and hands the button to the caller',
    async (code) => {
      const onRetry = vi.fn()
      render(<SyncStatus {...props({ issues: [issue(code, 2)], onRetry })} />)
      const button = screen.getByRole('button', { name: 'Try again now' })
      await userEvent.click(button)
      expect(onRetry).toHaveBeenCalledWith(button)
    },
  )

  it('offers no button for a failure that waits on the athlete, or without a way to retry', () => {
    const { rerender } = render(
      <SyncStatus {...props({ issues: [issue('signed-out', 1)], onRetry: vi.fn() })} />,
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    rerender(<SyncStatus {...props({ issues: [issue('network', 1)] })} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('never tells the athlete to add the files again for a failure that saves itself', () => {
    render(
      <SyncStatus
        {...props({ issues: [issue('network', 1), issue('server', 2)], onRetry: vi.fn() })}
      />,
    )
    expect(message().textContent).not.toMatch(/again to retry|add (it|them) again/i)
    expect(message().textContent).toMatch(/Try again now/)
  })
})
