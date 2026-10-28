import { describe, expect, it } from 'vitest'
import { digestActivity } from '../digest/digestActivity'
import { sampleDataset } from '../synthetic'
import type { ActivityDigest, DigestHrBlock } from '../types'
import { lowForPowerSetAside } from './lowForPower'

const sample = sampleDataset().activities.map((a) => digestActivity(a))
const ride = sample.find((d) => d.sport === 'ride' && d.powerSource === 'measured')!
const run = sample.find((d) => d.sport === 'run' && !d.indoor)!

/** Blocks of 5 min at `watts` whose heart rate follows the athlete's line 60 + 0.35 W, times `share`. */
function blocks(watts: number, share = 1, count = 6): DigestHrBlock[] {
  return Array.from({ length: count }, (_, i) => ({
    heartRate: (60 + 0.35 * (watts + (i % 3) * 5)) * share,
    value: watts + (i % 3) * 5,
    terms: null,
  }))
}

function made(
  source: ActivityDigest,
  id: string,
  watts: number,
  share = 1,
  movingS = 5400,
): ActivityDigest {
  return Object.assign({}, source, { id, movingS, hrBlocks: blocks(watts, share) })
}

/** A library of rides at 130 to 290 W, all on the athlete's line. */
function library(count = 20): ActivityDigest[] {
  return Array.from({ length: count }, (_, i) => made(ride, `ride-${i}`, 130 + i * 8))
}

describe('heart rate that reads low for the power across a whole activity', () => {
  it('sets aside an endurance ride whose strap locked onto cadence for most of it', () => {
    const locked = made(ride, 'locked', 210, 0.6)
    expect([...lowForPowerSetAside([...library(), locked])]).toEqual(['locked'])
  })

  it('keeps a genuinely fit easy ride, whose heart rate is low but not far under the athlete’s', () => {
    const fit = made(ride, 'fit', 190, 0.85)
    expect(lowForPowerSetAside([...library(), fit]).size).toBe(0)
  })

  it('keeps the athlete’s own rides, and sets nothing aside in a library of sound heart rate', () => {
    expect(lowForPowerSetAside(library()).size).toBe(0)
  })

  it('gives no verdict when the library is too short to fit a line', () => {
    const locked = made(ride, 'locked', 210, 0.6)
    expect(lowForPowerSetAside([...library(8), locked]).size).toBe(0)
  })

  it('judges only activities of at least 20 min, with measured effort figures and heart rate', () => {
    const brief = made(ride, 'brief', 210, 0.6, 1100)
    const estimated = Object.assign({}, made(ride, 'estimated', 210, 0.6), {
      powerSource: 'virtual' as const,
    })
    const noHeartRate = Object.assign({}, made(ride, 'none', 210, 0.6), { hasHeartRate: false })
    const fewBlocks = Object.assign({}, made(ride, 'few', 210, 0.6), {
      hrBlocks: blocks(210, 0.6, 2),
    })
    expect(lowForPowerSetAside([...library(), brief, estimated, noHeartRate, fewBlocks]).size).toBe(
      0,
    )
  })

  it('is judged for each sport against its own line, in its own unit', () => {
    // Runs are in W/kg, 8 to 16, with heart rate 90 + 7 per W/kg: the ride line would call every one of them wild.
    const runAt = (id: string, wkg: number, share = 1) =>
      Object.assign({}, run, {
        id,
        movingS: 3600,
        hrBlocks: Array.from({ length: 6 }, (_, i) => ({
          heartRate: (90 + 7 * (wkg + (i % 3) * 0.2)) * share,
          value: wkg + (i % 3) * 0.2,
          terms: null,
        })),
      })
    const runs = Array.from({ length: 16 }, (_, i) => runAt(`run-${i}`, 8 + i * 0.5))
    const out = lowForPowerSetAside([...library(), ...runs, runAt('locked-run', 12, 0.6)])
    expect([...out]).toEqual(['locked-run'])
  })

  it('does not let the faulty ride pull the line down, so a second one is still caught', () => {
    const faults = [made(ride, 'a', 200, 0.6), made(ride, 'b', 250, 0.6)]
    expect([...lowForPowerSetAside([...library(), ...faults])].sort()).toEqual(['a', 'b'])
  })
})
