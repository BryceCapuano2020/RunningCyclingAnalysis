import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../constants'
import { MONDAY, withBlocks } from '../digest/test/sameHeartRateFixture'
import type { Steady } from '../digest/test/sameHeartRateFixture'
import type { ActivityDigest, QualityFlag, QualityKind } from '../types'
import { rideSeries } from './rideUnit'

const NONE: ReadonlySet<string> = new Set()
const HOUR = 3600

const flag = (kind: QualityKind, start: number, end: number): QualityFlag => ({
  kind,
  start,
  end,
  message: kind,
})

/** Blocks at the given heart rates, 1.6 W per bpm. */
const blocksAt = (hrs: number[], scale = 1): Steady[] =>
  hrs.map((heartRate) => ({ heartRate, output: 1.6 * heartRate * scale }))

interface Spec {
  seconds?: number
  flags?: QualityFlag[]
  hrs?: number[]
  scale?: number
}

function ride(id: string, day: number, spec: Spec = {}): ActivityDigest {
  const flags = spec.flags ?? []
  const counts: Partial<Record<QualityKind, number>> = {}
  for (const f of flags) counts[f.kind] = (counts[f.kind] ?? 0) + 1
  const seconds = spec.seconds ?? 90 * 60
  return withBlocks(
    'ride',
    id,
    MONDAY + day * DAY_MS,
    blocksAt(spec.hrs ?? [135, 140, 145, 150, 155], spec.scale),
    { durationS: seconds, movingS: seconds, flags, flagCounts: counts, powerSource: 'measured' },
  )
}

/** Six clean rides to fix the reference heart rate, and the ride under test. */
const read = (test: ActivityDigest) => {
  const clean = Array.from({ length: 6 }, (_, i) => ride(`clean-${i}`, i))
  return rideSeries([...clean, test], 'ride', NONE).points.find((p) => p.id === test.id)
}

const spike = (start = 600, length = 11) => flag('hr-spike', start, start + length)

describe('a ride with an isolated HR spike', () => {
  it('stays: one flag in 90 minutes, three blocks in the band', () => {
    expect(read(ride('r', 7, { flags: [spike()] }))).toBeDefined()
  })

  it('is valued as the median of its blocks, as a clean ride is', () => {
    const spiked = read(ride('s', 7, { flags: [spike()], scale: 1.1 }))!
    const clean = read(ride('c', 7, { scale: 1.1 }))!
    expect(spiked.x).toBeCloseTo(clean.x, 12)
  })

  it('allows one flag per started hour: two in a 2-hour ride, not two in one hour', () => {
    const two = [spike(600), spike(4000)]
    expect(read(ride('a', 7, { flags: two, seconds: 2 * HOUR }))).toBeDefined()
    expect(read(ride('b', 7, { flags: two, seconds: HOUR }))).toBeUndefined()
  })

  it('goes when its flags cover more than 2% of its moving time', () => {
    expect(read(ride('long', 7, { flags: [spike(600, 400)] }))).toBeUndefined()
    expect(read(ride('edge', 7, { flags: [spike(600, 100)] }))).toBeDefined()
  })

  it('goes with fewer than three blocks in the band, which a clean ride keeps at two', () => {
    expect(read(ride('two', 7, { hrs: [145, 150] }))).toBeDefined()
    expect(read(ride('two-spiked', 7, { hrs: [145, 150], flags: [spike()] }))).toBeUndefined()
    expect(read(ride('three', 7, { hrs: [145, 150, 140], flags: [spike()] }))).toBeDefined()
  })

  it('goes when the digest keeps fewer flags than it counts', () => {
    const over = ride('over', 7, { flags: [spike()] })
    over.flagCounts['hr-spike'] = 3
    expect(read({ ...over, durationS: 5 * HOUR, movingS: 5 * HOUR })).toBeUndefined()
  })

  it('still goes with a cadence lock or a dropout', () => {
    expect(
      read(ride('lock', 7, { flags: [spike(), flag('hr-cadence-lock', 100, 200)] })),
    ).toBeUndefined()
    expect(
      read(ride('drop', 7, { flags: [spike(), flag('hr-dropout', 100, 130)] })),
    ).toBeUndefined()
    expect(
      read(ride('lock-only', 7, { flags: [flag('hr-cadence-lock', 100, 200)] })),
    ).toBeUndefined()
  })
})
