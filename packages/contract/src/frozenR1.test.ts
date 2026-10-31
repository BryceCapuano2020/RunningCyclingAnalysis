import { describe, expect, it } from 'vitest'
import { serializeDigest } from '@rca/core/digest'
import * as r1 from '@rca/core/digest/test/frozen/r1'
import type { ActivityDigest } from '@rca/core/types'
import { ActivityDigestSchema, StoredActivityDigestSchema } from './digest.ts'
import { pick } from './test/corpus.ts'
import type { DigestWire } from './test/corpus.ts'
import { R1CreateDigestSchema, R1StoredDigestSchema } from './test/frozen/r1/digest.ts'

/**
 * The rollback floor W1 (the Worker of release R1) against what revision 7 writes. W1 must list every
 * revision-7 digest with every field kept, and must take revision 7 for a newer app's: the library shows
 * "need a newer app", never the landing page, and the rows are not lost. This is the claim the floor
 * moves on (docs/ARCHITECTURE.md, rollback).
 */

const FIELDS = {
  temperature: { c: 14.5, coverage: 0.9 },
  athleteType: 'hike',
  localDayShift: 1,
}
const LOCK = {
  kind: 'hr-cadence-lock',
  start: 100,
  end: 140,
  message: 'Heart rate matched cadence',
}

function revision7(sport: 'run' | 'ride', withLock: boolean): DigestWire {
  const base = pick(
    (w) => w.sport === sport && w.hasHeartRate === true && (w.durationS as number) > 300,
  )
  const lock = withLock ? { flags: [LOCK], flagCounts: { 'hr-cadence-lock': 1 } } : {}
  return { ...base, modelRevision: 7, ...FIELDS, ...lock }
}

const DIGESTS = (['run', 'ride'] as const).flatMap((sport) => [
  revision7(sport, false),
  revision7(sport, true),
])

const wireOf = (digest: unknown): unknown =>
  JSON.parse(serializeDigest(digest as ActivityDigest)) as unknown

describe('the rollback floor W1 reading what revision 7 writes', () => {
  it('lists every revision-7 digest from a stored row or the device library, with every field and the lock flag', () => {
    for (const w of DIGESTS) {
      const where = `${String(w.sport)}${'flags' in w && (w.flags as unknown[]).length > 0 ? ' with a lock flag' : ''}`
      const expected = JSON.parse(JSON.stringify(w)) as unknown
      expect(wireOf(R1StoredDigestSchema.parse(w)), where).toEqual(expected)
      expect(wireOf(r1.parseDigest(JSON.stringify(w))), where).toEqual(expected)
    }
  })

  it('keeps the revision on a stored row, which W1 (current revision 6) takes for a newer app’s', () => {
    for (const w of DIGESTS) {
      const digest = R1StoredDigestSchema.parse(w)
      expect(digest.modelRevision, String(w.sport)).toBe(7)
      expect(digest.modelRevision > 6, String(w.sport)).toBe(true)
    }
  })

  it('reads a revision-6 digest as the current readers do, a create included', () => {
    const six = { ...pick((w) => w.sport === 'run' && w.hasHeartRate === true), modelRevision: 6 }
    expect(R1CreateDigestSchema.parse(six)).toEqual(ActivityDigestSchema.parse(six))
    expect(R1StoredDigestSchema.parse(six)).toEqual(StoredActivityDigestSchema.parse(six))
  })
})
