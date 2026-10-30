import type { Copy } from '@rca/core/session'
import { LIST_ROWS_LIMIT_MESSAGE } from '@rca/contract'
import { describe, expect, it } from 'vitest'
import {
  addedSentence,
  deleteFailureText,
  deleteNoticeText,
  exportFailureText,
  limitedSentence,
  notAddedSentence,
  rebuildNoticeText,
  importSentence,
  RETENTION_UNAVAILABLE,
  STOPPED_BY_USER,
  workerFailureText,
} from './copy'
import type { RebuildOutcome } from './copy'
import { formatDay } from '../format/date'

const SAVED_COPY: Copy = {
  id: 'saved-copy',
  rank: 3,
  hasPower: false,
  hasHeartRate: true,
  durationS: 3600,
}

const NOW = new Date(2026, 9, 23).getTime()
const MARCH_2023 = new Date(2023, 2, 4, 9).getTime()
const OCTOBER_2026 = new Date(2026, 9, 20, 7).getTime()

describe('addedSentence', () => {
  const MARCH_2026 = new Date(2026, 2, 4, 9).getTime()
  const OCTOBER_2023 = new Date(2023, 9, 20, 7).getTime()

  it('says how many runs and rides were added, with the years on both ends when they differ', () => {
    expect(
      addedSentence(
        { runs: 412, rides: 388, firstStartMs: MARCH_2023, lastStartMs: OCTOBER_2026 },
        NOW,
      ),
    ).toBe('Added 412 runs and 388 rides, from Mar 2023 to Oct 2026.')
  })

  it('leaves the year out when both ends are in the current year', () => {
    expect(
      addedSentence(
        { runs: 2, rides: 0, firstStartMs: MARCH_2026, lastStartMs: OCTOBER_2026 },
        NOW,
      ),
    ).toBe('Added 2 runs, from Mar to Oct.')
  })

  it('gives the year on both ends when both are in a year that is not this one', () => {
    expect(
      addedSentence(
        { runs: 0, rides: 3, firstStartMs: MARCH_2023, lastStartMs: OCTOBER_2023 },
        NOW,
      ),
    ).toBe('Added 3 rides, from Mar 2023 to Oct 2023.')
  })

  it('names one month alone, with its year when it is not this year', () => {
    expect(
      addedSentence(
        { runs: 2, rides: 0, firstStartMs: OCTOBER_2026, lastStartMs: OCTOBER_2026 },
        NOW,
      ),
    ).toBe('Added 2 runs, in Oct.')
    expect(
      addedSentence(
        { runs: 0, rides: 2, firstStartMs: OCTOBER_2023, lastStartMs: OCTOBER_2023 },
        NOW,
      ),
    ).toBe('Added 2 rides, in Oct 2023.')
  })

  it('names the day of a single run or ride, since one activity has one date', () => {
    expect(
      addedSentence(
        { runs: 1, rides: 0, firstStartMs: OCTOBER_2026, lastStartMs: OCTOBER_2026 },
        NOW,
      ),
    ).toBe('Added 1 run, on 20 Oct.')
    expect(
      addedSentence(
        { runs: 0, rides: 1, firstStartMs: OCTOBER_2023, lastStartMs: OCTOBER_2023 },
        NOW,
      ),
    ).toBe('Added 1 ride, on 20 Oct 2023.')
  })

  it('separates thousands', () => {
    expect(
      addedSentence(
        { runs: 1204, rides: 0, firstStartMs: MARCH_2023, lastStartMs: OCTOBER_2026 },
        NOW,
      ),
    ).toBe('Added 1,204 runs, from Mar 2023 to Oct 2026.')
  })

  it('is null when no run or ride was added, or no span is known', () => {
    expect(addedSentence({ runs: 0, rides: 0 }, NOW)).toBeNull()
    expect(addedSentence({ runs: 3, rides: 0 }, NOW)).toBeNull()
  })
})

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
  it('says what was updated, in the singular for one activity', () => {
    expect(rebuildNoticeText({ ...NOTHING_LIMITED, rebuilt: 1 })).toBe('Updated 1 saved activity.')
  })

  it('names the missing originals and the failures, each in its own sentence', () => {
    expect(rebuildNoticeText({ ...NOTHING_LIMITED, rebuilt: 3, missing: 2, failed: 1 })).toBe(
      'Updated 3 saved activities. 2 original files are missing or could not be matched; add those original files again. 1 could not be updated; try again when the server is available.',
    )
  })

  it('groups the counts of a rebuild from a thousand on', () => {
    expect(
      rebuildNoticeText({ ...NOTHING_LIMITED, rebuilt: 1204, missing: 1100, failed: 1050 }),
    ).toBe(
      'Updated 1,204 saved activities. 1,100 original files are missing or could not be matched; add those original files again. 1,050 could not be updated; try again when the server is available.',
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
      'Updated 1 saved activity. 1 activity was not updated. The server asked us to slow down; try again in a minute.',
    )
  })
})

describe('limitedSentence', () => {
  it('asks for a slower pace on a rate limit, whatever the count', () => {
    expect(limitedSentence(2, 'rate', null)).toBe(
      '2 activities were not updated. The server asked us to slow down; try again in a minute.',
    )
  })

  it('names the daily download limit and its reset on a daily limit', () => {
    const resetsAt = Date.UTC(2026, 9, 24)
    expect(limitedSentence(1, 'daily', resetsAt)).toBe(
      `1 activity was not updated because today's limit on downloads (5,000 per day) was reached. It resets at ${localTime(resetsAt)}, your time.`,
    )
  })

  it('groups a count of a thousand or more in the rate-limit and the plain sentence', () => {
    expect(limitedSentence(1204, 'rate', null)).toBe(
      '1,204 activities were not updated. The server asked us to slow down; try again in a minute.',
    )
    expect(limitedSentence(1204, null, null)).toBe(
      '1,204 activities were not updated. Try again later.',
    )
  })

  it('groups a count of a thousand or more on a daily limit', () => {
    const resetsAt = Date.UTC(2026, 9, 24)
    expect(limitedSentence(1204, 'daily', resetsAt)).toBe(
      `1,204 activities were not updated because today's limit on downloads (5,000 per day) was reached. It resets at ${localTime(resetsAt)}, your time.`,
    )
  })

  it('tells the user to try later when no limit was the cause', () => {
    expect(limitedSentence(3, null, null)).toBe('3 activities were not updated. Try again later.')
  })
})

describe('deleteNoticeText', () => {
  it('names the deleted activity and its date', () => {
    const startMs = Date.UTC(2026, 8, 1, 12)
    expect(
      deleteNoticeText({ id: 'a1', name: 'Morning run', startMs, sport: 'run', copy: SAVED_COPY }),
    ).toBe(`Deleted Morning run (${formatDay(startMs)}).`)
  })

  it('falls back to a plain confirmation when the activity is no longer listed', () => {
    expect(deleteNoticeText(undefined)).toBe('Deleted the activity.')
  })
})

describe('deleteFailureText', () => {
  it('reports a daily delete limit with its reset, and no generic prefix', () => {
    expect(deleteFailureText({ type: 'error', message: 'x', issue: 'daily-limit' })).toMatch(
      /^You have reached today's limit on deletions \(\d+ per day\)\. It resets at .*, your time\.$/,
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
      /^You have reached today's limit on library loads \(\d+ per day\)\. It resets at .*, your time\.$/,
    )
  })

  it('names the rows allowance when the server refused a page of rows part way through', () => {
    expect(
      exportFailureText({ type: 'error', message: LIST_ROWS_LIMIT_MESSAGE, issue: 'daily-limit' }),
    ).toMatch(
      /^You have reached today's limit on rows read from your library \(200,000 per day\)\. It resets at .*, your time\.$/,
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
      'Analysis stopped unexpectedly. Your saved library is reloading; add again any files that were not saved.',
    )
  })

  it('asks for a manual restart when a signed-in worker will not restart again', () => {
    expect(workerFailureText('signed-in', false, 'x')).toBe(
      'Analysis stopped unexpectedly. Restart analysis to reload your saved library; add again any files that were not saved.',
    )
  })

  it('says a signed-out worker reloads the results kept in this browser, and files must be added again', () => {
    expect(workerFailureText('signed-out', true, 'boom')).toBe(
      'Analysis stopped unexpectedly. Your results kept in this browser are reloading; add again any files that were being added.',
    )
  })

  it('asks for a restart when a signed-out worker will not restart again', () => {
    expect(workerFailureText('signed-out', false, 'boom')).toBe(
      'Analysis stopped unexpectedly. Restart analysis to reload your results kept in this browser; add again any files that were being added.',
    )
  })

  it('shows the event message when the account is not known', () => {
    expect(workerFailureText('loading', false, 'Script failed to load')).toBe(
      'Script failed to load',
    )
  })

  it('falls back to a generic failure when there is no event message', () => {
    expect(workerFailureText('unavailable', false, '')).toBe(
      'Analysis failed. Add again any files that were being added.',
    )
  })
})

describe('notAddedSentence', () => {
  it('says what was read was already in the library, counting the activities', () => {
    expect(notAddedSentence(1)).toBe('Nothing new: 1 activity already in your library.')
    expect(notAddedSentence(1204)).toBe('Nothing new: 1,204 activities already in your library.')
  })

  it('says no activities were analysed when the import read none', () => {
    expect(notAddedSentence(0)).toBe('No activities were analysed.')
  })
})

describe('importSentence', () => {
  it('says what an import added, the same sentence the summary shows and announces', () => {
    const added = {
      activities: 2,
      rejected: 0,
      runs: 2,
      rides: 0,
      firstStartMs: NOW,
      lastStartMs: NOW,
    }
    expect(importSentence(added, NOW)).toBe(addedSentence(added, NOW))
  })

  it('says nothing was new when the import added no run or ride', () => {
    expect(importSentence({ activities: 3, rejected: 0, duplicates: [] })).toBe(
      'Nothing new: 3 activities already in your library.',
    )
  })

  it('says how many already held activities got their detail back', () => {
    expect(importSentence({ activities: 1, rejected: 0, duplicates: [], detailRestored: 1 })).toBe(
      'Nothing new: 1 activity already in your library. Detail restored for 1 activity.',
    )
    const added = {
      activities: 5,
      rejected: 0,
      runs: 2,
      rides: 0,
      firstStartMs: NOW,
      lastStartMs: NOW,
      detailRestored: 3,
    }
    expect(importSentence(added, NOW)).toBe(
      `${addedSentence(added, NOW)} Detail restored for 3 activities.`,
    )
  })
})

describe('STOPPED_BY_USER', () => {
  it('is neutral and says what to do next, with no fault prefix', () => {
    expect(STOPPED_BY_USER).toBe("Stopped. Add your files again when you're ready.")
  })
})

describe('RETENTION_UNAVAILABLE', () => {
  it('says original files are not kept, rather than that they stay on this device', () => {
    expect(RETENTION_UNAVAILABLE).toContain('original files are not kept')
    expect(RETENTION_UNAVAILABLE).not.toContain('stay on this device')
  })
})
