import { describe, expect, it } from 'vitest'
import { heartRateEstimate } from './heartRateEstimate'
import { fitHeartRateLine } from './heartRateLine'
import type { ThresholdBlock, ThresholdEffort } from './types'

/*
 * One rider whose heart rate is 0.4 bpm per watt from the origin, with a threshold heart rate of 100 bpm at 250 W, so a
 * heart rate of 85 bpm is exactly 85% of threshold heart rate. The tests put a single effort at the edge of each guard and
 * check that it is used just inside and left out just outside.
 */
const POWER = 250
const THRESHOLD_HR = 100

/** Nine blocks of a ride from 130 to 250 W, `noise` bpm either side of the line (and one on it, so the ride's offset is 0). */
function blocksOf(id: string, noise = 0): ThresholdBlock[] {
  return Array.from({ length: 9 }, (_, k) => {
    const value = 130 + 15 * k
    const off = k === 8 ? 0 : k % 2 === 0 ? noise : -noise
    return { activityId: id, value, heartRate: 0.4 * value + off }
  })
}
const blocks = (noise = 0) => ['a', 'b', 'c', 'd', 'e'].flatMap((id) => blocksOf(id, noise))

const effort = (value: number, heartRate: number): ThresholdEffort => ({
  activityId: 'a',
  durationS: 900,
  value,
  heartRate,
  ageDays: 0,
  estimated: false,
})
const estimate = (efforts: ThresholdEffort[], noise = 0) =>
  heartRateEstimate(efforts, blocks(noise), THRESHOLD_HR, POWER)

describe('the heart-rate estimate: the band of threshold heart rate', () => {
  it('uses an effort at 85% of threshold heart rate and leaves one just under', () => {
    expect(estimate([effort(212.5, 85)])).toMatchObject({ efforts: 1 })
    expect(estimate([effort(212.25, 84.9)])).toEqual({ refused: 'no-efforts' })
  })

  it('uses an effort at 102% of threshold heart rate and leaves one just over', () => {
    expect(estimate([effort(255, 102)])).toMatchObject({ efforts: 1 })
    expect(estimate([effort(255.25, 102.1)])).toEqual({ refused: 'no-efforts' })
  })
})

describe('the heart-rate estimate: distance from the ride’s own line', () => {
  const noise = 4
  /**
   * An effort `off` bpm above its ride's own line (below, if negative), where the line says `on` bpm, on blocks that scatter
   * about 4 bpm each side of it: a spread of about 6 bpm, so four spreads would allow 24 bpm and only the cap is in the way.
   */
  function offLine(off: number, on: number) {
    const line = fitHeartRateLine(blocks(noise), POWER)
    if ('refused' in line) throw new Error(`refused: ${line.refused}`)
    expect(line.spread).toBeGreaterThan(5)
    const value = (on - line.offsets.get('a')!) / line.slope
    return effort(value, on + off)
  }
  const used = (e: ThresholdEffort) => estimate([e], noise)

  it('uses an effort 11.9 bpm off its ride’s line, above or below', () => {
    expect(used(offLine(11.9, 86))).toMatchObject({ efforts: 1 })
    expect(used(offLine(-11.9, 98))).toMatchObject({ efforts: 1 })
  })

  it('leaves out an effort 12.1 bpm off, however loose the line', () => {
    expect(used(offLine(12.1, 86))).toEqual({ refused: 'no-efforts' })
    expect(used(offLine(-12.1, 98))).toEqual({ refused: 'no-efforts' })
  })
})
