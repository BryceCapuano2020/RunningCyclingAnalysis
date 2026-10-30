import { describe, expect, it } from 'vitest'
import { parseDigest, serializeDigest } from '@rca/core/digest'
import type { ActivityDigest } from '@rca/core/types'
import { tryReadDigest } from '@rca/core/digest/read'
import { mutantsOf } from '@rca/core/digest/test/mutants'
import type { Mutant } from '@rca/core/digest/test/mutants'
import { ActivityDigestSchema, StoredActivityDigestSchema } from './digest.ts'
import { corpusWires, pick } from './test/corpus.ts'
import type { DigestWire } from './test/corpus.ts'
import { FloorCreateDigestSchema, FloorStoredDigestSchema } from './test/floorDigest.ts'

/** What a reader says of a value: the digest, or the first thing wrong. */
type Verdict = { ok: true; digest: unknown } | { ok: false; path: string; problem: string }

function ofZod(
  schema: { safeParse(value: unknown): { success: boolean; data?: unknown; error?: unknown } },
  wire: unknown,
): Verdict {
  const result = schema.safeParse(wire)
  if (result.success) return { ok: true, digest: result.data }
  const issues = (
    result.error as { issues: Array<{ path: Array<string | number>; message: string }> }
  ).issues
  return { ok: false, path: issues[0]!.path.join('.'), problem: issues[0]!.message }
}

function ofCore(view: 'create' | 'stored', wire: unknown): Verdict {
  const read = tryReadDigest(wire, view)
  return read.ok
    ? { ok: true, digest: read.digest }
    : { ok: false, path: read.path.replace(/\[(\d+)\]/g, '.$1'), problem: read.problem }
}

function ofDevice(json: string): Verdict {
  try {
    return { ok: true, digest: parseDigest(json) }
  } catch (error) {
    const [, path = '', problem = ''] =
      /^parseDigest: (\S+) (.*)$/.exec((error as Error).message) ?? []
    return { ok: false, path: path.replace(/\[(\d+)\]/g, '.$1'), problem }
  }
}

/** The digest kinds the mutants are made from: each holds fields the others lack. */
function bases(): Array<[string, DigestWire]> {
  const run = pick((w) => w.sport === 'run' && w.hasHeartRate === true && w.splits !== undefined)
  const outdoor = pick(
    (w) => w.sport === 'ride' && w.powerSource === 'measured' && w.calibration !== null,
  )
  return [
    ['a run with heart rate, splits and bests', run],
    ['a measured outdoor ride', outdoor],
    ['a virtual ride', pick((w) => w.sport === 'ride' && w.powerSource === 'virtual')],
    ['a ride without heart rate', pick((w) => w.sport === 'ride' && w.hasHeartRate === false)],
    [
      'an indoor ride with a power meter',
      pick((w) => w.indoor === true && w.powerSource === 'measured'),
    ],
    ['a race at walking pace', { ...run, race: true, walkingPace: true }],
  ]
}

const NO_DISTANCE = 'the run does not cover this distance'

/**
 * The fields that name an activity: a stored row that breaks a bound on one is refused, because there
 * is no unknown value to read it as. A bound on any other number is read as that field being unknown.
 */
const IDENTITY_PATHS = new Set([
  'startMs',
  'durationS',
  'id',
  'name',
  'sport',
  'version',
  'powerSource',
  'modelRevision',
])

/** The digest a create makes of a wire, which the others are compared with. */
function createOf(wire: unknown): Verdict {
  return ofCore('create', wire)
}

/** A reader's output read back as a create does: what a repair makes must be a digest. */
function readsBackAsCreate(digest: unknown): boolean {
  const back = JSON.parse(serializeDigest(digest as ActivityDigest)) as unknown
  const read = tryReadDigest(back, 'create')
  // The one thing a create refuses of a digest the device holds: bests on a run with no distance.
  return read.ok || read.problem === NO_DISTANCE
}

describe('every reader of a digest gives the same verdict', () => {
  const all = bases().flatMap(([label, base]) =>
    mutantsOf(base).map((mutant): [string, Mutant] => [label, mutant]),
  )

  it('is run over many mutants', () => {
    expect(all.length).toBeGreaterThan(5000)
  })

  it.each([
    ['create', ActivityDigestSchema],
    ['stored', StoredActivityDigestSchema],
  ] as const)(
    'has the %s zod schema carry the core reader, to the value and the first path',
    (view, schema) => {
      for (const [label, mutant] of all) {
        expect(ofZod(schema, mutant.wire), `${label}: ${mutant.name}`).toEqual(
          ofCore(view, mutant.wire),
        )
      }
    },
  )

  it('has a create take nothing the device library and a stored row refuse, and read it the same', () => {
    for (const [label, mutant] of all) {
      const create = createOf(mutant.wire)
      if (!create.ok) continue
      const where = `${label}: ${mutant.name}`
      expect(ofCore('stored', mutant.wire), where).toEqual(create)
      expect(ofDevice(mutant.json), where).toEqual(create)
    }
  })

  it('has the device library repair only a number out of bounds or a name nobody knows, and never damage', () => {
    let repaired = 0
    for (const [label, mutant] of all) {
      const create = createOf(mutant.wire)
      const device = ofDevice(mutant.json)
      if (create.ok || !device.ok) continue
      repaired++
      const where = `${label}: ${mutant.name}`
      if (mutant.tags.includes('forward')) {
        // The name nobody knows is taken out and the rest is read as it was.
        expect(device, where).toEqual(createOf(mutant.repaired))
      } else if (mutant.tags.includes('bests-without-distance')) {
        expect(create.problem, where).toBe(NO_DISTANCE)
      } else {
        // A number out of bounds: the create said so, and what the device made of it is a digest.
        const read = tryReadDigest(mutant.wire, 'create')
        expect(!read.ok && read.kind, where).toBe('range')
        expect(readsBackAsCreate(device.digest), where).toBe(true)
      }
    }
    expect(repaired).toBeGreaterThan(300)
  })

  it('has a stored row drop a name nobody knows and read the rest as it was', () => {
    for (const [label, mutant] of all) {
      if (!mutant.tags.includes('forward')) continue
      expect(ofCore('stored', mutant.wire), `${label}: ${mutant.name}`).toEqual(
        ofCore('stored', mutant.repaired),
      )
    }
  })

  it('has a stored row the floor reads be read, but for the fields that name the activity', () => {
    let refused = 0
    for (const [label, mutant] of all) {
      if (!ofZod(FloorStoredDigestSchema, mutant.wire).ok) continue
      const stored = ofCore('stored', mutant.wire)
      if (stored.ok) continue
      refused++
      expect(
        IDENTITY_PATHS.has(stored.path.split('.')[0]!),
        `${label}: ${mutant.name}: ${stored.path}`,
      ).toBe(true)
    }
    // The bounds on the identity fields are the only thing that takes a row from a library.
    expect(refused).toBeGreaterThan(0)
  })

  it('has a create refuse what a rollback floor could not read back', () => {
    const unsafe: string[] = []
    for (const [label, mutant] of all) {
      if (!createOf(mutant.wire).ok) continue
      const floor = [FloorCreateDigestSchema, FloorStoredDigestSchema].map((schema) =>
        ofZod(schema, mutant.wire),
      )
      if (!floor.every((verdict) => verdict.ok)) unsafe.push(`${label}: ${mutant.name}`)
    }
    expect(unsafe).toEqual([])
  })
})

describe('digests in existing libraries read as they did', () => {
  const REVISIONS: Array<number | undefined> = [undefined, 1, 2, 6]

  it('has the corpus include runs and rides, with and without heart rate and power', () => {
    const wires = corpusWires()
    expect(wires.length).toBeGreaterThan(60)
    for (const sport of ['run', 'ride']) expect(wires.some((w) => w.sport === sport)).toBe(true)
    expect(wires.some((w) => w.hasHeartRate === false)).toBe(true)
    expect(wires.some((w) => w.powerSource === 'measured')).toBe(true)
    expect(wires.some((w) => w.powerSource === 'virtual')).toBe(true)
    expect(wires.some((w) => w.distanceM === null)).toBe(true)
  })

  it('is read by every reader as the floor reads it, with nothing stripped or changed', () => {
    for (const wire of corpusWires()) {
      for (const revision of REVISIONS) {
        const { modelRevision: _drop, ...rest } = wire
        const input = revision === undefined ? rest : { ...rest, modelRevision: revision }
        const where = `${String(wire.id)} at revision ${String(revision)}`
        const floor = ofZod(FloorStoredDigestSchema, input)
        if (floor.ok) {
          // What an existing library holds: every reader reads it as the floor does.
          expect(ofZod(StoredActivityDigestSchema, input), where).toEqual(floor)
          expect(ofDevice(JSON.stringify(input)), where).toEqual(floor)
          expect(ofZod(ActivityDigestSchema, input), where).toEqual(
            ofZod(FloorCreateDigestSchema, input),
          )
        } else {
          // The one digest the floor cannot read is a run with bests and no distance. Its create is
          // refused by both, so it was never stored; the device and a stored row read it now.
          expect(wire.distanceM, where).toBeNull()
          expect(ofZod(ActivityDigestSchema, input).ok, where).toBe(false)
        }
        expect(ofDevice(JSON.stringify(input)).ok, where).toBe(true)
        expect(ofZod(StoredActivityDigestSchema, input).ok, where).toBe(true)
      }
    }
  })
})
