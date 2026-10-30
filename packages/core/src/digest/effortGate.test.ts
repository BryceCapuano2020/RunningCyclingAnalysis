import { describe, expect, it } from 'vitest'
import { HEADLINE_DURATION_S } from '../constants'
import { athleteFor, libraryOf } from '../effort/test/libraries'
import type { LibraryKind } from '../effort/test/libraries'
import type { Sport } from '../types'
import { combine } from './combine'
import { digestActivity } from './digestActivity'

const SETTINGS = { massKg: 75, bikeMassKg: 9 }

function digestsOf(kind: LibraryKind, sport: Sport = 'run', seed = 3) {
  return libraryOf(kind, athleteFor(seed), seed, sport).map((a) => digestActivity(a))
}

/** The same library as if the watch had recorded no heart rate. */
function withoutHeartRate(kind: LibraryKind) {
  return digestsOf(kind).map((digest) =>
    Object.assign({}, digest, {
      hasHeartRate: false,
      maxHeartRate: null,
      curve: digest.curve.map((point) => Object.assign({}, point, { heartRate: null })),
    }),
  )
}

describe('the effort gate through the analysis', () => {
  it('withholds a runner-only easy library’s threshold, and says the best 20 minutes as a floor', () => {
    const result = combine(digestsOf('easy'), SETTINGS)
    expect(result.effortGate.run.verdict).toBe('notHard')
    expect(result.runCp).toBeNull()
    expect(result.runCpRefusal).toBe('effort')
    expect(result.runCpUneven).toBeNull()
    const best = result.runCurve.find((p) => p.durationS === HEADLINE_DURATION_S)!.value
    expect(result.effortGate.run.floor).toBe(best)
    expect(result.effortGate.run.neededS).toBe(HEADLINE_DURATION_S)
    // A sport with no activities has nothing to judge.
    expect(result.effortGate.ride.verdict).toBe('unknown')
  })

  it('gives a runner-only library an effort check, and reads an easy one’s reference as low, not hard', () => {
    const result = combine(digestsOf('easy'), SETTINGS)
    expect(result.comparison.prior).toEqual([])
    const check = result.effort.find((e) => e.durationS === HEADLINE_DURATION_S)!
    // The share of its own highest heart rate is near 100%, which is the circle: the reference says it is low.
    expect(check.runHrFraction).toBeGreaterThan(0.9)
    expect(check.runReference).toBe('low')
    expect(check.rideHrFraction).toBeNull()
  })

  it('does the same for a ride-only easy library', () => {
    const result = combine(digestsOf('easy', 'ride'), SETTINGS)
    expect(result.effortGate.ride.verdict).toBe('notHard')
    expect(result.rideCp).toBeNull()
    // An easy ride's efforts also show no threshold on their shape; whatever the fit gives, the gate withholds.
    expect(result.rideCpRefusal).not.toBeNull()
    expect(
      result.effort.find((e) => e.durationS === HEADLINE_DURATION_S)!.rideHrFraction,
    ).not.toBeNull()
  })

  it('holds a tempo-only library: its highest heart rate is where its typical day is', () => {
    const result = combine(digestsOf('tempo'), SETTINGS)
    expect(result.effortGate.run.verdict).toBe('notHard')
    expect(result.effortGate.run.reference).not.toBe('trusted')
    expect(result.runCp).toBeNull()
  })

  it.each([
    ['hard', 3],
    ['testOnly', 1],
  ] as const)('keeps the threshold of a %s library', (kind, seed) => {
    const result = combine(digestsOf(kind, 'run', seed), SETTINGS)
    expect(result.effortGate.run.verdict).toBe('hard')
    expect(result.effortGate.run.reference).toBe('trusted')
    expect(result.effortGate.run.share).toBeGreaterThanOrEqual(0.9)
    expect(result.runCp).not.toBeNull()
    expect(result.runCpRefusal).toBeNull()
  })

  it('drops the heart-rate VO2max when the reference is not a maximum', () => {
    expect(combine(digestsOf('hard'), SETTINGS).runVo2max).not.toBeNull()
    expect(combine(digestsOf('easy'), SETTINGS).runVo2max).toBeNull()
  })

  it('judges an easy run library against a hard ride library’s maximum, as the sports share a reference', () => {
    const result = combine([...digestsOf('easy'), ...digestsOf('hard', 'ride')], SETTINGS)
    expect(result.effortGate.ride.verdict).toBe('hard')
    expect(result.effortGate.run.reference).toBe('trusted')
    expect(result.effortGate.run.share).toBeLessThan(0.9)
    expect(result.effortGate.run.verdict).toBe('notHard')
    expect(result.runCpRefusal).toBe('effort')
  })

  it('withholds nothing where there is no heart rate to judge by', () => {
    const result = combine(withoutHeartRate('easy'), SETTINGS)
    expect(result.effortGate.run.verdict).toBe('unknown')
    expect(result.runCp).not.toBeNull()
    expect(result.runCpRefusal).toBeNull()
    expect(result.effort.every((e) => e.runHrFraction === null)).toBe(true)
  })
})
