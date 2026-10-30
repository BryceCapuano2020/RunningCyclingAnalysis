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

/** The activities of the corpus in order, each drawn only when it is asked for. */
function* corpusActivities(): Generator<Activity> {
  yield* sampleDataset().activities
  yield* Object.values(oddLibraries()).flat()
  yield* sampleSeason().activities.filter((_, i) => i % 5 === 0)
  yield gappyRun()
}

const drawn: DigestWire[] = []
const source = corpusActivities()
let finished = false

/** Digests of the corpus drawn so far, then further ones, in order. A test that needs one kind stops early. */
function* corpusStream(): Generator<DigestWire> {
  for (let i = 0; ; i++) {
    if (i === drawn.length) {
      const next = finished ? { done: true as const } : source.next()
      if (next.done === true) {
        finished = true
        return
      }
      drawn.push(JSON.parse(serializeDigest(digestActivity(next.value))) as DigestWire)
    }
    yield drawn[i]!
  }
}

/**
 * The digests of the synthetic corpus: the sample dataset, every odd library, every fifth activity
 * of the sample season, and a run with a missing distance. The same on every run.
 */
export function corpusWires(): DigestWire[] {
  for (const _wire of corpusStream()) {
    // Drawing every one fills `drawn`.
  }
  return drawn
}

/**
 * The first digest of the corpus that satisfies `wants`, or fails the test setup. Only as much of the
 * corpus is made as it takes to find one.
 */
export function pick(wants: (wire: DigestWire) => boolean): DigestWire {
  for (const wire of corpusStream()) if (wants(wire)) return wire
  throw new Error('the corpus has no digest of this kind')
}
