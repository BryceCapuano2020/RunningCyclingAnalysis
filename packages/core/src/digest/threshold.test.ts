import { describe, expect, it } from 'vitest'
import { criticalPowerOutcome, fitCriticalPowerUnchecked, wPrimeFloor } from '../cp'
import { generateActivity, sampleDataset, DEFAULT_ATHLETE } from '../synthetic'
import type { AthleteSettings } from '../types'
import { combine } from './combine'
import { digestActivity } from './digestActivity'

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const { activities } = sampleDataset()
const DIGESTS = activities.map((activity) => digestActivity(activity))

/** The sample's digest of one activity, by its name. */
function digestNamed(name: string) {
  const index = activities.findIndex((activity) => activity.name === name)
  const digest = DIGESTS[index]
  if (digest === undefined) throw new Error(`No sample activity named ${name}`)
  return digest
}

/** A ride whose measured work above critical power is about `wPrimeJ` joules, for a 75 kg athlete. */
function rideWithWPrime(wPrimeJ: number) {
  const athlete = {
    ...DEFAULT_ATHLETE,
    wPrime: wPrimeJ / (DEFAULT_ATHLETE.grossEfficiency * DEFAULT_ATHLETE.massKg),
  }
  const activity = generateActivity(
    athlete,
    {
      id: 'near-floor',
      name: 'Near the floor',
      sport: 'ride',
      startMs: Date.UTC(2026, 0, 5, 7),
      durationS: 7200,
      effort: 'test',
      terrain: 'flat',
      withPower: true,
    },
    7,
  )
  return digestActivity(activity)
}

describe('the threshold on the sample', () => {
  it('keeps a threshold in both sports for the full sample', () => {
    const result = combine(DIGESTS, SETTINGS)
    expect(result.runCp).not.toBeNull()
    expect(result.rideCp).not.toBeNull()
    expect(result.runCpRefusal).toBeNull()
    expect(result.rideCpRefusal).toBeNull()
  })

  it('refuses the sample’s Tempo Run alone, whose work capacity is 2.7 J per kg', () => {
    const result = combine([digestNamed('Tempo Run')], SETTINGS)
    // A sign test alone would accept it: the unchecked fit keeps the work capacity positive.
    expect(fitCriticalPowerUnchecked(result.runCurve)?.wPrime).toBeGreaterThan(0)
    expect(result.runCp).toBeNull()
    expect(result.runCpRefusal).toBe('shape')
  })

  it('keeps the sample’s Morning Run alone, whose work capacity is above the run floor', () => {
    // Its work capacity is 79 J per kg, about 20 m of running, above the 15 m floor.
    const result = combine([digestNamed('Morning Run')], SETTINGS)
    const outcome = criticalPowerOutcome(result.runCurve, {
      minWPrime: wPrimeFloor('run', SETTINGS.massKg),
    })
    expect(outcome.fit).not.toBeNull()
    expect(outcome.refusal).toBeNull()
    // One run is too few days with a heart rate to set a reference without the age, so the effort gate cannot judge it:
    // the fit is the rules', it is shown, and the effort is said not to have been checked.
    expect(result.runCp).not.toBeNull()
    expect(result.effortGate.run).toMatchObject({ verdict: 'unknown', unchecked: 'thin' })
    // With the age the reference is the age-predicted maximum, and an easy run is not a hard effort against it.
    const aged = combine([digestNamed('Morning Run')], { ...SETTINGS, birthYear: 1985 })
    expect(aged.effortGate.run.reference).toBe('trusted')
    expect(aged.runCp).toBeNull()
    expect(aged.runCpRefusal).toBe('effort')
  })

  it('refuses the sample’s Saturday Long Ride alone by the ride floor and by nothing else', () => {
    const result = combine([digestNamed('Saturday Long Ride')], SETTINGS)
    expect(result.rideCp).toBeNull()
    expect(result.rideCpRefusal).toBe('shape')
    // Without the floor the same efforts are a fit: the refusal is the floor's alone.
    expect(criticalPowerOutcome(result.rideMetabolicCurve, { minWPrime: 0 }).fit).not.toBeNull()
  })
})

describe('the ride floor does not depend on mass', () => {
  it('keeps a ride with 3.1 kJ of work above critical power at 60, 75 and 90 kg', () => {
    // The ride carries the same measured work at every mass. The floor is 3 kJ, so this is just above
    // it, which is where a fixed 75 kg floor would refuse it at 90 kg.
    const digest = rideWithWPrime(3300)
    for (const massKg of [60, 75, 90]) {
      const result = combine([digest], { massKg, bikeMassKg: 9 })
      const workKj =
        (fitCriticalPowerUnchecked(result.rideMetabolicCurve)?.wPrime ?? 0) * 0.215 * massKg
      expect(workKj).toBeGreaterThan(3000)
      expect(workKj).toBeLessThan(3600)
      expect(result.rideCp, `ride at ${massKg} kg`).not.toBeNull()
      expect(result.rideCpRefusal, `ride at ${massKg} kg`).toBeNull()
    }
  })
})

describe('the heart-rate check when a threshold is refused', () => {
  it('cuts heart rate with the fit before refusal, so the check is the same as with no refusal', () => {
    // Canyon Climb with the runs: its ride fit is refused, and the check must still have its kappa.
    const canyonClimb = digestNamed('Canyon Climb')
    const runs = DIGESTS.filter((digest) => digest.sport === 'run')
    const result = combine([...runs, canyonClimb], SETTINGS)
    expect(result.rideCpRefusal).not.toBeNull()
    expect(result.hr.kappa).not.toBeNull()
    expect(result.hr.kappa).toBeCloseTo(0.975, 4)
  })
})
