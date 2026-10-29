import { describe, expect, it } from 'vitest'
import { DISTRIBUTION_BINS } from '../constants'
import { assessQuality } from '../quality'
import { activityDistributions, binOf, distributionOf } from './distributions'
import { movingMask } from './masks'
import { syntheticActivity } from './test/syntheticActivity'

const ones = (n: number) => new Uint8Array(n).fill(1)
const total = (counts: number[]) => counts.reduce((a, b) => a + b, 0)

describe('binOf', () => {
  it('puts a value on a bin edge in the bin it opens, even where division rounds down', () => {
    // 0.3 / 0.05 is 5.999999999999999 in floating point.
    expect(binOf('speed', 0.3)).toBe(6)
    expect(binOf('speed', 0.349)).toBe(6)
    expect(binOf('power', 5)).toBe(5)
    expect(binOf('power', 4.99)).toBe(4)
    expect(binOf('power', 200)).toBe(200)
    expect(binOf('power', 200.9)).toBe(200)
    expect(binOf('heartRate', 150.9)).toBe(150)
  })

  it('refuses a negative value and one past the last bin', () => {
    expect(binOf('power', -1)).toBe(-1)
    expect(binOf('heartRate', 256)).toBe(-1)
    expect(binOf('heartRate', 255.9)).toBe(255)
    expect(binOf('speed', 13)).toBe(-1)
    expect(binOf('power', NaN)).toBe(-1)
    expect(binOf('speed', Infinity)).toBe(-1)
    expect(DISTRIBUTION_BINS.power.maxBin * DISTRIBUTION_BINS.power.width).toBe(2000)
  })
})

describe('distributionOf', () => {
  it('keeps only the bins from the first to the last used, with their seconds', () => {
    const values = Float64Array.from([150, 151, 151, 153, 153, 153])
    const d = distributionOf('heartRate', values, ones(6), ones(6))
    expect(d).toEqual({ offset: 150, counts: [1, 2, 0, 3] })
  })

  it('counts moving, valid, finite samples only', () => {
    const values = Float64Array.from([100, 100, 100, 100, NaN, 200])
    const moving = Uint8Array.from([1, 0, 1, 1, 1, 1])
    const valid = Uint8Array.from([1, 1, 0, 1, 1, 1])
    // Sample 1 is paused, 2 is invalid, 4 is not finite: samples 0, 3 and 5 count.
    expect(distributionOf('heartRate', values, moving, valid)).toEqual({
      offset: 100,
      counts: [2, ...new Array<number>(99).fill(0), 1],
    })
  })

  it('is undefined when no sample counts', () => {
    expect(distributionOf('power', new Float64Array(3).fill(100), new Uint8Array(3), ones(3))).toBe(
      undefined,
    )
  })

  it('does not count a power below zero', () => {
    const d = distributionOf('power', Float64Array.from([-5, 0, 7]), ones(3), ones(3))
    expect(d).toEqual({ offset: 0, counts: [1, 0, 0, 0, 0, 0, 0, 1] })
  })
})

describe('activityDistributions', () => {
  const n = 600
  const power = new Float64Array(n).fill(210)
  const paused = new Uint8Array(n).fill(1, 100, 200)

  function distributionsOf(spec: Parameters<typeof syntheticActivity>[0], measuredPower: boolean) {
    const activity = syntheticActivity(spec)
    return activityDistributions(
      activity,
      assessQuality(activity),
      movingMask(activity),
      measuredPower,
    )
  }

  it('keeps heart rate and power for a ride with a power meter, leaving a pause out', () => {
    const d = distributionsOf({ n, sport: 'ride', power, paused }, true)
    expect(Object.keys(d).sort()).toEqual(['heartRate', 'power'])
    expect(total(d.power!.counts)).toBe(n - 100)
    expect(d.power!.offset).toBe(210)
    expect(d.heartRate).toEqual({ offset: 150, counts: [n - 100] })
  })

  it('keeps no power for a ride whose watts are an estimate', () => {
    const d = distributionsOf({ n, sport: 'ride', power: undefined }, false)
    expect(Object.keys(d)).toEqual(['heartRate'])
  })

  it('keeps heart rate and speed for a run, and no heart rate without a stream', () => {
    const d = distributionsOf({ n, sport: 'run', paused }, false)
    expect(Object.keys(d).sort()).toEqual(['heartRate', 'speed'])
    // 4 m/s is bin 80.
    expect(d.speed).toEqual({ offset: 80, counts: [n - 100] })
    const without = distributionsOf({ n, sport: 'run', noHeartRate: true }, false)
    expect(Object.keys(without)).toEqual(['speed'])
  })
})
