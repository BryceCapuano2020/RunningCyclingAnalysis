import { DAILY_LIMITS } from '@rca/contract'
import { describe, expect, it } from 'vitest'
import {
  deleteFailureText,
  deleteNoticeText,
  exportFailureText,
  limitedSentence,
  rebuildNoticeText,
  workerFailureText,
} from './copy'
import type { RebuildOutcome } from './copy'

/** The local time the viewer sees for an instant, formatted the way the limit copy formats it. */
function localTime(ms: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(ms)
}

const NOTHING_LIMITED: RebuildOutcome = {
  rebuilt: 0,
  missing: 0,
  failed: 0,
  limited: 0,
  limitKind: null,
  limitResetsAtMs: null,
}

describe('rebuildNoticeText', () => {
  it('says what was rebuilt, in the singular for one activity', () => {
    expect(rebuildNoticeText({ ...NOTHING_LIMITED, rebuilt: 1 })).toBe('Rebuilt 1 saved activity.')
  })

  it('names the missing originals and the failures, each in its own sentence', () => {
    expect(rebuildNoticeText({ ...NOTHING_LIMITED, rebuilt: 3, missing: 2, failed: 1 })).toBe(
      'Rebuilt 3 saved activities. 2 original files are missing or could not be matched; re-import those original files. 1 could not be rebuilt; try again when the server is available.',
    )
  })

  it('uses the singular for one missing original', () => {
    expect(rebuildNoticeText({ ...NOTHING_LIMITED, rebuilt: 1, missing: 1 })).toContain(
      '1 original file is missing or could not be matched',
    )
  })

  it('adds the limited sentence last', () => {
    const resetsAt = Date.UTC(2026, 9, 24)
    expect(
      rebuildNoticeText({
        ...NOTHING_LIMITED,
        rebuilt: 1,
        limited: 1,
        limitKind: 'rate',
        limitResetsAtMs: resetsAt,
      }),
    ).toBe(
      'Rebuilt 1 saved activity. 1 activity was not rebuilt. The server asked us to slow down; try again in a minute.',
    )
  })
})

describe('limitedSentence', () => {
  it('asks for a slower pace on a rate limit, whatever the count', () => {
    expect(limitedSentence(2, 'rate', null)).toBe(
      '2 activities were not rebuilt. The server asked us to slow down; try again in a minute.',
    )
  })

  it('names the daily download limit and its reset on a daily limit', () => {
    const resetsAt = Date.UTC(2026, 9, 24)
    expect(limitedSentence(1, 'daily', resetsAt)).toBe(
      `1 activity was not rebuilt because today's limit on downloads (${DAILY_LIMITS.fileDownload} per day) was reached. It resets at 00:00 UTC (${localTime(resetsAt)} your time).`,
    )
  })

  it('tells the user to try later when no limit was the cause', () => {
    expect(limitedSentence(3, null, null)).toBe('3 activities were not rebuilt. Try again later.')
  })
})

describe('deleteNoticeText', () => {
  it('names the deleted activity and its date', () => {
    const startMs = Date.UTC(2026, 8, 1, 12)
    expect(deleteNoticeText({ id: 'a1', name: 'Morning run', startMs, sport: 'run' })).toBe(
      `Deleted Morning run (${new Date(startMs).toLocaleDateString()}).`,
    )
  })

  it('falls back to a plain confirmation when the activity is no longer listed', () => {
    expect(deleteNoticeText(undefined)).toBe('Deleted the activity.')
  })
})

describe('deleteFailureText', () => {
  it('reports a daily delete limit with its reset, and no generic prefix', () => {
    expect(deleteFailureText({ type: 'error', message: 'x', issue: 'daily-limit' })).toMatch(
      /^You have reached today's limit on deletions \(\d+ per day\)\. It resets at 00:00 UTC/,
    )
  })

  it('reports any other failure with the server message', () => {
    expect(deleteFailureText({ type: 'error', message: 'Network down' })).toBe(
      'Could not delete the activity. Network down',
    )
  })
})

describe('exportFailureText', () => {
  it('reports a daily read limit with its reset', () => {
    expect(exportFailureText({ type: 'error', message: 'x', issue: 'daily-limit' })).toMatch(
      /^You have reached today's limit on library loads \(\d+ per day\)\. It resets at 00:00 UTC/,
    )
  })

  it('reports any other failure with the server message', () => {
    expect(exportFailureText({ type: 'error', message: 'Disk full' })).toBe(
      'Could not download your data. Disk full',
    )
  })
})

describe('workerFailureText', () => {
  it('says a signed-in library is reloading when the worker will restart', () => {
    expect(workerFailureText('signed-in', true, 'x')).toBe(
      'The analysis worker stopped. Your saved library is reloading; re-import any local files that were not saved.',
    )
  })

  it('asks for a manual restart when a signed-in worker will not restart again', () => {
    expect(workerFailureText('signed-in', false, 'x')).toBe(
      'The analysis worker stopped. Restart analysis to reload your saved library; re-import any local files that were not saved.',
    )
  })

  it('asks a signed-out user to re-import, whatever the event says', () => {
    expect(workerFailureText('signed-out', true, 'boom')).toBe(
      'The analysis worker stopped. Re-import your files to continue.',
    )
  })

  it('shows the event message when the account is not known', () => {
    expect(workerFailureText('loading', false, 'Script failed to load')).toBe(
      'Script failed to load',
    )
  })

  it('falls back to a generic failure when there is no event message', () => {
    expect(workerFailureText('unavailable', false, '')).toBe(
      'The analysis worker failed. Re-import your files to continue.',
    )
  })
})
