import { describe, expect, it } from 'vitest'
import { parseDigest } from '@rca/core/digest'
import { readDigest } from '@rca/core/digest/read'
import type { ActivityDigest } from '@rca/core/types'
import { ActivityDigestSchema, StoredActivityDigestSchema } from './digest.ts'
import { pick } from './test/corpus.ts'

/**
 * Every key of an ActivityDigest. A key added to the type makes this object a compile error until it
 * is listed, and the digest below is then missing it, so the test fails until the fixture has it.
 * That is the whole check that a new field is read by every reader: the readers keep a field only
 * if they list it (see DigestSlots in @rca/core), and this digest holds all of them.
 */
const KEYS: Record<keyof ActivityDigest, true> = {
  version: true,
  modelRevision: true,
  id: true,
  name: true,
  sport: true,
  startMs: true,
  durationS: true,
  distanceM: true,
  elevationGainM: true,
  hasHeartRate: true,
  indoor: true,
  powerSource: true,
  flags: true,
  flagCounts: true,
  maxHeartRate: true,
  curve: true,
  hrBlocks: true,
  calibration: true,
  climbSections: true,
  distanceBests: true,
  splits: true,
  movingS: true,
  avgHeartRate: true,
  avgPowerW: true,
  sessionKey: true,
  race: true,
  walkingPace: true,
  distributions: true,
  durability: true,
  drift: true,
  temperature: true,
  athleteType: true,
  localDayShift: true,
}

/** A run with every optional field set, to a value that is valid for it. */
function maximal(): Record<string, unknown> {
  const run = pick(
    (w) =>
      w.sport === 'run' &&
      w.hasHeartRate === true &&
      w.splits !== undefined &&
      (w.durationS as number) > 3900,
  )
  return {
    ...run,
    movingS: 3800,
    avgHeartRate: 150,
    avgPowerW: null,
    sessionKey: 'upload-1',
    race: true,
    walkingPace: true,
    durability: [{ afterS: 3600, durationS: 300, value: 3.2 }],
    drift: { firstRatio: 0.021, secondRatio: 0.02, durationS: 1800 },
    temperature: { c: 14.5, coverage: 0.9 },
    athleteType: 'hike',
    localDayShift: 1,
  }
}

describe('a digest with every field', () => {
  it('has every key of the type, so the check below covers a field added to it', () => {
    expect(Object.keys(maximal()).sort()).toEqual(Object.keys(KEYS).sort())
  })

  it('is read by every reader with every field kept', () => {
    const wire = maximal()
    const keys = Object.keys(wire).sort()
    const readers = {
      create: ActivityDigestSchema.parse(wire),
      stored: StoredActivityDigestSchema.parse(wire),
      device: parseDigest(JSON.stringify(wire)),
      reader: readDigest(wire, 'create'),
    }
    for (const [name, digest] of Object.entries(readers)) {
      expect(Object.keys(digest).sort(), name).toEqual(keys)
    }
  })

  it('has a field the readers do not know stripped, never kept or refused', () => {
    const wire = { ...maximal(), fromANewerBuild: { nested: [1] }, race: true }
    for (const digest of [
      ActivityDigestSchema.parse(wire),
      StoredActivityDigestSchema.parse(wire),
      parseDigest(JSON.stringify(wire)),
    ]) {
      expect(digest).not.toHaveProperty('fromANewerBuild')
      expect(digest.race).toBe(true)
    }
  })
})
