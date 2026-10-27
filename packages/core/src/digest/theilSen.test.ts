import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../math'
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
})
