import { describe, expect, it } from 'vitest'
import { mulberry32, normal } from '../math'
import { outputAtHeartRate } from './theilSen'
import type { FitBlocks } from './theilSen'

/** Blocks on the line output = 2 * heartRate + 3, two to an activity. */
function line(n: number): FitBlocks {
  const heartRate = Float64Array.from({ length: n }, (_, i) => 120 + i * 2.5)
  return {
    heartRate,
    output: heartRate.map((hr) => 2 * hr + 3),
    owner: Uint16Array.from({ length: n }, (_, i) => Math.floor(i / 2)),
    activities: Math.ceil(n / 2),
  }
}

describe('Theil-Sen output at a heart rate', () => {
  it('recovers a line exactly, with no spread around it', () => {
    const fit = outputAtHeartRate(line(12), 140, mulberry32(1))!
    expect(fit.output).toBeCloseTo(283, 9)
    expect(fit.low).toBeCloseTo(283, 9)
    expect(fit.high).toBeCloseTo(283, 9)
  })

  it('is not pulled by a few wild blocks the way least squares is', () => {
    const blocks = line(20)
    blocks.output[3] = 900
    blocks.output[11] = -400
    const fit = outputAtHeartRate(blocks, 140, mulberry32(1))!
    expect(fit.output).toBeCloseTo(283, 0)
  })

  it('widens its interval when the blocks scatter', () => {
    const random = mulberry32(9)
    const blocks = line(24)
    for (let i = 0; i < blocks.output.length; i++) blocks.output[i]! += (random() - 0.5) * 30
    const fit = outputAtHeartRate(blocks, 140, mulberry32(1))!
    expect(fit.high - fit.low).toBeGreaterThan(2)
    expect(fit.low).toBeLessThan(fit.output)
    expect(fit.high).toBeGreaterThan(fit.output)
  })

  it('has no fit when every block has the same heart rate', () => {
    const blocks = line(10)
    blocks.heartRate.fill(140)
    expect(outputAtHeartRate(blocks, 140, mulberry32(1))).toBeNull()
  })

  it('takes the mean of the two middle values when there are an even number, not the lower one', () => {
    // Six pairs, slopes 1, 1, 1, 10/3, 4.5 and 8: the median is (1 + 10/3) / 2, not 1. At a heart rate of
    // 1.5 the four blocks then say 3.25, 2.083, 0.917 and 6.75, whose median is (2.083 + 3.25) / 2.
    const blocks: FitBlocks = {
      heartRate: Float64Array.from([0, 1, 2, 3]),
      output: Float64Array.from([0, 1, 2, 10]),
      owner: Uint16Array.from([0, 1, 2, 3]),
      activities: 4,
    }
    const fit = outputAtHeartRate(blocks, 1.5, mulberry32(1))!
    expect(fit.output).toBeCloseTo(2.6667, 3)
  })

  it('has the output inside its interval, which is centred on it', () => {
    const random = mulberry32(3)
    const blocks = line(24)
    for (let i = 0; i < blocks.output.length; i++) blocks.output[i]! += (random() - 0.5) * 20
    const fit = outputAtHeartRate(blocks, 140, mulberry32(1))!
    expect(fit.output - fit.low).toBeCloseTo(fit.high - fit.output, 9)
    expect(fit.output - fit.low).toBeGreaterThan(0)
  })

  it('covers the true output about 90% of the time, even from six activities', () => {
    // Six activities of four blocks, each activity a little better or worse than the line, and each
    // block scattered about its activity: the case a percentile bootstrap covered about 75% of.
    let covered = 0
    const reps = 200
    for (let rep = 0; rep < reps; rep++) {
      const random = mulberry32(900 + rep)
      const heartRate = Float64Array.from({ length: 24 }, (_, i) => 125 + (i % 4) * 14 + (i % 3))
      const effect = Array.from({ length: 6 }, () => 1 + 0.02 * normal(random))
      const blocks: FitBlocks = {
        heartRate,
        output: heartRate.map(
          (hr, i) => (2 * hr + 3) * effect[Math.floor(i / 4)]! * (1 + 0.02 * normal(random)),
        ),
        owner: Uint16Array.from({ length: 24 }, (_, i) => Math.floor(i / 4)),
        activities: 6,
      }
      const fit = outputAtHeartRate(blocks, 145, mulberry32(rep))!
      if (fit.low <= 293 && 293 <= fit.high) covered++
    }
    expect(covered / reps).toBeGreaterThan(0.84)
    expect(covered / reps).toBeLessThan(0.97)
  })

  it('has no fit from fewer than two activities', () => {
    const blocks = line(8)
    blocks.owner.fill(0)
    blocks.activities = 1
    expect(outputAtHeartRate(blocks, 140, mulberry32(1))).toBeNull()
  })
})
