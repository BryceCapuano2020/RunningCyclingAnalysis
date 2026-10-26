import { afterEach, describe, expect, it, vi } from 'vitest'
import { DAILY_LIMITS } from '@rca/contract'
import { limitReached, resetSentence } from './limitCopy'

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
  it.each([
    ['activityCreate', 'saves'],
    ['fileUpload', 'uploads'],
    ['fileDownload', 'downloads'],
    ['read', 'library loads'],
    ['activityDelete', 'deletions'],
  ] as const)('names %s as "%s" with its daily allowance', (action, noun) => {
    const resetsAt = Date.UTC(2026, 9, 24)
    expect(limitReached(action, resetsAt)).toBe(
      `You have reached today's limit on ${noun} (${DAILY_LIMITS[action]} per day). ${resetSentence(resetsAt)}`,
    )
  })
})
