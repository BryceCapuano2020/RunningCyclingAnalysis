import { describe, expect, it } from 'vitest'
import { effortsCount } from '@rca/core/digest'
import type { Sport } from '@rca/core/types'
import { makeActivity } from './components/fixtures'
import { indoorCount, indoorNeedLine, indoorSplitLine } from './indoorCopy'

/** n activities of a sport, the first `indoor` of them indoors. */
function some(sport: Sport, n: number, indoor: number) {
  return Array.from({ length: n }, (_, i) =>
    makeActivity({ id: `${sport}-${i}`, sport, indoor: i < indoor }),
  )
}

describe('indoorCount', () => {
  it('counts a sport’s activities and how many were indoors', () => {
    const all = [...some('run', 20, 14), ...some('ride', 5, 1)]
    expect(indoorCount(all, 'run')).toEqual({ indoor: 14, total: 20 })
    expect(indoorCount(all, 'ride')).toEqual({ indoor: 1, total: 5 })
  })
})

describe('indoorNeedLine', () => {
  it('says the treadmill count, what still counts, and what to add, for a run that holds no outdoor effort', () => {
    const line = indoorNeedLine(some('run', 20, 14), 'run', false)
    expect(line).toBe(
      '14 of your 20 runs were on a treadmill. Their time, distance and heart rate count; their pace is not used for bests or thresholds, because a belt’s speed is not a distance covered. Add outdoor runs of 3 minutes or more to see them.',
    )
  })

  it('says all of them, or the one', () => {
    expect(indoorNeedLine(some('run', 4, 4), 'run', false)).toMatch(
      /^All 4 of your runs were on a treadmill\./,
    )
    expect(indoorNeedLine(some('run', 1, 1), 'run', false)).toMatch(
      /^Your run was on a treadmill\./,
    )
  })

  it('is silent when the sport has an effort of its own, when none was indoors, and for a sport whose indoor efforts count', () => {
    expect(indoorNeedLine(some('run', 20, 14), 'run', true)).toBeNull()
    expect(indoorNeedLine(some('run', 20, 0), 'run', false)).toBeNull()
    expect(indoorNeedLine(some('ride', 10, 10), 'ride', false)).toBeNull()
  })
})

describe('indoorSplitLine', () => {
  it('discloses indoor rides without excluding them: their power counts', () => {
    expect(indoorSplitLine(some('ride', 40, 6), 'ride')).toBe(
      '6 of your 40 rides were indoors; their power counts like any other.',
    )
    expect(indoorSplitLine(some('ride', 3, 3), 'ride')).toBe(
      'All 3 of your rides were indoors; their power counts like any other.',
    )
  })

  it('says the treadmill split of a mixed run library once, and leaves an all-treadmill one to the need line', () => {
    expect(indoorSplitLine(some('run', 20, 5), 'run')).toBe(
      '5 of your 20 runs were on a treadmill; their pace is not used for bests or thresholds.',
    )
    expect(indoorSplitLine(some('run', 20, 20), 'run')).toBeNull()
    expect(indoorSplitLine(some('run', 20, 0), 'run')).toBeNull()
  })

  it('tells each sport what becomes of its indoor efforts as the one rule does', () => {
    for (const sport of ['run', 'ride'] as const) {
      const says = indoorSplitLine(some(sport, 10, 4), sport)!
      expect(says.includes('not used')).toBe(!effortsCount({ sport, indoor: true }))
    }
  })
})
