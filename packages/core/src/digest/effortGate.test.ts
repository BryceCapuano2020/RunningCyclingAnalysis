import { describe, expect, it } from 'vitest'
import { HEADLINE_DURATION_S, THRESHOLD_HOLD_S } from '../constants'
import { athleteFor, birthYearFor, libraryOf } from '../effort/test/libraries'
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
    // The floor is the best 30 minutes where the curve has one: the time a threshold is said to be held for.
    const best = result.runCurve.find((p) => p.durationS === THRESHOLD_HOLD_S)!.value
    expect(result.effortGate.run.floor).toEqual({ durationS: THRESHOLD_HOLD_S, value: best })
    // The reference is too low to be a maximum, so a harder effort is not what is missing: the reference is.
    expect(result.effortGate.run.neededS).toBeNull()
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
    // A single test day has too few days with a heart rate to set its own reference: the age-predicted maximum stands in.
    const birthYear = birthYearFor(athleteFor(seed), seed)
    const result = combine(
      digestsOf(kind, 'run', seed),
      birthYear === null ? SETTINGS : { ...SETTINGS, birthYear },
    )
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

  it('cannot set a reference from a single test day without the age: it says the effort was not checked, and withholds nothing', () => {
    const result = combine(digestsOf('testOnly', 'run', 1), SETTINGS)
    expect(result.effortGate.run).toMatchObject({
      verdict: 'unknown',
      unchecked: 'thin',
      reference: 'thin',
    })
    expect(result.runCp).not.toBeNull()
    expect(result.runCpRefusal).toBeNull()
  })

  it('takes a maximum the athlete entered as the reference, trusted, over everything the activities say', () => {
    const athlete = athleteFor(3)
    const entered = [
      {
        kind: 'maxHeartRate' as const,
        sport: 'run' as const,
        value: athlete.hrMax,
        from: '2020-01-01',
      },
    ]
    const easy = combine(digestsOf('easy'), { ...SETTINGS, measurements: entered })
    // Against the true maximum an easy library's best is not hard, and the reference no longer says it is low.
    expect(easy.effortGate.run).toMatchObject({
      verdict: 'notHard',
      reference: 'trusted',
      referenceSource: 'entered',
      referenceBpm: athlete.hrMax,
      neededS: HEADLINE_DURATION_S,
    })
    const hardHeavy = combine(digestsOf('hardHeavy'), SETTINGS)
    // Without it, intervals twice a week put the typical day at the maximum, as a tempo-only runner's is: held as habitual.
    expect(hardHeavy.effortGate.run.reference).toBe('habitual')
    const told = combine(digestsOf('hardHeavy'), { ...SETTINGS, measurements: entered })
    expect(told.effortGate.run.verdict).toBe('hard')
  })

  it('judges the reference against the age band: a maximum far over what the age gives is not trusted until entered', () => {
    const athlete = athleteFor(3)
    const young = Math.round((208 - athlete.hrMax + 40) / 0.7)
    // Born so that the predicted maximum is 40 bpm under the reference the activities give.
    const result = combine(digestsOf('hard'), { ...SETTINGS, birthYear: 2021 - young })
    expect(result.effortGate.run.reference).toBe('high')
    expect(result.effortGate.run.verdict).toBe('notHard')
    expect(result.effortGate.run.neededS).toBeNull()
  })

  it('does not hold a rider for a typical day at the maximum when the judged best 20 minutes is a power meter’s measurement', () => {
    // Tempo-only riding has its typical day at its maximum. A runner is held for it; a rider whose best 20 minutes is a
    // measurement is not: the fit's own refusals answer for the curve. A rider without a meter is held like a runner.
    const measured = combine(digestsOf('tempo', 'ride', 1), SETTINGS)
    const estimated = combine(
      libraryOf('tempo', athleteFor(1), 1, 'ride', { withPower: false }).map((a) =>
        digestActivity(a),
      ),
      SETTINGS,
    )
    const runs = combine(digestsOf('tempo', 'run', 1), SETTINGS)
    expect(runs.effortGate.run.reference).toBe('habitual')
    expect(measured.effortGate.ride.reference).toBe('trusted')
    expect(estimated.effortGate.ride.reference).not.toBe('trusted')
  })

  it('lists the hard sessions and the long sessions of high average heart rate that predictions may draw on', () => {
    const result = combine(digestsOf('hard'), SETTINGS)
    const { hard, endurance } = result.effortGate.run.sessions
    expect(hard.length).toBeGreaterThan(10)
    expect(hard.length).toBeLessThan(result.activities.length)
    expect(endurance.length).toBeLessThan(result.activities.length)
    expect(combine(digestsOf('easy'), SETTINGS).effortGate.run.sessions.hard).toEqual([])
  })

  it('uses an entered cycling maximum as it is, not lifted by the running reference', () => {
    const both = [
      { kind: 'maxHeartRate' as const, sport: 'run' as const, value: 190, from: '2020-01-01' },
      { kind: 'maxHeartRate' as const, sport: 'ride' as const, value: 172, from: '2020-01-01' },
    ]
    const library = [...digestsOf('hard'), ...digestsOf('hard', 'ride')]
    const result = combine(library, { ...SETTINGS, measurements: both })
    expect(result.effortGate.ride).toMatchObject({ referenceBpm: 172, referenceSource: 'entered' })
    expect(result.effortGate.run).toMatchObject({ referenceBpm: 190, referenceSource: 'entered' })
  })
})
