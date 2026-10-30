import { describe, expect, it } from 'vitest'
import { applyHold, monitor, weekEndOf } from './machine'
import type { MachineState, WeekRecord } from './machine'
import type { RunPoint } from './windows'

/** A steady library: three runs a week at a level, each off it by a fixed, repeating amount (a spread of about 1%). */
const JITTER = [0.012, -0.012, 0.004, -0.004, 0.008, -0.008]
function library(
  weeks: number,
  level: (week: number) => number,
  skip: (t: number) => boolean = () => false,
) {
  const points: RunPoint[] = []
  let k = 0
  for (let w = 0; w < weeks; w++) {
    for (let i = 0; i < 3; i++) {
      const t = w * 7 + 1 + i * 2
      const x = level(w) + JITTER[k++ % JITTER.length]!
      if (!skip(t)) points.push({ id: `h${w}-${i}`, t, x })
    }
  }
  return points
}

const firstFresh = (records: readonly WeekRecord[], state: MachineState, from = 0) =>
  records.find((r) => r.w >= from && r.state === state && r.fresh)

describe('the weekly monitor on a hand-built library', () => {
  const down = (w: number) => (w >= 60 ? -0.08 : 0) + (w >= 100 ? 0.08 : 0)
  const points = library(170, down)
  const records = monitor(points, 0, 169)

  it('says nothing until it has a reference: 12 runs over 8 weeks that are more than 8 weeks old', () => {
    const first = records.findIndex((r) => r.state !== 'nodata')
    expect(first).toBe(15)
    expect(records.slice(0, first).every((r) => r.shown === 'nodata')).toBe(true)
  })

  it('declares the slip within a few weeks of an 8% drop, and not before', () => {
    const slip = firstFresh(records, 'slipping')!
    expect(slip.w).toBeGreaterThanOrEqual(60)
    expect(slip.w).toBeLessThanOrEqual(64)
    expect(slip.z).toBeLessThan(-3.3)
    expect(slip.delta).toBeLessThan(-0.04)
    expect(
      records.filter((r) => r.w < 60 && r.state !== 'holding' && r.state !== 'nodata'),
    ).toEqual([])
  })

  it('holds below the old level once the loss has levelled off', () => {
    const low = records.find((r) => r.state === 'holding-below')!
    expect(low.w).toBeGreaterThanOrEqual(72)
    expect(low.w).toBeLessThanOrEqual(80)
    expect(low.episode!.level.m - low.episode!.reference).toBeLessThan(-0.07)
  })

  it('confirms the return as recovering first and back later, and then closes the episode', () => {
    const recovering = firstFresh(records, 'recovering', 100)!
    const back = firstFresh(records, 'back', 100)!
    expect(recovering.w).toBeGreaterThan(100)
    expect(recovering.w).toBeLessThanOrEqual(110)
    expect(recovering.z).toBeGreaterThan(4)
    expect(back.w).toBeGreaterThan(recovering.w)
    expect(back.w).toBeLessThanOrEqual(118)
    expect(records.at(-1)!.state).toBe('holding')
    expect(records.at(-1)!.episode).toBeNull()
  })

  it('gives the same states for the same series every time', () => {
    expect(monitor(library(170, down), 0, 169)).toEqual(records)
  })

  it('sees only the runs before the end of the week it evaluates', () => {
    const early = monitor(
      points.filter((p) => p.t < 63 * 7),
      0,
      62,
    )
    expect(early.map((r) => r.shown)).toEqual(records.slice(0, 63).map((r) => r.shown))
  })

  it('stays quiet when nothing changes', () => {
    const quiet = monitor(
      library(170, () => 0),
      0,
      169,
    )
    expect(quiet.some((r) => r.fresh)).toBe(false)
    expect(quiet.every((r) => r.state === 'nodata' || r.state === 'holding')).toBe(true)
  })

  it('reads through a 10-week gap in runs without stating anything new', () => {
    const gapped = monitor(
      library(
        120,
        () => 0,
        (t) => t > 80 * 7 && t < 90 * 7,
      ),
      0,
      119,
    )
    expect(gapped.some((r) => r.fresh)).toBe(false)
  })

  it('treats months off as slipping and then recovering, with nothing special-cased', () => {
    const detrained = (w: number) => (w >= 60 && w < 90 ? -0.1 : 0)
    const r = monitor(library(160, detrained), 0, 159)
    expect(firstFresh(r, 'slipping', 60)).toBeDefined()
    expect(firstFresh(r, 'recovering', 90)).toBeDefined()
  })

  it('ends weeks on a Sunday', () => {
    expect(new Date(weekEndOf(0)).toISOString()).toBe('1970-01-11T23:59:59.999Z')
  })
})

describe('the branches of an open episode', () => {
  const sequence = (records: readonly WeekRecord[]) =>
    records
      .filter((r, i) => r.fresh || r.state !== records[i - 1]?.state)
      .map((r) => `${r.state}${r.fresh ? '*' : ''}`)

  it('falls back to slipping from holding below when the level drops again', () => {
    const level = (w: number) => (w >= 60 ? -0.08 : 0) + (w >= 100 ? -0.1 : 0)
    const states = sequence(monitor(library(170, level), 0, 169))
    expect(states).toEqual([
      'nodata',
      'holding',
      'slipping*',
      'holding-below',
      'slipping*',
      'holding-below',
    ])
    const fell = monitor(library(170, level), 0, 169).find((r) => r.w > 90 && r.fresh)!
    expect(fell.state).toBe('slipping')
    expect(fell.w).toBeGreaterThanOrEqual(100)
    expect(fell.w).toBeLessThanOrEqual(108)
    expect(fell.z).toBeLessThan(-2.5)
  })

  it('falls back to slipping from recovering when the level drops again before it is back', () => {
    const level = (w: number) =>
      (w >= 60 ? -0.08 : 0) + (w >= 100 ? 0.06 : 0) + (w >= 121 ? -0.12 : 0)
    const records = monitor(library(200, level), 0, 199)
    const recovering = records.find((r) => r.state === 'recovering' && r.fresh)!
    const fell = records.find((r) => r.w > recovering.w && r.state === 'slipping' && r.fresh)!
    expect(recovering.w).toBeLessThan(115)
    expect(fell.w).toBeGreaterThan(121)
    expect(fell.w).toBeLessThan(135)
    expect(records.some((r) => r.state === 'back')).toBe(false)
  })

  it('falls back to slipping from back when the level drops again inside the back period', () => {
    const level = (w: number) =>
      (w >= 60 ? -0.08 : 0) + (w >= 100 ? 0.08 : 0) + (w >= 112 ? -0.12 : 0)
    const records = monitor(library(190, level), 0, 189)
    const back = records.find((r) => r.state === 'back' && r.fresh)!
    const fell = records.find((r) => r.w > back.w && r.state === 'slipping' && r.fresh)!
    expect(fell.w - back.w).toBeLessThan(12)
    expect(fell.z).toBeLessThan(0)
  })

  /** One run every third week, then a drop: never 12 runs in the 32 weeks before any split, so no onset can be dated. */
  const sparse = library(
    160,
    (w) => (w >= 100 ? -0.2 : 0),
    () => false,
  ).filter((p) => Math.floor(p.t / 7) % 3 === 0 && p.id.endsWith('-0'))

  it('follows an episode whose onset cannot be dated, against the baseline of the scale that fired', () => {
    const records = monitor(sparse, 0, 159)
    const slip = records.find((r) => r.fresh)!
    expect(slip.state).toBe('slipping')
    expect(slip.delta).toBeLessThan(-0.04)
    const followed = records.find((r) => r.episode !== null)!.episode!
    expect(followed.onsetDay).toBeNull()
    expect(Math.abs(followed.reference)).toBeLessThan(0.02)
  })

  it('goes thin when the runs are too few to follow the episode, and resumes it when they return', () => {
    const records = monitor(sparse, 0, 159)
    const thin = records.filter((r) => r.state === 'thin')
    expect(thin.length).toBeGreaterThan(3)
    // It is one episode throughout: the reference is frozen and only the first week is fresh.
    expect(records.filter((r) => r.fresh)).toHaveLength(1)
    const references = new Set(records.flatMap((r) => (r.episode ? [r.episode.reference] : [])))
    expect(references.size).toBe(1)
    const first = records.findIndex((r) => r.state === 'thin')
    expect(records.slice(first).some((r) => r.state === 'slipping' && !r.fresh)).toBe(true)
  })
})

describe('the display hold', () => {
  const rec = (w: number, state: MachineState, fresh = false): WeekRecord => ({
    w,
    state,
    fresh,
    z: Number.NaN,
    delta: 0,
    episode: null,
    closes: null,
    shown: state,
  })
  const shown = (states: [MachineState, boolean?][]) => {
    const records = states.map(([s, f], w) => rec(w, s, f ?? false))
    applyHold(records)
    return records.map((r) => r.shown)
  }

  it('shows a new state only after it has held for two weeks', () => {
    expect(shown([['holding'], ['holding'], ['recovering'], ['holding'], ['holding']])).toEqual(
      Array.from({ length: 5 }, () => 'holding'),
    )
    expect(
      shown([['slipping'], ['slipping'], ['recovering'], ['recovering'], ['recovering']]),
    ).toEqual(['slipping', 'slipping', 'slipping', 'recovering', 'recovering'])
  })

  it('shows a state that begins when the athlete was calm at once', () => {
    expect(shown([['holding'], ['holding'], ['slipping', true], ['slipping']])).toEqual([
      'holding',
      'holding',
      'slipping',
      'slipping',
    ])
    expect(
      shown([['slipping'], ['holding-below'], ['holding-below'], ['recovering', true]]),
    ).toEqual(['slipping', 'slipping', 'holding-below', 'recovering'])
  })

  it('shows thin weeks as thin and resumes the state it was in', () => {
    expect(shown([['slipping'], ['thin'], ['thin'], ['slipping']])).toEqual([
      'slipping',
      'thin',
      'thin',
      'slipping',
    ])
  })
})
