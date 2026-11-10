import { describe, expect, it } from 'vitest'
import { fitnessLines } from '@rca/core/fitness'
import { NO_FITNESS } from '@rca/core/fitness/types'
import {
  FITNESS_AS_OF_MS,
  RECOVERING,
  RIDE_SLIPPING,
  SLIPPING,
  waitingStatus,
} from './test/fitnessFixtures'
import { fitnessViews, lineOf, viewOf, worthShowing } from './fitnessModel'

const DAY_MS = 86_400_000
describe('viewOf', () => {
  it('carries the analysis’s own sentence and support line, with the units kept on their line', () => {
    const view = viewOf(SLIPPING, 'metric', FITNESS_AS_OF_MS)
    const lines = fitnessLines(SLIPPING, 'metric')
    expect(view.headline.replace(/ /g, ' ')).toBe(lines.headline)
    expect(view.support).toBe(lines.support)
    expect(view.headline).toMatch(/\d \/km/)
  })

  it('reads how old the status is from the clock: the status stays as of its newest activity', () => {
    const week = 7 * DAY_MS
    // Days after the status, the status is current.
    const current = viewOf(SLIPPING, 'metric', FITNESS_AS_OF_MS + 2 * week)
    expect(current.age).toBeNull()
    // A library whose newest activity is 40 weeks old says how old it is.
    const stopped = viewOf(SLIPPING, 'metric', FITNESS_AS_OF_MS + 40 * week)
    expect(stopped.age).toBe('Latest activity 9 months ago.')
    expect(stopped.state).toBe('slipping')
    expect(stopped.headline).toBe(current.headline)
    expect(lineOf(stopped)).toMatch(/ Latest activity 9 months ago\.$/)
    // A status that cannot call a trend says it too.
    expect(
      viewOf(
        waitingStatus({ kind: 'history', have: 7, need: 12, weeks: 5, needWeeks: 8 }),
        'metric',
        FITNESS_AS_OF_MS + 40 * week,
      ).age,
    ).toBe('Latest activity 9 months ago.')
  })

  it('tells a waiting status as its level, then what a trend needs', () => {
    const history = viewOf(
      waitingStatus({ kind: 'history', have: 7, need: 12, weeks: 5, needWeeks: 8 }),
      'metric',
      FITNESS_AS_OF_MS,
    )
    expect(history.headline).toBe('5:03\u00a0/km (4:54 to 5:13) at 150 bpm.')
    expect(history.support).toBe('From 7 steady runs.')
    expect(history.needs).toBe('5 more earlier runs to see a trend.')
    const recent = viewOf(
      waitingStatus({ kind: 'recent', have: 2, need: 4, weeks: 8 }),
      'metric',
      FITNESS_AS_OF_MS,
    )
    expect(recent.needs).toBe('2 more runs in the last 8 weeks to see a trend.')
    const gap = viewOf(waitingStatus({ kind: 'break', weeksSince: 9 }), 'metric', FITNESS_AS_OF_MS)
    expect(gap.headline).toBe('5:03\u00a0/km (4:54 to 5:13) at 150 bpm in October.')
    const wide = viewOf(
      waitingStatus({ kind: 'imprecise', within: 0.07 }, 33),
      'metric',
      FITNESS_AS_OF_MS,
    )
    expect(wide.support).toBe('From 33 steady runs.')
    expect(wide.needs).toBe('More steady runs narrow the range to see a trend.')
    // A state that is called has no such line.
    expect(viewOf(SLIPPING, 'metric', FITNESS_AS_OF_MS).needs).toBe('')
  })

  it('gives a status with fewer than 3 steady activities only the one line', () => {
    const few = viewOf(
      waitingStatus({ kind: 'history', have: 2, need: 12, weeks: 2, needWeeks: 8 }, 2, 'ride'),
      'metric',
      FITNESS_AS_OF_MS,
    )
    expect(few.headline).toBe('2 steady rides with a power meter so far.')
    expect(few.support + few.needs).toBe('')
    expect(lineOf(few)).toBe('2 steady rides with a power meter so far.')
  })

  it('makes a line of the headline and its support', () => {
    const level = viewOf(
      waitingStatus({ kind: 'imprecise', within: 0.07 }, 33, 'ride'),
      'metric',
      FITNESS_AS_OF_MS,
    )
    expect(lineOf(level)).toBe('200 W (194 to 206) at 140 bpm. From 33 steady rides.')
  })
})

describe('the lines of a view', () => {
  it('leads with the level, one fact to a line, and keeps a pace and its unit on one line', () => {
    for (const status of [SLIPPING, RECOVERING]) {
      const view = viewOf(status, 'metric', FITNESS_AS_OF_MS)
      expect(view.headline).toMatch(/^\d:\d{2}\u00a0\/km at 150 bpm\.$/)
      expect(lineOf(view)).toBe([view.headline, view.support].join(' '))
      expect(Object.keys(view)).not.toContain('changes')
    }
  })
})

describe('worthShowing', () => {
  it('shows every state, and a waiting status only when it has runs to count', () => {
    expect(worthShowing(SLIPPING)).toBe(true)
    expect(worthShowing(waitingStatus({ kind: 'recent', have: 2, need: 4, weeks: 8 }))).toBe(true)
    expect(
      worthShowing(
        waitingStatus({ kind: 'history', have: 0, need: 12, weeks: 0, needWeeks: 8 }, 0),
      ),
    ).toBe(false)
    expect(worthShowing(waitingStatus({ kind: 'unavailable' }, 0))).toBe(false)
    expect(worthShowing(waitingStatus({ kind: 'unavailable' }, 30))).toBe(false)
  })

  it('draws a card for each sport that has a status, run first, and none for a sport that is switched off or has no steady ride', () => {
    const both = fitnessViews({ run: SLIPPING, ride: RIDE_SLIPPING }, 'metric', FITNESS_AS_OF_MS)
    expect(both.map((view) => view.sport)).toEqual(['run', 'ride'])
    expect(both[1]!.headline).toMatch(/^\d+ W at 140 bpm\.$/)
    const off = fitnessViews(
      { run: SLIPPING, ride: { ...NO_FITNESS.ride, shortfall: { kind: 'unavailable' } } },
      'metric',
      FITNESS_AS_OF_MS,
    )
    expect(off.map((view) => view.sport)).toEqual(['run'])
    // A library of runs has no steady ride: nothing to count, so no card; a library of rides shows the ride alone.
    expect(
      fitnessViews({ run: NO_FITNESS.run, ride: RIDE_SLIPPING }, 'metric', FITNESS_AS_OF_MS).map(
        (v) => v.sport,
      ),
    ).toEqual(['ride'])
    expect(fitnessViews(NO_FITNESS, 'metric', FITNESS_AS_OF_MS)).toEqual([])
  })
})
