import { describe, expect, it } from 'vitest'
import { DAY_MS } from '@rca/core/constants'
import type { Period } from '@rca/core/period'
import { sameAsShorterText } from './periodSame'

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

describe('sameAsShorterText', () => {
  const library = ago(0, 3, 10, 30)

  it('names the shortest period that holds the same activities, with their count', () => {
    expect(sameAsShorterText(library, period('default', 84))).toBe(
      'Same 4 activities as the 6 weeks to your latest activity',
    )
    expect(sameAsShorterText(library, period(365, 365))).toBe(
      'Same 4 activities as the 6 weeks to your latest activity',
    )
    expect(sameAsShorterText(library, period('all', null))).toBe(
      'Same 4 activities as the 6 weeks to your latest activity',
    )
  })

  it('names the nearest shorter period that holds as many, not a shorter one that holds fewer', () => {
    const more = ago(0, 3, 10, 60)
    expect(sameAsShorterText(more, period('default', 84))).toBeNull()
    expect(sameAsShorterText(more, period(365, 365))).toBe(
      'Same 4 activities as the 12 weeks to your latest activity',
    )
  })

  it('says nothing for the shortest period, a custom range, or a period with nothing in it', () => {
    expect(sameAsShorterText(library, period(42, 42))).toBeNull()
    expect(
      sameAsShorterText(library, period({ from: '2025-01-01', to: '2025-02-01' }, 31)),
    ).toBeNull()
    expect(sameAsShorterText([], period('all', null))).toBeNull()
  })

  it('says nothing where each period holds more than the one before', () => {
    expect(sameAsShorterText(ago(0, 60, 200, 500), period('all', null))).toBeNull()
  })

  it('writes one activity in the singular', () => {
    expect(sameAsShorterText(ago(0), period('default', 84))).toBe(
      'Same 1 activity as the 6 weeks to your latest activity',
    )
  })
})
