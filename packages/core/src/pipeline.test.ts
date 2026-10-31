import { describe, expect, it } from 'vitest'
import { DURATIONS_S, PRIORS, RESTING_W_PER_KG } from './constants'
import type { AnalysisResult } from './pipeline'
import { combine, digestActivity } from './digest'
import { analyze, equivalentRunSpeed } from './pipeline'
import { generateActivity, sampleDataset } from './synthetic'
import type { ComparisonPoint } from './types'

/**
 * Ground-truth validation: the simulator knows the athlete's real efficiency,
 * economy and critical power, none of which the pipeline is told.
 */
const { athlete, activities } = sampleDataset()
const settings = { massKg: athlete.massKg, bikeMassKg: athlete.bikeMassKg }
const result: AnalysisResult = analyze(activities, settings)

const trueMetabolic = (cp: number, t: number) => cp + athlete.wPrime / t
const trueRatio = (t: number) => trueMetabolic(athlete.cpRun, t) / trueMetabolic(athlete.cpRide, t)
const at = (points: ComparisonPoint[], t: number) => points.find((p) => p.durationS === t)!

describe('analyze on simulated ground truth', () => {
  it('summarises every activity, newest first', () => {
    expect(result.activities).toHaveLength(activities.length)
    const starts = result.activities.map((a) => a.startMs)
    expect(starts).toEqual([...starts].sort((a, b) => b - a))
    expect(result.activities.filter((a) => a.powerSource === 'virtual')).toHaveLength(1)
    expect(
      result.activities.filter((a) => a.sport === 'run').every((a) => a.powerSource === 'none'),
    ).toBe(true)
  })

  it('recovers the best cycling power at each test duration within 1%', () => {
    for (const t of [180, 1200]) {
      const expected = trueMetabolic(athlete.cpRide, t) * athlete.grossEfficiency * athlete.massKg
      const got = result.rideCurve.find((p) => p.durationS === t)!.value
      expect(got / expected).toBeGreaterThan(0.99)
      expect(got / expected).toBeLessThan(1.01)
    }
  })

  it('recovers the best running metabolic power within 1% once true economy is applied', () => {
    for (const t of [180, 1200]) {
      const assumed = result.runCurve.find((p) => p.durationS === t)!.value
      const corrected = RESTING_W_PER_KG + athlete.runEconomyScale * (assumed - RESTING_W_PER_KG)
      expect(corrected / trueMetabolic(athlete.cpRun, t)).toBeGreaterThan(0.99)
      expect(corrected / trueMetabolic(athlete.cpRun, t)).toBeLessThan(1.01)
    }
  })

  it('produces duration curves that never rise with duration', () => {
    for (const curve of [result.runCurve, result.rideCurve]) {
      const finite = curve.filter((p) => Number.isFinite(p.value))
      for (let i = 1; i < finite.length; i++) {
        expect(finite[i]!.value).toBeLessThanOrEqual(finite[i - 1]!.value)
      }
    }
  })

  it('fits a critical power for both sports close to the simulated one', () => {
    const runCpTrue =
      RESTING_W_PER_KG + (athlete.cpRun - RESTING_W_PER_KG) / athlete.runEconomyScale
    const rideCpTrue = (athlete.cpRide * athlete.grossEfficiency) / PRIORS.grossEfficiency.mean
    expect(result.runCp!.cp / runCpTrue).toBeGreaterThan(0.95)
    expect(result.runCp!.cp / runCpTrue).toBeLessThan(1.05)
    expect(result.rideCp!.cp / rideCpTrue).toBeGreaterThan(0.95)
    expect(result.rideCp!.cp / rideCpTrue).toBeLessThan(1.05)
  })

  it('measures the heart-rate slope ratio close to the true efficiency mismatch', () => {
    const trueKappa =
      PRIORS.grossEfficiency.mean /
      athlete.grossEfficiency /
      (athlete.runEconomyScale / PRIORS.runEconomyScale.mean)
    expect(result.hr.kappa).not.toBeNull()
    expect(Math.abs(Math.log(result.hr.kappa! / trueKappa))).toBeLessThan(0.05)
    expect(Math.abs(Math.log(result.hr.kappa! / trueKappa))).toBeLessThan(2 * result.hr.lnKappaSe!)
  })

  it('brackets the true running-to-cycling ratio, before and after the heart-rate check', () => {
    for (const t of [300, 1200]) {
      const truth = trueRatio(t)
      const prior = at(result.comparison.prior, t).ratio
      const calibrated = at(result.comparison.calibrated!, t).ratio
      expect(prior.p05).toBeLessThan(truth)
      expect(prior.p95).toBeGreaterThan(truth)
      expect(calibrated.p05).toBeLessThan(truth)
      expect(calibrated.p95).toBeGreaterThan(truth)
      expect(Math.abs(calibrated.p50 / truth - 1)).toBeLessThan(0.04)
    }
  })

  it('narrows the range by at least a third using heart rate', () => {
    const prior = at(result.comparison.prior, 1200).ratio
    const calibrated = at(result.comparison.calibrated!, 1200).ratio
    expect((calibrated.p95 - calibrated.p05) / (prior.p95 - prior.p05)).toBeLessThan(0.67)
  })

  it('correctly concludes that this athlete is the stronger runner', () => {
    expect(at(result.comparison.calibrated!, 1200).ratio.p05).toBeGreaterThan(1)
  })

  it('calibrates the bike model near the simulated one and scores it out of sample', () => {
    expect(result.bikeModel.crr).toBeGreaterThan(athlete.crr * 0.7)
    expect(result.bikeModel.crr).toBeLessThan(athlete.crr * 1.3)
    expect(result.bikeModel.cda).toBeGreaterThan(athlete.cda * 0.85)
    expect(result.bikeModel.cda).toBeLessThan(athlete.cda * 1.15)
    expect(result.virtualAccuracy!.nSegments).toBeGreaterThanOrEqual(2)
    expect(result.virtualAccuracy!.mape).toBeLessThan(0.05)
  })

  it('flags the simulated heart-rate strap failure and nothing on clean activities', () => {
    const flagged = result.activities.filter((a) => a.flags.length > 0)
    expect(flagged).toHaveLength(1)
    expect(flagged[0]!.flags.map((f) => f.kind)).toContain('hr-implausible-for-power')
  })

  it('gives equivalents whose range brackets the true equal-cost running speed', () => {
    for (const eq of result.equivalents) {
      const metabolic = eq.ridePowerW / (athlete.grossEfficiency * athlete.massKg)
      const trueSpeed = (metabolic - RESTING_W_PER_KG) / (athlete.runEconomyScale * 3.9)
      expect(eq.runSpeed.p05).toBeLessThan(trueSpeed)
      expect(eq.runSpeed.p95).toBeGreaterThan(trueSpeed)
    }
    expect(result.equivalents.map((e) => e.durationS)).toEqual([180, 300, 600, 1200, 1800, 3600])
  })

  it('is deterministic', () => {
    expect(analyze(activities, settings)).toEqual(result)
  })
})

describe('analyze with partial data', () => {
  const runs = activities.filter((a) => a.sport === 'run')
  const rides = activities.filter((a) => a.sport === 'ride')

  it('handles no activities', () => {
    const empty = analyze([], settings)
    expect(empty.activities).toEqual([])
    expect(empty.runCurve).toHaveLength(DURATIONS_S.length)
    expect(empty.runCurve.every((p) => Number.isNaN(p.value))).toBe(true)
    expect(empty.comparison.prior).toEqual([])
    expect(empty.comparison.calibrated).toBeNull()
    expect(empty.runCp).toBeNull()
    expect(empty.equivalents).toEqual([])
    expect(empty.virtualAccuracy).toBeNull()
  })

  it('handles runs only', () => {
    const r = analyze(runs, settings)
    expect(r.runCp).not.toBeNull()
    expect(r.rideCp).toBeNull()
    expect(r.comparison.prior).toEqual([])
    expect(r.hr.run).not.toBeNull()
    expect(r.hr.kappa).toBeNull()
  })

  it('handles rides only', () => {
    const r = analyze(rides, settings)
    expect(r.rideCp).not.toBeNull()
    expect(r.comparison.prior).toEqual([])
    expect(r.equivalents.length).toBeGreaterThan(0)
  })

  it('falls back to the prior range when there is no heart rate', () => {
    const noHr = activities.map((a) => ({
      ...a,
      hasHeartRate: false,
      heartRate: new Float64Array(a.n).fill(NaN),
    }))
    const r = analyze(noHr, settings)
    expect(r.comparison.calibrated).toBeNull()
    expect(at(r.comparison.prior, 1200).ratio).toEqual(at(result.comparison.prior, 1200).ratio)
  })

  it('uses only climbs for a ride without a power meter, and nothing if it is indoors', () => {
    const climb = generateActivity(
      athlete,
      {
        id: 'climb',
        name: 'Climb',
        sport: 'ride',
        startMs: 0,
        durationS: 3600,
        effort: 'tempo',
        terrain: 'climb',
        withPower: false,
      },
      7,
    )
    const outdoor = analyze([climb], settings)
    expect(outdoor.activities[0]!.powerSource).toBe('virtual')
    const best5 = outdoor.rideCurve.find((p) => p.durationS === 300)!.value
    const truth = 0.88 * athlete.cpRide * athlete.grossEfficiency * athlete.massKg
    expect(best5 / truth).toBeGreaterThan(0.9)
    expect(best5 / truth).toBeLessThan(1.1)

    const indoor = analyze([{ ...climb, indoor: true }], settings)
    expect(indoor.rideCurve.every((p) => Number.isNaN(p.value))).toBe(true)
  })

  it('ignores weight changes for running but scales cycling', () => {
    const heavier = analyze(activities, { ...settings, massKg: settings.massKg * 1.1 })
    expect(heavier.runCurve).toEqual(result.runCurve)
    const a = at(heavier.comparison.prior, 1200).ratio.p50
    const b = at(result.comparison.prior, 1200).ratio.p50
    expect(a / b).toBeCloseTo(1.1, 2)
  })
})

describe('equivalentRunSpeed', () => {
  it('matches the closed form at the prior means', () => {
    const { p50 } = equivalentRunSpeed(250, 75, null)
    const expected = (250 / (PRIORS.grossEfficiency.mean * 75) - RESTING_W_PER_KG) / 3.9
    expect(p50 / expected).toBeGreaterThan(0.99)
    expect(p50 / expected).toBeLessThan(1.01)
  })

  it('never returns a negative speed', () => {
    expect(equivalentRunSpeed(0, 75, null).p05).toBe(0)
  })

  it('moves and narrows with a heart-rate cross-check', () => {
    const prior = equivalentRunSpeed(250, 75, null)
    const hr = { run: null, ride: null, kappa: 1.1, lnKappaSe: 0.03 }
    const calibrated = equivalentRunSpeed(250, 75, hr)
    expect(calibrated.p50).toBeGreaterThan(prior.p50)
    expect(calibrated.p95 - calibrated.p05).toBeLessThan(prior.p95 - prior.p05)
  })
})

describe('effort check', () => {
  const effortAt = (r: AnalysisResult, t: number) => r.effort.find((e) => e.durationS === t)

  it('finds a maximum heart rate within 3 bpm of the simulated athlete', () => {
    expect(result.maxHeartRate).not.toBeNull()
    expect(Math.abs(result.maxHeartRate! - athlete.hrMax)).toBeLessThan(3)
  })

  it('has one effort entry per curve duration, in order, so a library of one sport has them too', () => {
    expect(result.effort.map((e) => e.durationS)).toEqual([...DURATIONS_S])
    const runnerOnly = analyze(
      activities.filter((a) => a.sport === 'run'),
      settings,
    )
    expect(runnerOnly.comparison.prior).toEqual([])
    expect(runnerOnly.effort.map((e) => e.durationS)).toEqual([...DURATIONS_S])
    expect(runnerOnly.effort.find((e) => e.durationS === 1200)!.runHrFraction).not.toBeNull()
  })

  it('finds both 20 minute efforts close to all-out for the sample data', () => {
    const effort = effortAt(result, 1200)!
    expect(effort.runHrFraction!).toBeGreaterThanOrEqual(0.93)
    expect(effort.rideHrFraction!).toBeGreaterThanOrEqual(0.9)
  })

  it('finds the cycling 20 minute effort submaximal once the Power Test is removed', () => {
    const without = activities.filter((a) => a.name !== 'Power Test')
    const r = analyze(without, settings)
    const effort = effortAt(r, 1200)!
    expect(effort.rideHrFraction!).toBeLessThan(0.9)
    expect(effort.runHrFraction!).toBeGreaterThanOrEqual(0.9)
  })

  it("regresses heart rate only on blocks at or below each sport's critical power", () => {
    expect(result.hr.run!.points.length).toBeGreaterThan(0)
    expect(result.hr.ride!.points.length).toBeGreaterThan(0)
    for (const p of result.hr.run!.points) {
      expect(p.metabolicPower).toBeLessThanOrEqual(result.runCp!.cp)
    }
    for (const p of result.hr.ride!.points) {
      expect(p.metabolicPower).toBeLessThanOrEqual(result.rideCp!.cp)
    }
  })
})

describe('analyze as digest then combine', () => {
  it('equals combining the digest of each activity, exactly', () => {
    const digests = activities.map((a) => digestActivity(a))
    expect(analyze(activities, settings)).toEqual(combine(digests, settings))
  })
})
