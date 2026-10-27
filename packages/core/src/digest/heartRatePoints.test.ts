import { describe, expect, it } from 'vitest'
import { DURATIONS_S } from '../constants'
import { flatSpeedToMetabolic } from '../metabolic'
import { sampleDataset } from '../synthetic'
import type { ActivityDigest, DigestCurvePoint, DigestHrBlock, HrPoint } from '../types'
import { heartRatePoints } from './combine'
import { digestActivity } from './digestActivity'

const { athlete, activities } = sampleDataset()
const totalMassKg = athlete.massKg + athlete.bikeMassKg
const template = digestActivity(activities.find((a) => a.sport === 'run')!)
const NO_CURVE: DigestCurvePoint[] = DURATIONS_S.map((durationS) => ({
  durationS,
  value: Number.NaN,
  startIndex: 0,
  windowS: durationS,
  heartRate: null,
  terms: null,
}))

/** A run whose only heart-rate blocks are the given flat speeds, m/s, each a 150 bpm five-minute block. */
function runWithBlocks(id: string, speeds: number[]): ActivityDigest {
  const hrBlocks: DigestHrBlock[] = speeds.map((speed) => ({
    heartRate: 150,
    value: flatSpeedToMetabolic(speed),
    terms: null,
  }))
  return { ...template, id, sport: 'run', curve: NO_CURVE, hrBlocks, calibration: null }
}

/** The run heart-rate points of one run's blocks, as the threshold check sees them. */
function runPointsOf(digest: ActivityDigest): HrPoint[] {
  return heartRatePoints([digest], totalMassKg, athlete.massKg, { cda: 0.32, crr: 0.005 }).runPoints
}

describe('the run heart-rate blocks against the ceiling', () => {
  it('keeps a five-minute block that is under the ceiling for five minutes', () => {
    // 7 m/s is over the twenty-minute ceiling (about 6.2 m/s) but under the five-minute one (7.08 m/s),
    // so it shows that the block is judged at its own duration.
    const points = runPointsOf(runWithBlocks('a', [7]))
    expect(points.map((p) => p.metabolicPower)).toEqual([flatSpeedToMetabolic(7)])
  })

  it('drops a five-minute block faster than the five-minute ceiling', () => {
    // 8 m/s is not a possible five-minute average, so the block is not a heart-rate point.
    expect(runPointsOf(runWithBlocks('a', [8]))).toEqual([])
  })
})
