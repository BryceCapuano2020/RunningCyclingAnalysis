import { describe, expect, it } from 'vitest'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import type { CurveRow } from '../charts/curveTable'
import { curveTakeaway, isClearChange } from '../charts/sportCurveTakeaway'
import { recordChange } from '../recordChange'

/** A speed, in m/s, whose pace is this many seconds a kilometre or a mile. */
function speedFor(seconds: number, units: UnitSystem): number {
  return (units === 'metric' ? 1000 : 1609.344) / seconds
}

const row = (value: number, previous: number): CurveRow => ({
  durationS: 1200,
  value,
  previous,
  activityId: 'a',
})

/** The three verdicts on one pair: the curve's title, the record's words and the shared rule. */
function verdicts(sport: Sport, now: number, before: number, units: UnitSystem) {
  const title = curveTakeaway({
    sport,
    units,
    rows: [row(now, before)],
    previousLabel: 'Previous 12 weeks',
  })
  const words = recordChange(sport, now, before, units, 'Previous 12 weeks')
  return {
    curveClear: !(title ?? '').startsWith('No clear change'),
    recordClear: !(words ?? '').startsWith('No clear change'),
    rule: isClearChange(sport, now, before, units),
  }
}

describe('one verdict on a change, whichever page says it', () => {
  // Pairs either side of each floor: a run's 2 s/km and 3 s/mi, a ride's 2 W and 1% of the earlier watts.
  const pairs: [string, Sport, UnitSystem, number, number][] = [
    ['a run 1 s/km quicker', 'run', 'metric', speedFor(249, 'metric'), speedFor(250, 'metric')],
    ['a run 2 s/km quicker', 'run', 'metric', speedFor(248, 'metric'), speedFor(250, 'metric')],
    ['a run 5 s/km quicker', 'run', 'metric', speedFor(245, 'metric'), speedFor(250, 'metric')],
    [
      'a run 2 s/mi slower',
      'run',
      'imperial',
      speedFor(402, 'imperial'),
      speedFor(400, 'imperial'),
    ],
    [
      'a run 6 s/mi slower',
      'run',
      'imperial',
      speedFor(406, 'imperial'),
      speedFor(400, 'imperial'),
    ],
    ['a ride 1 W higher', 'ride', 'metric', 251, 250],
    ['a ride 3 W higher, under 1%', 'ride', 'metric', 303, 300],
    ['a ride 4 W higher, over 1%', 'ride', 'metric', 304, 300],
    ['a ride 12 W lower', 'ride', 'metric', 238, 250],
    ['no change', 'ride', 'metric', 250, 250],
  ]

  it.each(pairs)(
    '%s: the curve, the records and the rule agree',
    (_, sport, units, now, before) => {
      const { curveClear, recordClear, rule } = verdicts(sport, now, before, units)
      expect(curveClear).toBe(rule)
      expect(recordClear).toBe(rule)
    },
  )

  it('has pairs on both sides of every floor, so the agreement is not a pair of nos', () => {
    const outcomes = pairs.map(([, sport, units, now, before]) =>
      isClearChange(sport, now, before, units),
    )
    expect(outcomes).toContain(true)
    expect(outcomes).toContain(false)
  })
})
