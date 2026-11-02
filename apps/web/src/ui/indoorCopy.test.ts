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
  it('says the treadmill count and what to add, for a run that holds no outdoor effort', () => {
    const line = indoorNeedLine(some('run', 20, 14), 'run', false)
    expect(line).toBe(
      '14 of your 20 runs were on a treadmill. Add an outdoor run of 3 min or more.',
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
  it('says nothing of indoor rides, whose power counts like any other', () => {
    expect(indoorSplitLine(some('ride', 40, 6), 'ride')).toBeNull()
    expect(indoorSplitLine(some('ride', 3, 3), 'ride')).toBeNull()
  })

  it('says the treadmill split of a mixed run library once, and leaves an all-treadmill one to the need line', () => {
    expect(indoorSplitLine(some('run', 20, 5), 'run')).toBe('5 treadmill runs not counted.')
    expect(indoorSplitLine(some('run', 20, 1), 'run')).toBe('1 treadmill run not counted.')
    expect(indoorSplitLine(some('run', 20, 20), 'run')).toBeNull()
    expect(indoorSplitLine(some('run', 20, 0), 'run')).toBeNull()
  })

  it('has a line for each sport exactly when the one rule leaves its indoor efforts out', () => {
    for (const sport of ['run', 'ride'] as const) {
      const says = indoorSplitLine(some(sport, 10, 4), sport)
      expect(says !== null).toBe(!effortsCount({ sport, indoor: true }))
    }
  })
})
