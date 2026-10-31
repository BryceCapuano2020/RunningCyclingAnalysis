import { describe, expect, it } from 'vitest'
import type { CheckIn } from '@rca/core/lookback'
import { BUSY_CHECK_IN, QUIET_CHECK_IN } from './checkInFixtures'
import { checkInWords, firstRowOf } from './checkInRow'

const view = (checkIn: CheckIn | null, seen = false) => ({ checkIn, seen })

describe('which row leads under the fitness card', () => {
  const base = { importIncomplete: false, isSample: false }

  it('is the check-in while there is one that has not been seen', () => {
    expect(firstRowOf({ ...base, checkIn: view(QUIET_CHECK_IN) })).toBe('checkIn')
  })

  it('is none once it has been seen, or when there is no check-in', () => {
    expect(firstRowOf({ ...base, checkIn: view(QUIET_CHECK_IN, true) })).toBeNull()
    expect(firstRowOf({ ...base, checkIn: view(null) })).toBeNull()
  })

  it('is none while an import is known to have left the library short, and for the sample', () => {
    expect(
      firstRowOf({ ...base, importIncomplete: true, checkIn: view(QUIET_CHECK_IN) }),
    ).toBeNull()
    expect(firstRowOf({ ...base, isSample: true, checkIn: view(QUIET_CHECK_IN) })).toBeNull()
  })
})

describe('the words of the row', () => {
  it('say what was added and what was checked, with every date in its year', () => {
    const words = checkInWords(view(QUIET_CHECK_IN), 'metric')!
    expect(words.headline).toBe(
      '14 runs and 3 rides added since 2 October 2025. Nothing moved: no new bests, and run fitness shows no clear change, within 2% of before.',
    )
    expect(words.lines).toEqual([])
  })

  it('carry a new best in the athlete’s units, and none for no check-in', () => {
    const words = checkInWords(view(BUSY_CHECK_IN), 'metric')!
    expect(words.headline).toBe('Since 2 October 2025: 14 runs and 3 rides added.')
    expect(words.lines.join(' ')).toMatch(/New best 20 min run: 4:44 \/km/)
    expect(checkInWords(view(null), 'metric')).toBeNull()
  })

  it('stay clear of the words the app does not use', () => {
    for (const checkIn of [QUIET_CHECK_IN, BUSY_CHECK_IN]) {
      const { headline, lines } = checkInWords(view(checkIn), 'imperial')!
      expect([headline, ...lines].join(' ')).not.toMatch(
        /limiter|weak|strength|holding you back|ahead of|because|caused|possibly|may have|might/i,
      )
    }
  })
})
