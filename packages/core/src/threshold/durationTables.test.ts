import { describe, expect, it } from 'vitest'
import { flatSpeedToMetabolic, metabolicToFlatSpeed } from '../metabolic'
import { SPORTS } from '../types'
import type { Sport } from '../types'
import { durationRatio, ratioSpread } from './durationRatio'
import {
  DURATION_TABLES,
  runDurationRatio,
  runHeldAt,
  runSpeedAt,
  runThresholdOf,
  runVo2,
} from './durationTables'
import { thresholdOver } from './estimate'
import type { ThresholdEffort } from './types'

describe('the running duration table', () => {
  it('is Daniels and Gilbert’s share of VO2max over the share held for an hour', () => {
    const ratios = [5, 10, 20, 40, 60].map((minutes) => runDurationRatio(minutes * 60))
    expect(ratios.map((r) => Number(r.toFixed(3)))).toEqual([1.229, 1.137, 1.073, 1.029, 1])
  })

  it('is 1 at 60 min, falls steadily from 3 min to there, and keeps falling past it', () => {
    expect(runDurationRatio(3600)).toBeCloseTo(1, 12)
    const minutes = [3, 5, 8, 10, 15, 20, 30, 45, 60, 90, 180]
    for (let i = 1; i < minutes.length; i++) {
      expect(runDurationRatio(minutes[i]! * 60)).toBeLessThan(
        runDurationRatio(minutes[i - 1]! * 60),
      )
    }
    expect(runDurationRatio(5400)).toBeLessThan(1)
  })
})

/** Daniels' oxygen cost by bisection on the cost of a speed, so the check does not use the module’s own inverse. */
function danielsSpeedAt(vo2: number): number {
  let low = 0
  let high = 12
  for (let i = 0; i < 80; i++) {
    const mid = (low + high) / 2
    if (runVo2(mid) < vo2) low = mid
    else high = mid
  }
  return (low + high) / 2
}

describe('a run’s best scaled through speed, as Daniels applies the share of VO2max', () => {
  const wkgAt = (speedMs: number) => flatSpeedToMetabolic(speedMs)
  const speedOf = (wkg: number) => metabolicToFlatSpeed(wkg)
  // Daniels' share of VO2max for t minutes, written out here: 0.8 + 0.1894393 e^(-0.012778 t) + 0.2989558 e^(-0.1932605 t).
  const share = (t: number) =>
    0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t)

  it('takes an effort at the speed Daniels gives for t to the speed he gives for an hour, within 0.5%', () => {
    for (const vo2max of [38, 52, 66]) {
      const hourSpeed = danielsSpeedAt(vo2max * share(60))
      for (const minutes of [3, 5, 10, 20, 40, 60]) {
        const effort = wkgAt(danielsSpeedAt(vo2max * share(minutes)))
        const scaled = speedOf(runThresholdOf(effort, minutes * 60))
        expect(Math.abs(scaled / hourSpeed - 1), `${vo2max} for ${minutes} min`).toBeLessThan(0.005)
      }
    }
  })

  it('reads the published 5 km and 10 km of one runner as the same hour speed', () => {
    // Daniels' tables for a VDOT of 50: 5 km in 19:57 and 10 km in 41:21, and the pace of an hour that his formulas give.
    const fiveK = { speed: 5000 / (19.95 * 60), seconds: 19.95 * 60 }
    const tenK = { speed: 10_000 / (41.35 * 60), seconds: 41.35 * 60 }
    const hourOf = ({ speed, seconds }: { speed: number; seconds: number }) =>
      speedOf(runThresholdOf(wkgAt(speed), seconds))
    expect(Math.abs(hourOf(fiveK) / hourOf(tenK) - 1)).toBeLessThan(0.005)
    // About 3.95 m/s, a 6:47 mile, for that runner.
    expect(hourOf(tenK)).toBeGreaterThan(3.9)
    expect(hourOf(tenK)).toBeLessThan(4.0)
  })

  it('is not the ratio of the gross metabolic rate: a quicker best implies a quicker hour than that', () => {
    // The unit holds a resting part and the cost of speed is convex, so dividing W/kg by the ratio reads the hour slow.
    const wkg = wkgAt(4.5)
    const plain = wkg / runDurationRatio(300)
    const through = runThresholdOf(wkg, 300)
    expect(through).toBeGreaterThan(plain * 1.03)
    // And it depends on the value: a faster best does not scale by the same factor.
    const faster = runThresholdOf(wkgAt(5.5), 300) / wkgAt(5.5)
    expect(faster).not.toBeCloseTo(through / wkg, 3)
  })

  it('is the best itself at an hour, and `held` is its inverse', () => {
    for (const speed of [2.5, 3.5, 4.5]) {
      expect(runThresholdOf(wkgAt(speed), 3600)).toBeCloseTo(wkgAt(speed), 9)
      for (const seconds of [180, 600, 1200, 2700, 5400]) {
        expect(runThresholdOf(runHeldAt(wkgAt(speed), seconds), seconds)).toBeCloseTo(
          wkgAt(speed),
          9,
        )
      }
    }
    expect(runSpeedAt(runVo2(3.7))).toBeCloseTo(3.7, 10)
  })

  it('scales nothing that is not a run’s speed', () => {
    // At rest, or at the cost of a stroll, there is no oxygen cost to take a share of.
    expect(runThresholdOf(1.22, 1200)).toBeNaN()
    expect(runThresholdOf(0.5, 1200)).toBeNaN()
    expect(runSpeedAt(-50)).toBeNaN()
  })
})

describe('the tables by sport', () => {
  it('has one for every sport, and a rider’s is the ratio and spread the ride estimate always used', () => {
    expect(Object.keys(DURATION_TABLES).sort()).toEqual([...SPORTS].sort())
    for (const durationS of [180, 480, 1200, 2700, 3600, 5400]) {
      expect(DURATION_TABLES.ride.threshold(240, durationS)).toBe(240 / durationRatio(durationS))
      expect(DURATION_TABLES.ride.held(240, durationS)).toBe(240 * durationRatio(durationS))
      expect(DURATION_TABLES.ride.spread(durationS)).toBe(ratioSpread(durationS))
    }
  })

  it('implies the best itself at an hour in every sport: a threshold is what is held for an hour', () => {
    for (const sport of SPORTS) {
      expect(DURATION_TABLES[sport].threshold(15, 3600)).toBeCloseTo(15, 9)
      expect(DURATION_TABLES[sport].held(15, 3600)).toBeCloseTo(15, 9)
    }
  })

  it('starts a runner’s spread from the rider’s, smallest at 20 min', () => {
    expect(DURATION_TABLES.run.spread(1200)).toBeCloseTo(0.025, 12)
    expect(DURATION_TABLES.run.spread(480)).toBeGreaterThan(DURATION_TABLES.run.spread(1200))
  })
})

describe('the shortest effort of each sport', () => {
  const effort = (sport: Sport, id: string, durationS: number, level: number, over = 1) =>
    ({
      activityId: id,
      durationS,
      value: DURATION_TABLES[sport].held(level, durationS) * over,
      heartRate: null,
      ageDays: 0,
      estimated: false,
    }) satisfies ThresholdEffort

  it('is 3 min for a ride and 8 min for a run, whose short training bests are strides, hills and GPS noise', () => {
    expect(DURATION_TABLES.ride.shortestS).toBe(180)
    expect(DURATION_TABLES.run.shortestS).toBe(480)
  })

  it.each(SPORTS)(
    'reads a %s from its shortest effort and says nothing from a second under it',
    (sport) => {
      const { shortestS } = DURATION_TABLES[sport]
      expect(
        thresholdOver(DURATION_TABLES[sport], [effort(sport, 'a', shortestS - 1, 15)], [], null),
      ).toBeNull()
      const at = thresholdOver(
        DURATION_TABLES[sport],
        [effort(sport, 'a', shortestS, 15)],
        [],
        null,
      )
      expect(at!.value).toBeCloseTo(15, 6)
      expect(at!.efforts.strongest.durationS).toBe(shortestS)
    },
  )

  // The fast short bests of a runner (strides, a hill) are 15% over what the table holds for them. Whether they move the answer
  // is the sport's table: a ride reads from 3 min and is lifted, a run from 8 min and is not.
  const MOVED_BY_SHORT_BESTS: Record<Sport, boolean> = { run: false, ride: true }
  it.each(SPORTS)(
    '%s: fast bests of 3 and 5 min move the threshold only where the table reads them',
    (sport) => {
      const sustained = ['a', 'b', 'c', 'd'].map((id) => effort(sport, id, 1200, 15))
      const fast = [180, 300].flatMap((s) =>
        ['a', 'b', 'c', 'd'].map((id) => effort(sport, id, s, 15, 1.15)),
      )
      const table = DURATION_TABLES[sport]
      const plain = thresholdOver(table, sustained, [], null)!
      const withFast = thresholdOver(table, [...sustained, ...fast], [], null)!
      expect(plain.value).toBeCloseTo(15, 6)
      if (MOVED_BY_SHORT_BESTS[sport]) expect(withFast.value).toBeGreaterThan(plain.value * 1.05)
      else expect(withFast.value).toBe(plain.value)
    },
  )
})
