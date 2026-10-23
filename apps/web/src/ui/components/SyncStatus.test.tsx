// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { SyncIssue } from '@rca/core/session'
import { SyncStatus } from './SyncStatus'
import type { SyncStatusProps } from './SyncStatus'

afterEach(() => {
  cleanup()
})

function props(overrides: Partial<SyncStatusProps> = {}): SyncStatusProps {
  return { uploading: null, issues: [], signedIn: true, ...overrides }
}

const issue = (code: SyncIssue['code'], count: number): SyncIssue => ({ code, count })

describe('SyncStatus', () => {
  it('keeps one live status region mounted, empty when idle', () => {
    render(<SyncStatus {...props()} />)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('stays mounted and empty when signed out with nothing to report', () => {
    const { rerender } = render(<SyncStatus {...props({ signedIn: false })} />)
    rerender(<SyncStatus {...props({ signedIn: false, uploading: null })} />)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    expect(screen.queryByText(/saved/)).not.toBeInTheDocument()
  })

  it('does not announce the start of an upload, since the analysis status already does', () => {
    const { rerender } = render(<SyncStatus {...props()} />)
    rerender(<SyncStatus {...props({ uploading: 0 })} />)
    rerender(<SyncStatus {...props({ uploading: 3 })} />)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('keeps the live text empty during the upload and shows the running count outside it', () => {
    const { rerender } = render(<SyncStatus {...props()} />)
    rerender(<SyncStatus {...props({ uploading: 0 })} />)
    rerender(<SyncStatus {...props({ uploading: 12 })} />)
    rerender(<SyncStatus {...props({ uploading: 13 })} />)

    const status = screen.getByRole('status')
    expect(status).toBeEmptyDOMElement()
    const count = screen.getByText('13 saved')
    expect(count).toHaveAttribute('aria-hidden', 'true')
    expect(status).not.toContainElement(count)
  })

  it('announces a finished upload with the saved count, in the singular and the plural', () => {
    const { rerender } = render(<SyncStatus {...props({ uploading: 0 })} />)
    rerender(<SyncStatus {...props({ uploading: 12 })} />)
    rerender(<SyncStatus {...props({ uploading: null })} />)
    expect(screen.getByRole('status')).toHaveTextContent('Saved 12 activities to your library')
    expect(screen.getByRole('status')).not.toHaveClass('sync-status__message--failed')
    expect(screen.queryByText('12 saved')).not.toBeInTheDocument()

    rerender(<SyncStatus {...props({ uploading: 0 })} />)
    rerender(<SyncStatus {...props({ uploading: 1 })} />)
    rerender(<SyncStatus {...props({ uploading: null })} />)
    expect(screen.getByRole('status')).toHaveTextContent('Saved 1 activity to your library')
  })

  it('never shows a saved count of zero, and says so when a signed-in import saved nothing', () => {
    const { rerender } = render(<SyncStatus {...props({ uploading: 0 })} />)
    expect(screen.queryByText('0 saved')).not.toBeInTheDocument()

    rerender(<SyncStatus {...props({ uploading: null })} />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('No new activities were saved to your library.')
    expect(status).not.toHaveTextContent('Saved 0')
    expect(status).not.toHaveClass('sync-status__message--failed')
  })

  it('does not announce a start or finish for an upload that was already running on mount', () => {
    const { rerender } = render(<SyncStatus {...props({ uploading: 5 })} />)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    expect(screen.getByText('5 saved')).toHaveAttribute('aria-hidden', 'true')

    rerender(<SyncStatus {...props({ uploading: 6 })} />)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('shows no running count when no upload is in progress', () => {
    render(<SyncStatus {...props({ uploading: null })} />)
    expect(screen.queryByText(/saved$/)).not.toBeInTheDocument()
  })

  it('reports the issues of a finished upload in place of the saved message', () => {
    const { rerender } = render(<SyncStatus {...props({ uploading: 0 })} />)
    rerender(<SyncStatus {...props({ uploading: null, issues: [issue('network', 3)] })} />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent(
      '3 activities were not fully saved because the connection dropped. Re-import them to retry.',
    )
    expect(status).toHaveClass('sync-status__message--failed')
  })

  it('keeps reporting issues while idle, so they are not lost after the upload ends', () => {
    render(<SyncStatus {...props({ issues: [issue('server', 1)] })} />)
    expect(screen.getByRole('status')).toHaveTextContent(
      '1 activity was not fully saved because of a server error. Re-import it to retry.',
    )
  })

  it('keeps earlier issues visible while a new upload runs', () => {
    const { rerender } = render(<SyncStatus {...props({ issues: [issue('server', 1)] })} />)
    rerender(<SyncStatus {...props({ uploading: 0, issues: [issue('server', 1)] })} />)
    expect(screen.getByRole('status')).toHaveTextContent(
      'not fully saved because of a server error',
    )
  })

  it('joins several issues into one message, one sentence each', () => {
    render(
      <SyncStatus {...props({ issues: [issue('storage-budget', 2), issue('rate-limited', 4)] })} />,
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'Original-file storage is paused for now, so 2 originals were not kept. The summaries were saved. Too many requests at once, so 4 activities were not fully saved. Wait a minute, then re-import them.',
    )
  })

  it.each<[SyncIssue['code'], number, string]>([
    [
      'signed-out',
      2,
      '2 activities were not saved because you were signed out. Sign in and re-import them.',
    ],
    [
      'signed-out',
      1,
      '1 activity was not saved because you were signed out. Sign in and re-import it.',
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
      'Your library is full (5,000 activities), so 2 activities were not saved. Delete older activities to make room.',
    ],
    [
      'activity-quota',
      1,
      'Your library is full (5,000 activities), so 1 activity was not saved. Delete older activities to make room.',
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
      'Too many requests at once, so 2 activities were not fully saved. Wait a minute, then re-import them.',
    ],
    [
      'rate-limited',
      1,
      'Too many requests at once, so 1 activity was not fully saved. Wait a minute, then re-import it.',
    ],
    [
      'network',
      2,
      '2 activities were not fully saved because the connection dropped. Re-import them to retry.',
    ],
    [
      'network',
      1,
      '1 activity was not fully saved because the connection dropped. Re-import it to retry.',
    ],
    [
      'server',
      2,
      '2 activities were not fully saved because of a server error. Re-import them to retry.',
    ],
    [
      'server',
      1,
      '1 activity was not fully saved because of a server error. Re-import it to retry.',
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
    expect(screen.getByRole('status')).toHaveTextContent(text)
  })

  it('says the daily save limit resets at 00:00 UTC, with the local time of that reset', () => {
    render(<SyncStatus {...props({ issues: [issue('daily-limit', 2)] })} />)
    expect(screen.getByRole('status')).toHaveTextContent(
      /^You have reached today's limit on saves, so 2 activities were not fully saved\. It resets at 00:00 UTC \(.+ your time\)\. Re-import them after that\.$/,
    )
  })

  it('shows issues to a signed-out visitor, who is the one who needs to sign in', () => {
    render(<SyncStatus {...props({ signedIn: false, issues: [issue('signed-out', 1)] })} />)
    expect(screen.getByRole('status')).toHaveTextContent('Sign in and re-import it.')
  })

  it('shows no running count while signed out', () => {
    render(<SyncStatus {...props({ signedIn: false, uploading: 4 })} />)
    expect(screen.queryByText('4 saved')).not.toBeInTheDocument()
  })
})
