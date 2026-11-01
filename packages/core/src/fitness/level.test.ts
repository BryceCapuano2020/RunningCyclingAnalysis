import '../test/warmSample'
import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../constants'
import { plantedLibrary } from '../findings/test/plantedLibrary'
import type { PlantedSpec } from '../findings/test/plantedLibrary'
import { fitnessStatuses } from './compute'
import { levelOfNewest, withLevel } from './level'
import { noFitness } from './types'
import type { FitnessStatus, Shortfall } from './types'
import type { RunPoint } from './windows'

const NONE: ReadonlySet<string> = new Set()
const WEEK = 7 * DAY_MS
const NOISE = { noise: 0.03, noiseModel: { autocorrelation: 0.9, heavyTails: true } }

const library = (over: Partial<PlantedSpec> = {}) =>
  plantedLibrary({ seed: 3, weeks: 100, perWeek: 3, ...NOISE, effects: [], ...over })

/** `n` steady activities on days `start`, `start + gap`, ..., all at `output` (watts) with a small repeating wobble. */
function runs(n: number, start = 1, gap = 3, output = 200): RunPoint[] {
  const wobble = [0.01, -0.01, 0.004, -0.004]
  return Array.from({ length: n }, (_, i) => ({
    id: `r${i}`,
    t: start + i * gap,
    x: Math.log(output) + wobble[i % wobble.length]!,
  }))
}

const waiting = (shortfall: Shortfall): FitnessStatus => ({
  ...noFitness('ride'),
  shortfall,
  referenceHr: 140,
  steady: 7,
})

describe('the level of the newest steady activities', () => {
  it('is the output at the reference heart rate with a range around it, from 3 or more activities', () => {
    const level = levelOfNewest(runs(3))!
    expect(level.runs).toBe(3)
    expect(level.value).toBeGreaterThan(195)
    expect(level.value).toBeLessThan(205)
    expect(level.low).toBeLessThan(level.value)
    expect(level.high).toBeGreaterThan(level.value)
    // The range is the printed one: wider than the sampling error alone, and wide with only three.
    expect(level.high / level.low).toBeGreaterThan(1.08)
    expect(level.toMs).toBeGreaterThan(level.fromMs)
  })

  it('is nothing under 3 activities', () => {
    expect(levelOfNewest([])).toBeNull()
    expect(levelOfNewest(runs(2))).toBeNull()
  })

  it('reads the newest 8 weeks when they hold 3, and a narrower range with more activities', () => {
    // 40 activities every 3 days: the last 8 weeks hold 19 of them, the stretch a status line reads.
    const all = runs(40)
    const level = levelOfNewest(all)!
    expect(level.runs).toBe(19)
    expect(level.high / level.low).toBeLessThan(
      levelOfNewest(runs(3))!.high / levelOfNewest(runs(3))!.low,
    )
  })

  it('widens to the shortest stretch that holds 3 when the newest weeks hold fewer', () => {
    // Twenty activities, then a pause of 9 weeks and two more: the last 8 weeks hold 2, the last 12 hold 2, the last 16 hold 4.
    const early = runs(20)
    const lastDay = early.at(-1)!.t
    const late = [1, 4].map((d, i) => ({ id: `late${i}`, t: lastDay + 63 + d, x: Math.log(200) }))
    const level = levelOfNewest([...early, ...late])!
    expect(level.runs).toBeGreaterThanOrEqual(3)
    expect(level.runs).toBeLessThan(22)
  })

  it('reads all of them when no stretch holds 3 (a few activities more than a year apart)', () => {
    const sparse = runs(4, 1, 400)
    expect(levelOfNewest(sparse)!.runs).toBe(4)
  })
})

describe('withLevel', () => {
  const shortfalls: Shortfall[] = [
    { kind: 'history', have: 7, need: 12, weeks: 5, needWeeks: 8 },
    { kind: 'recent', have: 2, need: 4, weeks: 8 },
    { kind: 'break', weeksSince: 6 },
    { kind: 'imprecise', within: 0.09 },
  ]

  it.each(shortfalls)(
    'adds the level to a status short of $kind and changes nothing else',
    (shortfall) => {
      const status = waiting(shortfall)
      const told = withLevel(status, runs(7))
      expect(told.level).toMatchObject({ runs: 7 })
      expect({ ...told, level: undefined }).toEqual({ ...status, level: undefined })
      expect(told.state).toBe('not-enough-evidence')
      expect(told.change).toBeNull()
      expect(told.shortfall).toEqual(shortfall)
    },
  )

  it.each(shortfalls)(
    'adds none to a status short of $kind with only 2 steady activities',
    (shortfall) => {
      expect(withLevel(waiting(shortfall), runs(2))).toEqual(waiting(shortfall))
      expect(withLevel(waiting(shortfall), runs(2))).not.toHaveProperty('level')
    },
  )

  it('adds none to a sport that is not compared, or to a status that calls a state', () => {
    const off = waiting({ kind: 'unavailable' })
    expect(withLevel(off, runs(7))).toBe(off)
    const slipping: FitnessStatus = {
      ...waiting({ kind: 'break', weeksSince: 6 }),
      state: 'slipping',
      shortfall: null,
    }
    expect(withLevel(slipping, runs(7))).toBe(slipping)
  })
})

describe('the level in the statuses of a library', () => {
  it('is there for a library too short to compare, from the steady activities it has', () => {
    const status = fitnessStatuses(library({ weeks: 10 }).digests, NONE).run
    expect(status.shortfall).toMatchObject({ kind: 'history' })
    expect(status.state).toBe('not-enough-evidence')
    expect(status.level).toBeDefined()
    expect(status.level!.runs).toBeGreaterThanOrEqual(3)
    expect(status.level!.runs).toBeLessThanOrEqual(status.steady)
    expect(status.level!.low).toBeLessThan(status.level!.value)
    expect(status.level!.high).toBeGreaterThan(status.level!.value)
    expect(status.change).toBeNull()
  })

  it('is there when too few runs are recent', () => {
    const full = library({ weeks: 60 })
    const last = full.digests.at(-1)!.startMs
    const sparse = full.digests.filter(
      (d) => d.startMs < last - 8 * WEEK || d.startMs > last - 3 * DAY_MS,
    )
    const status = fitnessStatuses(sparse, NONE).run
    expect(status.shortfall).toMatchObject({ kind: 'recent' })
    expect(status.level).toBeDefined()
    // It rests on the newest activities, which here reach back past the 8 weeks.
    expect(status.level!.toMs).toBeGreaterThan(last - 4 * DAY_MS)
  })

  it('is there on a break, as of the last steady activity and dated by it', () => {
    const digests = library({ weeks: 60 }).digests
    const last = digests.at(-1)!.startMs
    const status = fitnessStatuses(digests, NONE, { asOfMs: last + 6 * WEEK }).run
    expect(status.shortfall).toMatchObject({ kind: 'break' })
    expect(status.level).toBeDefined()
    expect(status.level!.toMs).toBeLessThanOrEqual(last)
    expect(status.level!.toMs).toBeGreaterThan(last - 2 * WEEK)
  })

  it('is there when the range is too wide to call level', () => {
    const noisy = library({ weeks: 30, noise: 0.3, noiseModel: undefined })
    const status = fitnessStatuses(noisy.digests, NONE).run
    expect(status.shortfall).toMatchObject({ kind: 'imprecise' })
    expect(status.level).toBeDefined()
  })

  it('is not there for a library with fewer than 3 steady activities', () => {
    const few = library({ weeks: 1, perWeek: 2 })
    const status = fitnessStatuses(few.digests, NONE).run
    expect(status.state).toBe('not-enough-evidence')
    expect(status.steady).toBeLessThan(3)
    expect(status).not.toHaveProperty('level')
  })

  it('is not there once the status can call a state, which is told as it was', () => {
    const status = fitnessStatuses(library({ weeks: 100 }).digests, NONE).run
    expect(status.shortfall).toBeNull()
    expect(status).not.toHaveProperty('level')
  })

  it('is the same for rides, in watts', () => {
    const rides = library({ sports: ['ride'], weeks: 10 })
    const status = fitnessStatuses(rides.digests, NONE).ride
    expect(status.shortfall).not.toBeNull()
    expect(status.level).toBeDefined()
    expect(status.level!.value).toBeGreaterThan(50)
  })
})
