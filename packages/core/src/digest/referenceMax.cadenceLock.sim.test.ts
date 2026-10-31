import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../constants'
import { maxHeartRate } from '../effort'
import { mulberry32, normal } from '../math'
import type { Activity, ActivityDigest, QualityReport } from '../types'
import { movingMask } from './masks'
import { referenceMaxOf } from './referenceMax'
import { withCadenceLock } from './revision7Gate'
import { syntheticActivity } from './test/syntheticActivity'

/**
 * What the cadence-lock detector does to the athlete's reference maximum (D12 section 2.2). Each library is
 * one athlete's days: a short run with a hard plateau at some share of the true maximum, heart rate and cadence
 * quantised as the files are (whole bpm, even steps a minute), and on some days a strap that repeats the
 * cadence for a minute or more. A day's peak is the digest's own (`maxHeartRate`, a 30 s mean over the heart
 * rate that is not set aside); the reference is the shipped rule over the days. Extends referenceMax.sim.test.ts.
 */

const START = Date.UTC(2020, 0, 1, 12)
const N = 480
const between = (r: () => number, low: number, high: number) => low + (high - low) * r()

interface Athlete {
  trueMax: number
  /** The cadence a lock repeats, steps a minute. */
  cadence: number
  /** The share of days with a lock. */
  lock: number
}

/** The peak 30 s mean of one day, with the detector off and on. */
function dayPeaks(r: () => number, athlete: Athlete): { off: number; on: number } {
  const u = r()
  const share =
    u < 0.03 ? between(r, 0.985, 1) : u < 0.18 ? between(r, 0.93, 0.985) : between(r, 0.68, 0.92)
  const peak = athlete.trueMax * share
  const base = peak * 0.85
  const heartRate = new Float64Array(N)
  const cadence = new Float32Array(N)
  let drift = 0
  for (let i = 0; i < N; i++) {
    drift = 0.97 * drift + 0.8 * normal(r)
    // Up to the plateau over a minute, 120 s at the peak, back down over a minute.
    const level =
      i < 140 ? 0 : i < 200 ? (i - 140) / 60 : i < 320 ? 1 : i < 380 ? (380 - i) / 60 : 0
    heartRate[i] = Math.round(base + (peak - base) * level + drift)
    cadence[i] = 2 * Math.round((athlete.cadence + (r() * 2 - 1) * 3) / 2)
  }
  if (r() < athlete.lock) {
    const length = Math.round(between(r, 60, 300))
    const start = Math.floor(between(r, 10, N - length - 10))
    for (let i = start; i < start + length; i++) heartRate[i] = cadence[i]!
  }
  const activity: Activity = {
    ...syntheticActivity({ n: N, heartRate }),
    cadence,
    cadenceUnit: 'steps/min',
  }
  const open: QualityReport = {
    flags: [],
    validMotion: new Uint8Array(N).fill(1),
    validPower: new Uint8Array(N),
    validGrade: new Uint8Array(N).fill(1),
    validAltitude: new Uint8Array(N).fill(1),
    validHeartRate: new Uint8Array(N).fill(1),
  }
  const peakOf = (q: QualityReport) =>
    maxHeartRate([{ activity, validHeartRate: q.validHeartRate }])!
  return {
    off: peakOf(open),
    on: peakOf(withCadenceLock(activity, open, movingMask(activity))),
  }
}

/** The reference maximum the days give with the detector off and on, against the true maximum. */
function library(athlete: Athlete, seed: number, days = 90) {
  const r = mulberry32(seed * 104729 + 17)
  const off: ActivityDigest[] = []
  const on: ActivityDigest[] = []
  for (let day = 0; day < days; day++) {
    const peaks = dayPeaks(r, athlete)
    const make = (maxHeartRate: number) =>
      ({
        id: `d${day}`,
        sport: 'run',
        startMs: START + day * 2 * DAY_MS,
        maxHeartRate,
      }) as ActivityDigest
    off.push(make(peaks.off))
    on.push(make(peaks.on))
  }
  const end = START + days * 2 * DAY_MS
  return { off: referenceMaxOf(off, end)!.bpm, on: referenceMaxOf(on, end)!.bpm }
}

describe('the reference maximum with the cadence-lock detector', () => {
  it('is the same with it on as off for 99% of 300 honest libraries, and within 1 bpm in the rest', () => {
    let same = 0
    for (let seed = 0; seed < 300; seed++) {
      const r = mulberry32(seed + 5)
      const athlete = { trueMax: between(r, 150, 180), cadence: between(r, 160, 190), lock: 0 }
      const { off, on } = library(athlete, seed)
      if (off === on) same++
      else expect(Math.abs(on - off)).toBeLessThanOrEqual(1)
    }
    expect(same / 300).toBeGreaterThanOrEqual(0.99)
  })

  it('reads within 5 bpm of the true maximum in 95% of libraries with locks on 5 to 15% of days, where it was often high', () => {
    let near = 0
    let nearWithout = 0
    for (let seed = 0; seed < 300; seed++) {
      const r = mulberry32(seed + 905)
      const athlete = {
        trueMax: between(r, 160, 175),
        cadence: between(r, 165, 185),
        lock: between(r, 0.05, 0.15),
      }
      const { off, on } = library(athlete, seed + 1000)
      if (Math.abs(on - athlete.trueMax) <= 5) near++
      if (Math.abs(off - athlete.trueMax) <= 5) nearWithout++
    }
    expect(near / 300).toBeGreaterThanOrEqual(0.95)
    // The sim has something to find: without the detector many of these libraries read high.
    expect(nearWithout / 300).toBeLessThan(0.8)
  })
})
