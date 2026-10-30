import { digestActivity, serializeDigest } from '@rca/core/digest'
import { sampleDataset, sampleSeason } from '@rca/core/synthetic'
import { oddLibraries } from '@rca/core/synthetic/odd'
import type { Activity } from '@rca/core/types'

/** A digest as it travels: JSON with null for NaN, read back. */
export type DigestWire = Record<string, unknown>

/** A run whose last distance sample is missing, so its digest has bests and no distance. */
function gappyRun(): Activity {
  const n = 300
  const distance = new Float64Array(n)
  for (let i = 1; i < n; i++) distance[i] = distance[i - 1]! + 4
  distance[n - 1] = Number.NaN
  return {
    id: 'gappy',
    name: 'Gappy',
    sport: 'run',
    startMs: Date.UTC(2025, 5, 2, 7),
    n,
    speed: new Float64Array(n).fill(4),
    distance,
    altitude: new Float64Array(n).fill(100),
    heartRate: new Float64Array(n).fill(150),
    power: new Float64Array(n).fill(Number.NaN),
    paused: new Uint8Array(n),
    hasPower: false,
    hasHeartRate: true,
    hasAltitude: true,
    indoor: false,
  }
}

let cached: DigestWire[] | undefined

/**
 * The digests of the synthetic corpus: the sample dataset, every odd library, every fifth activity
 * of the sample season, and a run with a missing distance. The same on every run.
 */
export function corpusWires(): DigestWire[] {
  if (cached !== undefined) return cached
  const activities = [
    ...sampleDataset().activities,
    ...Object.values(oddLibraries()).flat(),
    ...sampleSeason().activities.filter((_, i) => i % 5 === 0),
    gappyRun(),
  ]
  cached = activities.map(
    (activity) => JSON.parse(serializeDigest(digestActivity(activity))) as DigestWire,
  )
  return cached
}

/** The first digest of the corpus that satisfies `wants`, or fails the test setup. */
export function pick(wants: (wire: DigestWire) => boolean): DigestWire {
  const found = corpusWires().find(wants)
  if (found === undefined) throw new Error('the corpus has no digest of this kind')
  return found
}
