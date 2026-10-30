import { describe, expect, it } from 'vitest'
import { fitnessLines } from '@rca/core/fitness'
import { NO_FITNESS } from '@rca/core/fitness/types'
import {
  FITNESS_AS_OF_MS,
  HOLDING,
  IMPROVING,
  RECOVERING,
  SLIPPING,
  fitnessStatus,
  waitingStatus,
} from './fitnessFixtures'
import {
  FITNESS_STATE,
  fitnessViews,
  progressOf,
  trackOf,
  viewOf,
  worthShowing,
} from './fitnessModel'
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
        'not-enough-evidence': 'Not enough evidence yet',
      },
    )
  })

  it('words nothing the copy rules ban: no cause, no ranking, no hedge', () => {
    const labels = Object.values(FITNESS_STATE).map((state) => state.label)
    const meanings = Object.values(fitnessDefinitions(SLIPPING))
    for (const text of [...labels, ...meanings]) expect(text).not.toMatch(BANNED)
  })
})

describe('viewOf', () => {
  it('carries the analysis’s own sentence and support line, with the units kept on their line', () => {
    const view = viewOf(SLIPPING, 'metric')
    const lines = fitnessLines(SLIPPING, 'metric')
    expect(view.headline.replace(/ /g, ' ')).toBe(lines.headline)
    expect(view.support).toBe(lines.support)
    expect(view.headline).toMatch(/\d \/km/)
    expect(view.label).toBe('Slipping')
  })

  it('marks a state that began to be shown in the last six weeks with the week it began, and no other', () => {
    expect(viewOf(SLIPPING, 'metric').fresh).toBe('week of 12 Oct')
    expect(viewOf(RECOVERING, 'metric').fresh).toBe('week of 28 Sep')
    const old = fitnessStatus('slipping', () => 0, {
      entered: { atMs: FITNESS_AS_OF_MS - 7 * 7 * DAY_MS, z: -4 },
    })
    expect(viewOf(old, 'metric').fresh).toBeNull()
    expect(viewOf(HOLDING, 'metric').fresh).toBeNull()
    expect(viewOf(IMPROVING, 'metric').fresh).toBeNull()
  })

  it('says a waiting status once: its label, then the sentence without the same words', () => {
    const history = viewOf(
      waitingStatus({ kind: 'history', have: 7, need: 12, weeks: 5, needWeeks: 8 }),
      'metric',
    )
    expect(history.label).toBe('Not enough evidence yet')
    expect(history.headline).not.toMatch(/^Not enough/)
    expect(history.headline).toMatch(/^Pace at the same heart rate is read from 12 steady runs/)
    const recent = viewOf(waitingStatus({ kind: 'recent', have: 2, need: 4, weeks: 8 }), 'metric')
    expect(recent.label).toBe('Not enough recent evidence yet')
    expect(recent.headline).toMatch(/^There are 2 steady runs in the last 8 weeks/)
    const gap = viewOf(waitingStatus({ kind: 'break', weeksSince: 9 }), 'metric')
    expect(gap.label).toBe('Not enough recent evidence yet')
    expect(gap.headline).toBe('The last steady run was 9 weeks ago.')
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

describe('progressOf and worthShowing', () => {
  it('counts the steady runs a status is waiting on, and only for the shortfalls that are counts', () => {
    expect(
      progressOf(waitingStatus({ kind: 'history', have: 7, need: 12, weeks: 5, needWeeks: 8 })),
    ).toEqual({ have: 7, need: 12, of: 'steady runs before the last 8 weeks' })
    expect(progressOf(waitingStatus({ kind: 'recent', have: 2, need: 4, weeks: 8 }))).toEqual({
      have: 2,
      need: 4,
      of: 'steady runs in the last 8 weeks',
    })
    expect(progressOf(waitingStatus({ kind: 'break', weeksSince: 6 }))).toBeNull()
    expect(progressOf(waitingStatus({ kind: 'imprecise', within: 0.07 }))).toBeNull()
    expect(progressOf(SLIPPING)).toBeNull()
  })

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

  it('draws the run alone today: the ride is not compared, and an empty library has no card', () => {
    const both = fitnessViews(
      { run: SLIPPING, ride: { ...NO_FITNESS.ride, shortfall: { kind: 'unavailable' } } },
      'metric',
    )
    expect(both.map((view) => view.sport)).toEqual(['run'])
    expect(fitnessViews(NO_FITNESS, 'metric')).toEqual([])
  })
})
