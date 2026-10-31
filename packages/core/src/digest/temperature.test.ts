import { describe, expect, it } from 'vitest'
import type { Activity } from '../types'
import { digestActivityAt } from './digestActivity'
import { readDigest } from './readResult'
import { temperatureSummary, TEMPERATURE } from './temperature'
import {
  fitBytes,
  flat,
  gpxWithTemperature,
  pausedBetween,
  rampWithSpike,
  readingsInTen,
  readRun,
  runWithTemperature,
  tcxWithTemperature,
} from './test/gateTemperature'

const ones = (n: number) => new Uint8Array(n).fill(1)

/** The summary worked out the plain way: minutes of eligible seconds, their means, the median, the roundings. */
function oracle(temperature: number[], moving: number[]) {
  const eligible: number[] = []
  moving.forEach((m, i) => {
    if (m === 1 && i >= 600) eligible.push(temperature[i]!)
  })
  const valid = eligible.filter((t) => Number.isFinite(t) && t >= -30 && t <= 55)
  const means: number[] = []
  for (let from = 0; from < eligible.length; from += 60) {
    const minute = eligible
      .slice(from, from + 60)
      .filter((t) => Number.isFinite(t) && t >= -30 && t <= 55)
    if (minute.length >= 30) means.push(minute.reduce((a, b) => a + b, 0) / minute.length)
  }
  means.sort((a, b) => a - b)
  const middle = means.length / 2
  const median =
    means.length % 2 === 1
      ? means[(means.length - 1) / 2]!
      : (means[middle - 1]! + means[middle]!) / 2
  return {
    c: Math.round(median * 2) / 2,
    coverage: Math.round((valid.length / eligible.length) * 20) / 20,
  }
}

const temps = (n: number, profile: (i: number, n: number) => number) =>
  Float32Array.from({ length: n }, (_, i) => profile(i, n))

describe('temperatureSummary', () => {
  it('T1: ignores a three-minute sun spike, and rounds to half a degree', () => {
    const t = temps(2400, rampWithSpike)
    const summary = temperatureSummary(t, ones(2400))
    expect(summary).toEqual(oracle(Array.from(t), Array.from(ones(2400))))
    // The ramp alone has the same median to within a minute's worth of ramp; the spike adds 1.5 minutes of rank.
    const withoutSpike = temperatureSummary(
      temps(2400, (i, n) => 18 + (4 * i) / n),
      ones(2400),
    )
    expect(Math.abs(summary!.c - withoutSpike!.c)).toBeLessThanOrEqual(0.5)
    expect(summary!.coverage).toBe(1)
    expect(summary!.c * 2).toBe(Math.round(summary!.c * 2))
  })

  it('T2: is absent when under half of the eligible seconds have a reading', () => {
    expect(temperatureSummary(temps(2400, readingsInTen(20, 4)), ones(2400))).toBeUndefined()
  })

  it('has a summary at half the eligible seconds, with their coverage', () => {
    // 30 readings in every minute, the least a minute may have.
    const summary = temperatureSummary(temps(2400, readingsInTen(20, 5)), ones(2400))
    expect(summary).toEqual({ c: 20, coverage: 0.5 })
  })

  it('T3: is absent without a temperature', () => {
    expect(temperatureSummary(undefined, ones(2400))).toBeUndefined()
    expect(
      temperatureSummary(
        temps(2400, () => NaN),
        ones(2400),
      ),
    ).toBeUndefined()
  })

  it('T4: is absent for an 18 minute run, which has 8 eligible minutes', () => {
    expect(temperatureSummary(temps(1080, flat(20)), ones(1080))).toBeUndefined()
  })

  it('is present from 10 eligible minutes', () => {
    expect(temperatureSummary(temps(1200, flat(20)), ones(1200))).toEqual({ c: 20, coverage: 1 })
    expect(temperatureSummary(temps(1199, flat(20)), ones(1199))).toBeUndefined()
    expect(TEMPERATURE.minEligibleS).toBe(600)
  })

  it('T5: leaves out the sentinel and readings out of range', () => {
    const mixed = temps(2400, (i) => [20, 127, 60, -40, 21, 20][i % 6]!)
    // Three of six readings are valid (20, 21, 20): exactly half, so the summary stands on them alone.
    expect(temperatureSummary(mixed, ones(2400))).toEqual({ c: 20.5, coverage: 0.5 })
    const mostlyValid = temps(2400, (i) => (i % 10 === 0 ? 127 : i % 10 === 1 ? -40 : 20))
    expect(temperatureSummary(mostlyValid, ones(2400))).toEqual({ c: 20, coverage: 0.8 })
  })

  it('T6: counts moving seconds only, and starts counting after the warm-up', () => {
    const t = temps(2400, (i) => (i < 600 ? 5 : i < 1300 ? 30 : 12))
    const moving = Uint8Array.from({ length: 2400 }, (_, i) => (i >= 900 && i < 1700 ? 0 : 1))
    const summary = temperatureSummary(t, moving)
    expect(summary).toEqual(oracle(Array.from(t), Array.from(moving)))
    // The paused stretch is not eligible, so the warm 30s from second 600 to 899 are 5 of the 25 minutes.
    expect(summary!.c).toBe(12)
    expect(summary!.coverage).toBe(1)
  })

  it('takes the median of minute means, not of the readings', () => {
    // Nine minutes at 10, one at 40, then a ninth: the median is 10 whatever the one hot minute reads.
    const t = temps(600 + 11 * 60, (i) => (i >= 600 + 5 * 60 && i < 600 + 6 * 60 ? 40 : 10))
    expect(temperatureSummary(t, ones(t.length))).toEqual({ c: 10, coverage: 1 })
  })
})

describe('the digest at revision 7', () => {
  const run = runWithTemperature(2400, rampWithSpike)
  const digest = digestActivityAt(readRun(fitBytes(run), 'a.fit'), 7)

  it('T7: carries the summary, which the readers of a stored digest and of the device keep', () => {
    expect(digest.temperature).toBeDefined()
    const wire = JSON.parse(JSON.stringify(digest)) as unknown
    for (const view of ['stored', 'device'] as const) {
      expect(readDigest(wire, view).temperature, view).toEqual(digest.temperature)
    }
  })

  it('T8: is the same from a FIT, a GPX and a TCX file of the run', () => {
    const fromFit = digest.temperature
    const fromGpx = digestActivityAt(readRun(gpxWithTemperature(run), 'a.gpx'), 7).temperature
    const fromTcx = digestActivityAt(readRun(tcxWithTemperature(run), 'a.tcx'), 7).temperature
    expect(fromGpx).toEqual(fromFit)
    expect(fromTcx).toEqual(fromFit)
  })

  it('is not written below revision 7', () => {
    const activity: Activity = readRun(fitBytes(run), 'a.fit')
    expect(digestActivityAt(activity, 6)).not.toHaveProperty('temperature')
  })

  it('is absent for a run that was paused through its warm temperature', () => {
    const paused = runWithTemperature(2400, flat(20), { paused: pausedBetween(2400, 600, 2400) })
    expect(digestActivityAt(readRun(fitBytes(paused), 'a.fit'), 7).temperature).toBeUndefined()
  })
})
