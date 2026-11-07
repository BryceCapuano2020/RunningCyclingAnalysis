import { describe, expect, it } from 'vitest'
import { DAY_MS } from '@rca/core/constants'
import type { Period } from '@rca/core/period'
import { sameAsShorter } from './periodSame'

const NEWEST = Date.UTC(2025, 5, 3, 12)
/** Activities that many days before the newest, so a period's window holds those within it. */
const ago = (...days: number[]) => days.map((d) => ({ startMs: NEWEST - d * DAY_MS }))
const period = (choice: Period['choice'], days: number | null): Period => ({
  choice,
  startMs: null,
  endMs: null,
  days,
  fellBack: false,
})

describe('sameAsShorter', () => {
  const library = ago(0, 3, 10, 30)

  it('names the shortest period that holds the same activities, with their count', () => {
    expect(sameAsShorter(library, period('default', 84))).toEqual({ count: 4, length: '6 weeks' })
    expect(sameAsShorter(library, period(365, 365))).toEqual({ count: 4, length: '6 weeks' })
    expect(sameAsShorter(library, period('all', null))).toEqual({ count: 4, length: '6 weeks' })
  })

  it('names the nearest shorter period that holds as many, not a shorter one that holds fewer', () => {
    const more = ago(0, 3, 10, 60)
    expect(sameAsShorter(more, period('default', 84))).toBeNull()
    expect(sameAsShorter(more, period(365, 365))).toEqual({ count: 4, length: '12 weeks' })
  })

  it('says nothing for the shortest period, a custom range, or a period with nothing in it', () => {
    expect(sameAsShorter(library, period(42, 42))).toBeNull()
    expect(sameAsShorter(library, period({ from: '2025-01-01', to: '2025-02-01' }, 31))).toBeNull()
    expect(sameAsShorter([], period('all', null))).toBeNull()
  })

  it('says nothing where each period holds more than the one before', () => {
    expect(sameAsShorter(ago(0, 60, 200, 500), period('all', null))).toBeNull()
  })

  it('writes one activity in the singular', () => {
    expect(sameAsShorter(ago(0), period('default', 84))).toEqual({ count: 1, length: '6 weeks' })
  })
})
