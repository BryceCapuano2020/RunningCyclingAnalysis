import { describe, expect, it } from 'vitest'
import { fitHeartRateLine, valueAt, type HeartRateLine } from './heartRateLine'
import type { ThresholdBlock } from './types'

const POWER = 250

/** A ride of blocks spread over the band, heart rate on a line of `slope` bpm per watt plus `offset`. */
function blocksOf(
  id: string,
  slope: number,
  offset = 0,
  heartRate: (p: number, k: number) => number = (p) => 100 + slope * p + offset,
  count = 8,
): ThresholdBlock[] {
  return Array.from({ length: count }, (_, k) => {
    const value = 130 + (k * 120) / (count - 1)
    return { activityId: id, value, heartRate: heartRate(value, k) }
  })
}
const ids = ['a', 'b', 'c', 'd', 'e']
const rides = (slope: number, offsets: number[] = [0, 0, 0, 0, 0]) =>
  ids.flatMap((id, i) => blocksOf(id, slope, offsets[i]))
/** The block moved to another value, another heart rate, or both. */
const moved = (b: ThresholdBlock, value: number, heartRate = b.heartRate): ThresholdBlock => ({
  activityId: b.activityId,
  value,
  heartRate,
})
/** The fitted line, where the fit is not refused. */
function lineOf(blocks: ThresholdBlock[], power = POWER): HeartRateLine {
  const line = fitHeartRateLine(blocks, power)
  if ('refused' in line) throw new Error(`refused: ${line.refused}`)
  return line
}
/** The slope that gives a climb of `bpm` from half to full of 250. */
const slopeFor = (bpm: number) => bpm / (0.5 * POWER)

describe('the heart-rate line', () => {
  it('finds the slope within rides and the pooled offset', () => {
    const line = lineOf(rides(0.4, [0, 1, -1, 2, 0]))
    expect(line.slope).toBeCloseTo(0.4, 6)
    expect(line.offset).toBeCloseTo(100, 6)
    expect(line.excluded.size).toBe(0)
    // 160 bpm is 150 W on a line through (0, 100) at 0.4 bpm per watt.
    expect(valueAt(line, 160)).toBeCloseTo(150, 6)
  })

  it('reads a ride’s own offset for the value at a heart rate', () => {
    const line = lineOf(rides(0.4, [0, 0, 4, 0, 0]))
    expect(valueAt(line, 160, 'c')).toBeCloseTo(140, 6)
    expect(valueAt(line, 160, 'a')).toBeCloseTo(150, 6)
    expect(valueAt(line, 160, 'unseen')).toBeCloseTo(150, 6)
  })

  it('is refused when heart rate climbs under 20 bpm from half to full threshold power', () => {
    expect(fitHeartRateLine(rides(slopeFor(19)), POWER)).toEqual({ refused: 'flat' })
    expect('refused' in fitHeartRateLine(rides(slopeFor(21)), POWER)).toBe(false)
  })

  it('is refused when it climbs over 70 bpm', () => {
    expect('refused' in fitHeartRateLine(rides(slopeFor(69)), POWER)).toBe(false)
    expect(fitHeartRateLine(rides(slopeFor(71)), POWER)).toEqual({ refused: 'steep' })
  })

  it('reads the climb in bpm whatever the unit of power', () => {
    // The same rider in 1/60 of the unit: the slope is 60 times steeper and the climb the same.
    const scaled = rides(0.4).map((b) => moved(b, b.value / 60))
    const line = lineOf(scaled, POWER / 60)
    expect(line.slope).toBeCloseTo(24, 6)
    expect(
      fitHeartRateLine(
        scaled.map((b) => moved(b, b.value, 100 + (b.heartRate - 100) / 3)),
        POWER / 60,
      ),
    ).toEqual({ refused: 'flat' })
  })

  it('is refused with fewer than 20 blocks', () => {
    expect(fitHeartRateLine(rides(0.4).slice(0, 19), POWER)).toEqual({ refused: 'few-blocks' })
    expect('refused' in fitHeartRateLine(rides(0.4).slice(0, 20), POWER)).toBe(false)
  })

  it('counts only blocks between 45% and 105% of the power estimate', () => {
    const outside = ids.flatMap((id) =>
      blocksOf(id, 0.4).map((b) => moved(b, b.value < 190 ? 100 : 300)),
    )
    expect(fitHeartRateLine(outside, POWER)).toEqual({ refused: 'few-blocks' })
  })

  it('names a stuck ride and leaves it out, so it cannot flatten the slope', () => {
    const stuck = ['s1', 's2'].flatMap((id) =>
      blocksOf(id, 0, 0, (_, k) => 140 + 0.2 * Math.sin(k)),
    )
    const line = lineOf([...rides(0.4).slice(0, 24), ...stuck])
    expect([...line.excluded].sort()).toEqual(['s1', 's2'])
    expect(line.slope).toBeCloseTo(0.4, 6)
  })

  it('is refused as stuck when every ride is', () => {
    const stuck = ['s1', 's2', 's3'].flatMap((id) => blocksOf(id, 0, 0, () => 150))
    expect(stuck).toHaveLength(24)
    expect(fitHeartRateLine(stuck, POWER)).toEqual({ refused: 'stuck' })
  })

  it('does not call a ride stuck for steady power or for fewer than 4 blocks', () => {
    const steady = ids.flatMap((id) => blocksOf(id, 0.4).map((b) => moved(b, 200)))
    // Power barely moves, so heart rate not moving is no sign of a fault; there is no slope to read either.
    expect(fitHeartRateLine(steady, POWER)).toEqual({ refused: 'flat' })
    // Three blocks at one heart rate, level with the others: too few to call stuck.
    const threeBlocks = ['s1', 's2'].flatMap((id) => blocksOf(id, 0, 0, () => 176, 3))
    const line = lineOf([...rides(0.4), ...threeBlocks])
    expect(line.excluded.size).toBe(0)
    expect(line.slope).toBeCloseTo(0.4, 1)
  })

  it('names a ride offset by 20 bpm and leaves it out', () => {
    const line = lineOf(rides(0.4, [0, 0, 0, 0, 20]))
    expect([...line.excluded]).toEqual(['e'])
    expect(line.offset).toBeCloseTo(100, 6)
    expect(line.highest).toBeLessThan(100 + 0.4 * 250 + 1)
  })

  it('keeps a ride 9 bpm off the others and drops one 11 bpm off', () => {
    expect(lineOf(rides(0.4, [0, 0, 0, 0, 9])).excluded.size).toBe(0)
    expect([...lineOf(rides(0.4, [0, 0, 0, 0, -11])).excluded]).toEqual(['e'])
  })

  it('reads the spread of blocks about their rides’ lines', () => {
    const noise = [0, 2, -2]
    const noisy = ids.flatMap((id) => blocksOf(id, 0.4, 0, (p, k) => 100 + 0.4 * p + noise[k % 3]!))
    const line = lineOf(noisy)
    // The median miss is 2 bpm, and 1.4826 of that is a standard deviation.
    expect(line.spread).toBeCloseTo(1.4826 * 2, 6)
  })

  it('counts only rides with three blocks in the band toward the 20 the line needs', () => {
    const twoBlocks = ['x', 'y', 'z', 'w'].flatMap((id) => blocksOf(id, 0.4, 0, undefined, 2))
    // 19 blocks from rides with three or more, and 8 more from rides with two: 27 in all, 19 that count.
    expect(fitHeartRateLine([...rides(0.4).slice(0, 19), ...twoBlocks], POWER)).toEqual({
      refused: 'few-blocks',
    })
    expect('refused' in fitHeartRateLine([...rides(0.4).slice(0, 20), ...twoBlocks], POWER)).toBe(
      false,
    )
  })
})

describe('the heart-rate line: where a ride counts as stuck', () => {
  /**
   * Seven blocks of one ride around 200 W and 180 bpm (on the line of 0.4 bpm per watt through 100 bpm, so the ride is level
   * with the others): heart rate has a standard deviation of `sd` bpm and value of `cv` of its median, exactly.
   */
  function wobble(id: string, sd: number, cv: number): ThresholdBlock[] {
    const unit = 1 / Math.sqrt(6 / 7)
    return [0, 1, -1, 1, -1, 1, -1].map((x) => ({
      activityId: id,
      value: 200 * (1 + cv * unit * x),
      heartRate: 180 + sd * unit * x,
    }))
  }
  const stuckIn = (sd: number, cv: number) =>
    lineOf([...rides(0.4), ...wobble('s', sd, cv)]).excluded.has('s')

  it('leaves out a ride whose heart rate moves under 1.5 bpm while its power moves over 3%', () => {
    expect(stuckIn(1.49, 0.04)).toBe(true)
    expect(stuckIn(1.51, 0.04)).toBe(false)
  })

  it('reads the 3% as the standard deviation of power over its median', () => {
    expect(stuckIn(1, 0.031)).toBe(true)
    expect(stuckIn(1, 0.029)).toBe(false)
  })

  it('judges a ride from its fourth block and not its third', () => {
    const flat = (id: string, count: number) => blocksOf(id, 0, 0, () => 176, count)
    expect(lineOf([...rides(0.4), ...flat('s', 4)]).excluded.has('s')).toBe(true)
    expect(lineOf([...rides(0.4), ...flat('s', 3)]).excluded.has('s')).toBe(false)
  })
})
