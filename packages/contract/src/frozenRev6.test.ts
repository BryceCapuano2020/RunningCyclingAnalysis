import { describe, expect, it } from 'vitest'
import { parseDigest, serializeDigest } from '@rca/core/digest'
import { tryReadDigest } from '@rca/core/digest/read'
import * as rev6 from '@rca/core/digest/test/frozen/rev6'
import type { ActivityDigest } from '@rca/core/types'
import { ActivityDigestSchema, StoredActivityDigestSchema } from './digest.ts'
import { corpusWires, pick } from './test/corpus.ts'
import type { DigestWire } from './test/corpus.ts'
import { Rev6CreateDigestSchema, Rev6StoredDigestSchema } from './test/frozen/rev6/digest.ts'
import { FloorStoredDigestSchema } from './test/floorDigest.ts'

/**
 * The revision-7 fields against the readers on both sides of the release that carries them. A reader
 * from before revision 7 (a copy of the code at revision 6, under test/frozen/rev6) must still list a
 * revision-7 digest; this release's readers must read everything revision 7 will write; and they must
 * read everything revision 6 wrote as the old reader did.
 */

const FIELDS = {
  temperature: { c: 14.5, coverage: 0.9 },
  athleteType: 'hike',
  localDayShift: 1,
}
const NEW_KEYS = Object.keys(FIELDS)
const LOCK = {
  kind: 'hr-cadence-lock',
  start: 100,
  end: 140,
  message: 'Heart rate matched cadence',
}

/** A digest of revision 7 as it travels, of a sport. Revision 7 is not yet written, so the number is only a label. */
function revision7(sport: 'run' | 'ride', withLock: boolean): DigestWire {
  const base = pick(
    (w) => w.sport === sport && w.hasHeartRate === true && (w.durationS as number) > 300,
  )
  const lock = withLock ? { flags: [LOCK], flagCounts: { 'hr-cadence-lock': 1 } } : {}
  return { ...base, modelRevision: 7, ...FIELDS, ...lock }
}

const WITHOUT_LOCK = (['run', 'ride'] as const).map((sport) => revision7(sport, false))
const WITH_LOCK = (['run', 'ride'] as const).map((sport) => revision7(sport, true))

function withoutNewKeys(wire: DigestWire): DigestWire {
  const rest = { ...wire }
  for (const key of NEW_KEYS) delete rest[key]
  return rest
}

/** What a reader's digest looks like on the wire, so two can be compared as JSON. */
function wireOf(digest: unknown): unknown {
  return JSON.parse(serializeDigest(digest as ActivityDigest))
}

describe('a reader from before revision 7', () => {
  it('lists a revision-7 digest, drops the fields it does not know and keeps the rest', () => {
    for (const w of WITHOUT_LOCK) {
      const expected = wireOf(rev6.readDigest(withoutNewKeys(w), 'create'))
      const readers = {
        create: Rev6CreateDigestSchema.parse(w),
        stored: Rev6StoredDigestSchema.parse(w),
        device: rev6.parseDigest(JSON.stringify(w)),
        reader: rev6.readDigest(w, 'stored'),
      }
      for (const [name, digest] of Object.entries(readers)) {
        expect(wireOf(digest), `${String(w.sport)}: ${name}`).toEqual(expected)
        for (const key of NEW_KEYS) expect(digest, name).not.toHaveProperty(key)
      }
    }
  })

  it('refuses a create of a flag of the new kind, and a stored row or device library drops it', () => {
    for (const w of WITH_LOCK) {
      const where = String(w.sport)
      expect(Rev6CreateDigestSchema.safeParse(w).success, where).toBe(false)
      const read = rev6.tryReadDigest(w, 'create')
      expect(!read.ok && read.path, where).toBe('flags[0].kind')
      const expected = wireOf(
        rev6.readDigest(
          { ...withoutNewKeys(w), flags: [], flagCounts: {}, modelRevision: 7 },
          'stored',
        ),
      )
      for (const digest of [Rev6StoredDigestSchema.parse(w), rev6.parseDigest(JSON.stringify(w))]) {
        expect(wireOf(digest), where).toEqual(expected)
        expect(digest.flags, where).toEqual([])
        expect(digest.flagCounts, where).toEqual({})
        expect(digest.id, where).toBe(w.id)
      }
    }
  })

  it('has the rollback floor refuse a lock flag, the activity with it, which is why revision 7 moves the floor', () => {
    // The floor (3e17b541) validates the kind in a stored row too, so a revision-7 digest with a lock
    // flag cannot be read by it. Revision 7 moves the floor to the release that ships these readers.
    for (const w of WITH_LOCK) {
      expect(FloorStoredDigestSchema.safeParse(w).success, String(w.sport)).toBe(false)
    }
    for (const w of WITHOUT_LOCK) {
      expect(FloorStoredDigestSchema.safeParse(w).success, String(w.sport)).toBe(true)
    }
  })
})

describe('the readers of this release', () => {
  it('read every revision-7 digest with every field kept, by every reader that takes it', () => {
    for (const w of [...WITHOUT_LOCK, ...WITH_LOCK]) {
      const locked = 'hr-cadence-lock' in (w.flagCounts as object)
      const where = `${String(w.sport)}${locked ? ' with a lock flag' : ''}`
      const readers = {
        stored: StoredActivityDigestSchema.parse(w),
        device: parseDigest(JSON.stringify(w)),
        ...(locked ? {} : { create: ActivityDigestSchema.parse(w) }),
      }
      for (const [name, digest] of Object.entries(readers)) {
        expect(wireOf(digest), `${where}: ${name}`).toEqual(JSON.parse(JSON.stringify(w)))
      }
    }
  })

  it('refuse a create of a lock flag until the release that writes revision 7', () => {
    for (const w of WITH_LOCK) {
      const read = tryReadDigest(w, 'create')
      expect(!read.ok && read.path, String(w.sport)).toBe('flags[0].kind')
      expect(ActivityDigestSchema.safeParse(w).success, String(w.sport)).toBe(false)
    }
  })

  it('read a revision-6 digest as the reader of revision 6 did, in every view', () => {
    const wires = corpusWires()
    expect(wires.length).toBeGreaterThan(60)
    for (const w of wires) {
      for (const view of ['create', 'stored', 'device'] as const) {
        const now = tryReadDigest(w, view)
        const then = rev6.tryReadDigest(w, view)
        expect(now.ok, `${String(w.id)}: ${view}`).toBe(then.ok)
        if (now.ok && then.ok) {
          expect(wireOf(now.digest), `${String(w.id)}: ${view}`).toEqual(wireOf(then.digest))
          for (const key of NEW_KEYS) expect(now.digest).not.toHaveProperty(key)
        }
      }
    }
  })
})
