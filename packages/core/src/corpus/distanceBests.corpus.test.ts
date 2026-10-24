import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { digestActivity } from '../digest/digestActivity'
import { parseActivityFile } from '../import'
import { corpusReader } from './helpers'

/*
 * Every run in the real corpus, parsed by the importers and digested. A best time over a longer
 * distance is made of shorter ones, so its pace per kilometre can never beat the shorter best.
 */

const DIRS = ['fitparse', 'gpxpy', 'tcxparser'] as const

/**
 * The second "run" of the multisport file is a 2.2 km walk at 0.98 m/s, so its best kilometre is
 * 22:21 per kilometre. That is what the device recorded, not a plausible running pace, so the pace
 * check leaves it out. The other runs of that file are ordinary runs and stay in.
 */
const WALK_SEGMENT_ID = 'activity-large-fenxi2-multisport.fit#2'

function runDigests() {
  return DIRS.flatMap((dir) => {
    const url = new URL(`../../test-corpus/${dir}/`, import.meta.url)
    const { bytes } = corpusReader(url)
    return readdirSync(url)
      .filter((name) => /\.(fit|gpx|tcx)$/i.test(name))
      .sort()
      .flatMap((name) => {
        const parsed = parseActivityFile(bytes(name), name)
        if (!parsed.ok) return []
        return parsed.activities
          .filter((activity) => activity.sport === 'run')
          .map((activity) => digestActivity(activity))
      })
  })
}

describe('distance bests on the real corpus', () => {
  const digests = runDigests()

  it('finds record distances in corpus runs', () => {
    const covered = digests.filter((d) => d.distanceBests?.some((b) => b.distanceM === 5000))
    expect(covered.length).toBeGreaterThan(0)
  })

  it('gives every corpus run a plausible pace at each record distance', () => {
    // Between 2:30 and 15:00 per kilometre, for every run except the walk named above.
    const runs = digests.filter((digest) => !digest.id.endsWith(WALK_SEGMENT_ID))
    expect(runs.length).toBeGreaterThan(0)
    for (const digest of runs) {
      for (const best of digest.distanceBests ?? []) {
        const secondsPerKm = best.seconds / (best.distanceM / 1000)
        expect(secondsPerKm, `${digest.id} at ${best.distanceM} m`).toBeGreaterThanOrEqual(150)
        expect(secondsPerKm, `${digest.id} at ${best.distanceM} m`).toBeLessThanOrEqual(900)
      }
    }
  })

  it('never gives a longer record a faster pace per kilometre than a shorter one', () => {
    for (const digest of digests) {
      const bests = digest.distanceBests ?? []
      const perKm = (distanceM: number) => {
        const best = bests.find((b) => b.distanceM === distanceM)
        return best === undefined ? null : best.seconds / (distanceM / 1000)
      }
      const oneKm = perKm(1000)
      const fiveKm = perKm(5000)
      const tenKm = perKm(10000)
      for (const b of bests) expect(b.seconds).toBeLessThanOrEqual(digest.durationS + 1e-9)
      if (oneKm !== null && fiveKm !== null) expect(oneKm).toBeLessThanOrEqual(fiveKm + 1e-6)
      if (fiveKm !== null && tenKm !== null) expect(fiveKm).toBeLessThanOrEqual(tenKm + 1e-6)
    }
  })
})
