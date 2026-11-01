import { describe, expect, it } from 'vitest'
import { fitnessLines } from '@rca/core/fitness'
import { NO_FITNESS } from '@rca/core/fitness/types'
import {
  FITNESS_AS_OF_MS,
  HOLDING,
  IMPROVING,
  RECOVERING,
  RIDE_SLIPPING,
  SLIPPING,
  fitnessStatus,
  waitingStatus,
} from './fitnessFixtures'
import { FITNESS_STATE, fitnessViews, lineOf, trackOf, viewOf, worthShowing } from './fitnessModel'
import { fitnessDefinitions } from './fitnessText'

const DAY_MS = 86_400_000
/** The words the copy rules keep out: a cause, a ranking, a limit. */
const BANNED = /limiter|weak|strength|holding you back|ahead of|because|caused/i

describe('what each state is called, and the shape that says it', () => {
  it('has a plain label and its own shape for every state, so no state rests on colour', () => {
    const glyphs = Object.values(FITNESS_STATE).map((state) => state.glyph)
    expect(new Set(glyphs).size).toBe(glyphs.length)
    expect(Object.fromEntries(Object.entries(FITNESS_STATE).map(([k, v]) => [k, v.label]))).toEqual(
      {
        slipping: 'Slipping',
        holding: 'Holding',
        'holding-below': 'Holding below',
        recovering: 'Recovering',
        back: 'Back',
        improving: 'Improving',
        improved: 'Improved',
        'not-enough-evidence': 'No trend yet',
      },
    )
  })

  it('words nothing the copy rules ban: no cause, no ranking, no hedge', () => {
    const labels = Object.values(FITNESS_STATE).map((state) => state.label)
    const meanings = [
      ...Object.values(fitnessDefinitions(SLIPPING, 'metric')),
      ...Object.values(fitnessDefinitions(SLIPPING, 'imperial')),
    ]
    for (const text of [...labels, ...meanings]) expect(text).not.toMatch(BANNED)
  })
})

describe('viewOf', () => {
  it('carries the analysis’s own sentence and support line, with the units kept on their line', () => {
    const view = viewOf(SLIPPING, 'metric', FITNESS_AS_OF_MS)
    const lines = fitnessLines(SLIPPING, 'metric')
    expect(view.headline.replace(/ /g, ' ')).toBe(lines.headline)
    expect(view.support).toBe(lines.support)
    expect(view.headline).toMatch(/\d \/km/)
    expect(view.label).toBe('Slipping')
  })

  it('marks a state that began to be shown in the last six weeks with the week it began, and no other', () => {
    expect(viewOf(SLIPPING, 'metric', FITNESS_AS_OF_MS).fresh).toBe('the week of 12 Oct')
    expect(viewOf(RECOVERING, 'metric', FITNESS_AS_OF_MS).fresh).toBe('the week of 28 Sep')
    const old = fitnessStatus('slipping', () => 0, {
      entered: { atMs: FITNESS_AS_OF_MS - 7 * 7 * DAY_MS, z: -4 },
    })
    expect(viewOf(old, 'metric', FITNESS_AS_OF_MS).fresh).toBeNull()
    expect(viewOf(HOLDING, 'metric', FITNESS_AS_OF_MS).fresh).toBeNull()
    expect(viewOf(IMPROVING, 'metric', FITNESS_AS_OF_MS).fresh).toBeNull()
  })

  it('reads how new a state is, and how old the status is, from the clock: the status stays as of its newest activity', () => {
    const week = 7 * DAY_MS
    // Days after the status, the state is new and the status is current.
    const current = viewOf(SLIPPING, 'metric', FITNESS_AS_OF_MS + 2 * week)
    expect(current.fresh).toBe('the week of 12 Oct')
    expect(current.age).toBeNull()
    // A library whose newest activity is 40 weeks old is not new, and says how old it is.
    const stopped = viewOf(SLIPPING, 'metric', FITNESS_AS_OF_MS + 40 * week)
    expect(stopped.fresh).toBeNull()
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

  it('tells a waiting status as its level, then what a trend needs, under a label that claims no trend', () => {
    const history = viewOf(
      waitingStatus({ kind: 'history', have: 7, need: 12, weeks: 5, needWeeks: 8 }),
      'metric',
      FITNESS_AS_OF_MS,
    )
    expect(history.label).toBe('No trend yet')
    expect(history.headline).toBe('5:03\u00a0/km at 150 bpm (4:54 to 5:13).')
    expect(history.support).toBe('From 7 steady runs.')
    expect(history.needs).toBe('5 more earlier runs to see a trend.')
    const recent = viewOf(
      waitingStatus({ kind: 'recent', have: 2, need: 4, weeks: 8 }),
      'metric',
      FITNESS_AS_OF_MS,
    )
    expect(recent.label).toBe('No trend yet')
    expect(recent.needs).toBe('2 more runs in the last 8 weeks to see a trend.')
    const gap = viewOf(waitingStatus({ kind: 'break', weeksSince: 9 }), 'metric', FITNESS_AS_OF_MS)
    expect(gap.label).toBe('No trend yet')
    expect(gap.headline).toBe('5:03\u00a0/km at 150 bpm (4:54 to 5:13) in October.')
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
    expect(lineOf(level)).toBe('200 W at 140 bpm (194 to 206). From 33 steady rides.')
  })
})

describe('trackOf', () => {
  it('puts a slip left of "before" and a rise right of it, with the range around the estimate', () => {
    const slip = trackOf(SLIPPING, 'metric')!
    expect(slip.at).toBeLessThan(0)
    expect(slip.low).toBeLessThan(slip.at)
    expect(slip.high).toBeGreaterThan(slip.at)
    expect(slip.less).toBe('Slower')
    expect(slip.before).toBe('5:03 /km')
    const rise = trackOf(IMPROVING, 'metric')!
    expect(rise.at).toBeGreaterThan(0)
    expect(rise.more).toBe('Faster')
  })

  it('marks the low a recovery fell to, further left than where it is now, and none for a status that never fell', () => {
    const track = trackOf(RECOVERING, 'metric')!
    expect(track.floor).not.toBeNull()
    expect(track.floor!).toBeLessThan(track.at)
    expect(trackOf(SLIPPING, 'metric')!.floor).toBeNull()
  })

  it('keeps one scale for small changes, so a few per cent do not fill the track, and widens it for a large one', () => {
    const small = trackOf(HOLDING, 'metric')!
    expect(Math.abs(small.at)).toBeLessThan(0.1)
    const big = fitnessStatus('slipping', () => -0.3, {
      change: { value: -0.3, low: -0.35, high: -0.25 },
    })
    const wide = trackOf(big, 'metric')!
    expect(wide.low).toBeGreaterThanOrEqual(-1)
    expect(wide.at).toBeGreaterThan(-1)
    expect(Math.abs(wide.at)).toBeLessThan(0.9)
  })

  it('has no track for a status waiting on evidence', () => {
    expect(trackOf(waitingStatus({ kind: 'break', weeksSince: 6 }), 'metric')).toBeNull()
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
    expect(both[1]!.headline).toMatch(/^At 140 bpm you now ride at \d+ W, \d+% /)
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
