import { describe, expect, it } from 'vitest'
import type { Period } from '@rca/core/period'
import { betweenClause, latestActivityText, listEmptyText, sportEmptyText } from './periodCopy'

const SIX_WEEKS: Period = {
  choice: 42,
  startMs: new Date(2025, 4, 12, 12).getTime(),
  endMs: new Date(2025, 7, 3, 12).getTime(),
  days: 42,
  fellBack: false,
}

describe('betweenClause', () => {
  it('names a dated span as a clause, "between 12 May and 3 Aug 2025"', () => {
    expect(betweenClause(SIX_WEEKS)).toBe('between 12 May and 3 Aug 2025')
  })

  it('is empty for a span with no dates, so a sentence can leave the clause out', () => {
    expect(betweenClause({ startMs: null, endMs: null })).toBe('')
    expect(betweenClause(undefined)).toBe('')
  })
})

describe('sportEmptyText', () => {
  it('names the period and the count in All time, when the sport is in the library', () => {
    expect(sportEmptyText('ride', SIX_WEEKS, 14)).toBe(
      'No rides between 12 May and 3 Aug 2025. You have 14 rides in All time.',
    )
  })

  it('asks for files when the library has none of the sport', () => {
    expect(sportEmptyText('run', SIX_WEEKS, 0)).toBe(
      'Your files have no runs yet. Add runs to see your records.',
    )
  })

  it('uses the singular for one activity in All time', () => {
    expect(sportEmptyText('run', SIX_WEEKS, 1)).toBe(
      'No runs between 12 May and 3 Aug 2025. You have 1 run in All time.',
    )
  })
})

describe('listEmptyText', () => {
  it('names the dates of the window the list is empty in', () => {
    expect(
      listEmptyText('run', {
        startMs: new Date(2026, 3, 21, 7).getTime(),
        endMs: new Date(2026, 5, 1, 23, 59).getTime(),
      }),
    ).toBe('No runs between 21 Apr and 1 Jun 2026.')
  })

  it('says the files have none, with no dates, for all activities', () => {
    expect(listEmptyText('all', null)).toBe('No activities in your files.')
  })
})

describe('latestActivityText', () => {
  /** A fixed clock: 25 October 2026, so the months and weeks ago do not depend on the day run. */
  const NOW = new Date(2026, 9, 25, 12).getTime()

  it('says nothing while the newest activity is within six weeks', () => {
    expect(latestActivityText(new Date(2026, 8, 20, 12).getTime(), NOW)).toBeNull()
  })

  it('names the newest activity’s day and how many months ago it was, once it is older', () => {
    expect(latestActivityText(new Date(2025, 5, 3, 7).getTime(), NOW)).toBe(
      'Latest activity Tue 3 Jun 2025, 16 months ago',
    )
  })

  it('counts weeks for a gap of less than two months', () => {
    expect(latestActivityText(new Date(2026, 8, 1, 12).getTime(), NOW)).toBe(
      'Latest activity Tue 1 Sep, 7 weeks ago',
    )
  })

  it('says nothing when the library has no activity', () => {
    expect(latestActivityText(null, NOW)).toBeNull()
  })
})
