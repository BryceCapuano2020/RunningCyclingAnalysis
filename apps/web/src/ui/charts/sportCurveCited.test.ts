import { describe, expect, it } from 'vitest'
import type { CurveRow } from './curveTable'
import { changeOf } from './test/changeFixtures'
import { citedDurationS, namedChangeAt } from './sportCurveCited'

const row = (
  durationS: number,
  value: number,
  previous = NaN,
  carry: { carried?: boolean; previousCarried?: boolean } = {},
): CurveRow => ({ durationS, value, previous, activityId: 'a', ...carry })

const base = {
  units: 'metric',
  previousLabel: 'Previous 12 weeks',
  change: changeOf('higher'),
} as const
const unchanged = { ...base, change: changeOf('none') } as const

describe('citedDurationS', () => {
  it('is the effort the comparison reads, when the comparison cites it', () => {
    const rows = [
      row(300, 330, 320),
      row(900, 280, 216),
      row(1200, 263, 263, { previousCarried: true }),
    ]
    // The 20 minute effort is carried in the earlier period, so the comparison reads the 15 minutes: 64 W.
    expect(citedDurationS({ ...base, sport: 'ride', rows })).toBe(900)
  })

  it('is the 20 minutes when that is what the comparison reads', () => {
    expect(
      citedDurationS({ ...base, sport: 'ride', rows: [row(300, 330, 320), row(1200, 263, 250)] }),
    ).toBe(1200)
  })

  it('is the length a no-clear-change title names, so the plot marks it', () => {
    expect(citedDurationS({ ...unchanged, sport: 'ride', rows: [row(900, 250, 250)] })).toBe(900)
    expect(citedDurationS({ ...unchanged, sport: 'ride', rows: [row(1200, 250, 250)] })).toBe(1200)
  })

  it('is none without a period before, whose title names the best 20 minutes', () => {
    expect(
      citedDurationS({
        ...base,
        previousLabel: null,
        change: null,
        sport: 'ride',
        rows: [row(900, 250, 240)],
      }),
    ).toBeNull()
  })
})

describe('a second chart of the finding', () => {
  const input = { ...unchanged, sport: 'run', rows: [row(1200, 4.0, 3.9)] } as const

  it('leaves a second chart of the finding to cite only a change, so the page says no change once', () => {
    expect(namedChangeAt(input, 1200)).toBeNull()
    expect(namedChangeAt({ ...input, change: changeOf('higher') }, 1200)).toContain('is')
  })
})
