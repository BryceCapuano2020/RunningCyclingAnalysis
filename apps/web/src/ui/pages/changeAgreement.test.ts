import { describe, expect, it } from 'vitest'
import type { ChangeVerdict } from '@rca/core/change/types'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { callOf, changeOf } from '../charts/changeFixtures'
import type { CurveRow } from '../charts/curveTable'
import { curveTakeaway } from '../charts/sportCurveTakeaway'
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

/** The two sentences on one pair under one verdict: the curve's title and the record's words. */
function sentences(
  sport: Sport,
  now: number,
  before: number,
  units: UnitSystem,
  verdict: ChangeVerdict,
) {
  const title = curveTakeaway({
    sport,
    units,
    rows: [row(now, before)],
    previousLabel: 'Previous 12 weeks',
    change: changeOf(verdict),
  })
  const words = recordChange(sport, now, before, units, 'Previous 12 weeks', callOf(1200, verdict))
  return {
    titleClear: title !== null && !title.startsWith('No clear change') && !title.startsWith('Best'),
    wordsClear: words !== null && !words.startsWith('No clear change'),
    titleCompares: title !== null && !title.startsWith('Best'),
    wordsCompare: words !== null,
  }
}

describe('one verdict on a change, whichever page says it', () => {
  const pairs: [string, Sport, UnitSystem, number, number][] = [
    ['a run 5 s/km quicker', 'run', 'metric', speedFor(245, 'metric'), speedFor(250, 'metric')],
    [
      'a run 6 s/mi slower',
      'run',
      'imperial',
      speedFor(406, 'imperial'),
      speedFor(400, 'imperial'),
    ],
    ['a ride 12 W lower', 'ride', 'metric', 238, 250],
    ['a ride 3 W higher', 'ride', 'metric', 303, 300],
  ]

  it.each(pairs)(
    '%s: a called change is worded as one by the title and the record',
    (_, sport, units, now, before) => {
      const s = sentences(sport, now, before, units, now > before ? 'higher' : 'lower')
      expect(s.titleClear).toBe(true)
      expect(s.wordsClear).toBe(true)
    },
  )

  it.each(pairs)(
    '%s: a move the test does not call is no clear change in both',
    (_, sport, units, now, before) => {
      const s = sentences(sport, now, before, units, 'none')
      expect(s.titleClear).toBe(false)
      expect(s.wordsClear).toBe(false)
      expect(s.titleCompares).toBe(true)
      expect(s.wordsCompare).toBe(true)
    },
  )

  it.each(pairs)(
    '%s: a length the test could not judge is compared by neither',
    (_, sport, units, now, before) => {
      const s = sentences(sport, now, before, units, 'untested')
      expect(s.titleCompares).toBe(false)
      expect(s.wordsCompare).toBe(false)
    },
  )
})
