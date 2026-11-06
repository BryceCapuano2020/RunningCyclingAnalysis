import { describe, expect, it, vi } from 'vitest'
import { DAY_MS } from '../constants'
import { MONDAY, withBlocks } from '../digest/test/sameHeartRateFixture'
import { mulberry32, normal } from '../math'
import type { ActivityDigest } from '../types'
import { rideSeries } from './rideUnit'

vi.setConfig({ testTimeout: 900_000 })

const NONE: ReadonlySet<string> = new Set()
const HOUR = 3600

/** The heart rates of a ride's in-band blocks, by how many it has. */
const BLOCKS: Record<number, number[]> = {
  3: [135, 145, 155],
  4: [130, 140, 150, 160],
  8: [128, 133, 138, 143, 148, 153, 158, 163],
}

/**
 * Rides with a power meter, one in four with one HR spike flag; `shift` moves the heart rate of that ride's middle block
 * (the artefact the rule cannot see beside a flag: a dry strap reads low, a settling one high). Power is the truth either way.
 */
function library(blocks: number, seed: number, shift: number): ActivityDigest[] {
  const random = mulberry32(seed * 31 + 7)
  return Array.from({ length: 120 }, (_, i) => {
    const day = Math.exp(0.02 * normal(random))
    const spiked = i % 4 === 0
    const hrs = BLOCKS[blocks]!
    const steady = hrs.map((hr, k) => ({
      heartRate: spiked && k === hrs.length >> 1 ? hr + shift : hr,
      output: 1.6 * hr * day * Math.exp(0.035 * normal(random)),
    }))
    return withBlocks('ride', `r${i}`, MONDAY + i * 3 * DAY_MS, steady, {
      powerSource: 'measured',
      durationS: 3 * HOUR,
      movingS: 3 * HOUR,
      flags: spiked ? [{ kind: 'hr-spike', start: 900, end: 911, message: 'spike' }] : [],
      flagCounts: spiked ? { 'hr-spike': 1 } : {},
    })
  })
}

/** The spiked rides' level against the clean rides', in log points. */
function contrast(digests: ActivityDigest[]): number {
  const points = rideSeries(digests, 'ride', NONE).points
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  const spiked = points.filter((p) => Number(p.id.slice(1)) % 4 === 0).map((p) => p.x)
  const clean = points.filter((p) => Number(p.id.slice(1)) % 4 !== 0).map((p) => p.x)
  return mean(spiked) - mean(clean)
}

describe('the artefact a spike rule cannot see: one block 10 bpm off on a spiked ride', () => {
  // Observed over 20 libraries: +2.0, +1.0 and +1.0 points for a low reading at 3, 4 and 8 blocks (the spec's table), -2.0, -1.0
  // and -0.6 for a high one; no library moves more than 2.0.
  it.each([3, 4, 8])(
    'moves the spiked rides by at most 2.5 points, with %s blocks in the band',
    (blocks) => {
      for (const shift of [-10, 10]) {
        let worst = 0
        let total = 0
        for (let seed = 1; seed <= 20; seed++) {
          const moved = contrast(library(blocks, seed, shift)) - contrast(library(blocks, seed, 0))
          worst = Math.max(worst, Math.abs(moved))
          total += moved
        }
        expect(Math.abs(total / 20)).toBeLessThan(0.025)
        expect(worst).toBeLessThan(0.025)
      }
    },
  )

  it('keeps the spiked rides in the series at three blocks and up', () => {
    for (const blocks of [3, 4, 8]) {
      expect(rideSeries(library(blocks, 1, 0), 'ride', NONE).points).toHaveLength(120)
    }
  })
})
