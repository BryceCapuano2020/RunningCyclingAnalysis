import { LIST_ROWS_LIMIT_MESSAGE } from '@rca/contract'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { limitReached, listingLimitReached, resetSentence } from './limitCopy'

/** The local time the viewer sees for an instant, formatted the way the copy formats it. */
function localTime(ms: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(ms)
}

afterEach(() => {
  vi.useRealTimers()
})

describe('resetSentence', () => {
  it('gives the reset time in the viewer local time, with no UTC in the words', () => {
    const resetsAt = Date.UTC(2026, 9, 24)
    expect(resetSentence(resetsAt)).toBe(`It resets at ${localTime(resetsAt)}, your time.`)
  })

  it('uses the next UTC midnight, told in local time, when no reset time is given', () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.UTC(2026, 9, 23, 15, 30))
    const nextMidnight = Date.UTC(2026, 9, 24)
    expect(resetSentence()).toBe(`It resets at ${localTime(nextMidnight)}, your time.`)
  })
})

describe('limitReached', () => {
  // The allowances are written out, not read from DAILY_LIMITS, so a copy that loses its grouping fails.
  it.each([
    ['activityCreate', 'saves', '5,000'],
    ['fileUpload', 'uploads', '2,000'],
    ['fileDownload', 'downloads', '5,000'],
    ['read', 'library loads', '100'],
    ['activityDelete', 'deletions', '50'],
    ['profileWrite', 'profile changes', '50'],
    ['measurementWrite', 'changes to your dated settings', '200'],
    ['measurementRead', 'loads of your dated settings', '300'],
  ] as const)('names %s as "%s", with its daily allowance of %s', (action, noun, allowance) => {
    const resetsAt = Date.UTC(2026, 9, 24)
    expect(limitReached(action, resetsAt)).toBe(
      `You have reached today's limit on ${noun} (${allowance} per day). ${resetSentence(resetsAt)}`,
    )
  })
})

describe('listingLimitReached', () => {
  const resetsAt = Date.UTC(2026, 9, 24)

  it('names the rows allowance when the server refused a page of rows', () => {
    expect(listingLimitReached(LIST_ROWS_LIMIT_MESSAGE, resetsAt)).toBe(
      `You have reached today's limit on rows listed from your library (200,000 per day). It resets at ${localTime(resetsAt)}, your time.`,
    )
  })

  it('names the library loads for any other daily refusal of a listing', () => {
    expect(listingLimitReached('You have reached your daily limit.', resetsAt)).toBe(
      limitReached('read', resetsAt),
    )
  })
})
