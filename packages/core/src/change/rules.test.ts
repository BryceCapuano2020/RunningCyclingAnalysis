import { describe, expect, it } from 'vitest'
import { DAY_MS, DEFAULT_BIKE_MODEL, HEADLINE_DURATION_S } from '../constants'
import { massesOf } from '../digest/masses'
import { bestCurves } from '../digest/rideCurves'
import { metabolicToFlatSpeed } from '../metabolic'
import { EVERY_EFFORT } from '../digest/readingRule'
import type { ReadingRule } from '../digest/readingRule'
import type { ActivityDigest, PowerSource } from '../types'
import { changeEvidence } from './evidence'
import { dealRatios, nullBand } from './null'
import { readingsOf } from './readings'
import { effortLibrary, MONDAY, SETTINGS } from './test/library'
import { callAt, detectableAt, directionOf, verdictAt, verdictOfCall } from './types'

const WEEKS = 12
const CUT = MONDAY + WEEKS * 7 * DAY_MS

/** A ride library of two periods with the given power source in each, the second `lift` above the first (a log change). */
function rides(
  sourceBefore: (i: number) => PowerSource,
  sourceNow: (i: number) => PowerSource,
  lift: number,
) {
  const library = effortLibrary({
    sport: 'ride',
    perWeek: 4,
    weeks: 2 * WEEKS,
    seed: 9,
    spread: 0.02,
    level: (week) => (week >= WEEKS ? lift : 0),
  })
  const pick = (d: ActivityDigest, i: number): ActivityDigest =>
    Object.assign({}, d, { powerSource: (d.startMs >= CUT ? sourceNow : sourceBefore)(i) })
  const all = library.map(pick)
  return {
    selected: all.filter((d) => d.startMs >= CUT),
    previous: all.filter((d) => d.startMs < CUT),
  }
}

const callOf = (p: { selected: ActivityDigest[]; previous: ActivityDigest[] }) =>
  callAt(
    changeEvidence(p.selected, p.previous, SETTINGS, DEFAULT_BIKE_MODEL, null),
    'ride',
    HEADLINE_DURATION_S,
  )!

describe('the power source of a ride', () => {
  it('tests the power-meter rides alone when both periods have enough of them', () => {
    // Every third ride in each period is estimated, and the estimates are as strong as the measured: they play no part.
    const mixed = (i: number): PowerSource => (i % 3 === 0 ? 'virtual' : 'measured')
    const call = callOf(rides(mixed, mixed, 0.2))
    expect(call.basis).toBe('measured')
    expect(call.verdict).toBe('higher')
  })

  it('compares estimated rides only with estimated rides', () => {
    const call = callOf(
      rides(
        () => 'virtual',
        () => 'virtual',
        0.2,
      ),
    )
    expect(call.basis).toBe('estimated')
    expect(call.verdict).toBe('higher')
  })

  it('says untested when the sources differ between the periods, however big the gap', () => {
    // A period of power-meter rides against a period of estimated ones: a change of source reads as a change of power.
    const call = callOf(
      rides(
        () => 'virtual',
        () => 'measured',
        0.3,
      ),
    )
    expect(call.verdict).toBe('untested')
    expect(call.observed).toBeNull()
    expect(call.now).toBeGreaterThan(0)
  })

  it('says untested when only one period has enough power-meter rides and the other mixes the sources', () => {
    const few = (i: number): PowerSource => (i % 40 === 0 ? 'measured' : 'virtual')
    expect(callOf(rides(few, () => 'measured', 0.3)).verdict).toBe('untested')
  })

  it('never counts virtual power as measured', () => {
    const readings = readingsOf(
      rides(
        () => 'virtual',
        () => 'virtual',
        0,
      ).previous,
      SETTINGS,
      DEFAULT_BIKE_MODEL,
      null,
    )
    expect(readings.ride.every((r) => r.measured.every((m) => !m))).toBe(true)
  })
})

describe('the one rule for what counts as a reading', () => {
  const library = effortLibrary({ sport: 'run', perWeek: 4, weeks: 12, seed: 4, spread: 0.02 })
  /** Leaves out every effort of the first half of the weeks. */
  const late: ReadingRule = {
    activity: EVERY_EFFORT.activity,
    point: (digest) => digest.startMs >= MONDAY + 6 * 7 * DAY_MS,
  }

  it('gives the curves’ bests and the readings the same efforts: the best of the readings is the curve’s best', () => {
    const readings = readingsOf(library, SETTINGS, DEFAULT_BIKE_MODEL, null, late)
    const curves = bestCurves(
      library,
      massesOf(SETTINGS),
      DEFAULT_BIKE_MODEL,
      SETTINGS.massKg,
      null,
      late,
    )
    const everything = bestCurves(
      library,
      massesOf(SETTINGS),
      DEFAULT_BIKE_MODEL,
      SETTINGS.massKg,
      null,
    )
    let compared = 0
    for (const [i, point] of curves.runBest.entries()) {
      const { values } = readings.run[i]!
      if (values.length === 0) continue
      compared++
      expect(Math.max(...values)).toBeCloseTo(metabolicToFlatSpeed(point.value), 9)
    }
    expect(compared).toBeGreaterThan(5)
    // The rule changed the curve: with every effort counted, a best of the early half can stand where it does not now.
    const sameAsEverything = curves.runBest.every(
      (p, i) => p.value === everything.runBest[i]!.value,
    )
    expect(sameAsEverything).toBe(false)
  })

  it('counts the readings the minimum sizes are made of: a rule that leaves efforts out leaves a length untested', () => {
    const none: ReadingRule = { activity: () => true, point: () => false }
    const evidence = changeEvidence(
      library.filter((d) => d.startMs >= MONDAY + 6 * 7 * DAY_MS),
      library.filter((d) => d.startMs < MONDAY + 6 * 7 * DAY_MS),
      SETTINGS,
      DEFAULT_BIKE_MODEL,
      null,
      none,
    )
    expect(evidence.run.every((call) => call.verdict === 'untested' && call.now === 0)).toBe(true)
  })
})

describe('levels, direction and what cannot be told apart', () => {
  const call = {
    durationS: 1200,
    now: 12,
    before: 12,
    basis: 'all' as const,
    observed: 0.06,
    low: -0.05,
    high: 0.05,
    strongLow: -0.07,
    strongHigh: 0.07,
    verdict: 'higher' as const,
  }

  it('holds the headline to the stricter band: a change inside the record band only is none there', () => {
    expect(verdictOfCall(call, 'record')).toBe('higher')
    expect(verdictOfCall(call, 'headline')).toBe('none')
    expect(verdictOfCall({ ...call, observed: 0.08 }, 'headline')).toBe('higher')
    expect(verdictOfCall({ ...call, observed: -0.08, verdict: 'lower' }, 'headline')).toBe('lower')
  })

  it('derives the direction from the compared unit, with no displayed figure in it', () => {
    expect(directionOf(call)).toBe(1)
    expect(directionOf({ ...call, observed: -0.06, verdict: 'lower' })).toBe(-1)
    expect(directionOf({ ...call, verdict: 'none' })).toBe(0)
    expect(directionOf(call, 'headline')).toBe(0)
    expect(directionOf(undefined)).toBe(0)
  })

  it('says the smallest change it could have called, from the band, wider at the headline level', () => {
    expect(detectableAt(call)).toBeCloseTo(Math.expm1(0.05), 9)
    expect(detectableAt(call, 'headline')).toBeCloseTo(Math.expm1(0.07), 9)
    expect(detectableAt({ ...call, low: -0.2, high: 0.1 })).toBeCloseTo(-Math.expm1(-0.2), 9)
    expect(detectableAt({ ...call, low: null, high: null })).toBeNull()
  })

  it('has the headline band at least as wide as the record band for a real call', () => {
    const library = effortLibrary({ sport: 'run', perWeek: 4, weeks: 24, seed: 2, effortSd: 0.1 })
    const evidence = changeEvidence(
      library.filter((d) => d.startMs >= CUT),
      library.filter((d) => d.startMs < CUT),
      SETTINGS,
      DEFAULT_BIKE_MODEL,
      null,
    )
    const real = callAt(evidence, 'run', HEADLINE_DURATION_S)!
    expect(real.strongLow!).toBeLessThanOrEqual(real.low!)
    expect(real.strongHigh!).toBeGreaterThanOrEqual(real.high!)
    expect(verdictAt(evidence, 'run', HEADLINE_DURATION_S, 'headline')).not.toBe('untested')
  })
})

describe('an unbalanced pair is dealt by choosing the small side’s ranks', () => {
  const pooled = Float64Array.from({ length: 404 }, (_, i) => 404 - i)

  it('gives a band for 400 efforts against 4 that is wide, as the 4 are few, and asymmetric toward the larger side', () => {
    const band = nullBand(pooled, 4, 3)!
    // The four's best is below the 400's best most of the time: the null's centre is a loss for "now".
    expect(band.low).toBeLessThan(band.high)
    expect(band.high).toBeLessThan(0.05)
    expect(band.low).toBeLessThan(-0.5)
    const other = nullBand(pooled, 400, 3)!
    expect(other.high).toBeGreaterThan(0.5)
  })

  it('agrees with the walk through the pool where both could be used', () => {
    // The same pool of 40 dealt 4 against 36 by the walk (share 0 never takes Floyd) and by Floyd (share 1 always does).
    // With distinct values the small side holds the top effort with probability 4/40 under either; the median ln ratio agrees too.
    const pool = Float64Array.from({ length: 40 }, (_, i) => 40 - i)
    const draws = 20000
    const walk = dealRatios(pool, 4, 5, draws, 0)
    const floyd = dealRatios(pool, 4, 6, draws, 1)
    const topShare = (r: Float64Array) => r.filter((x) => x > 0).length / draws
    const sd = Math.sqrt((0.1 * 0.9) / draws)
    expect(Math.abs(topShare(walk) - 0.1)).toBeLessThan(4 * sd)
    expect(Math.abs(topShare(floyd) - 0.1)).toBeLessThan(4 * sd)
    const median = (r: Float64Array) => [...r].sort((a, b) => a - b)[draws / 2]!
    expect(Math.abs(median(walk) - median(floyd))).toBeLessThan(0.05)
  })
})
