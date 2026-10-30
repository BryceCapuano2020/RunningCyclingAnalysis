import { digestActivity, serializeDigest } from '@rca/core/digest'
import { sampleDataset } from '@rca/core/synthetic'
import { describe, expect, it } from 'vitest'
import { ActivityDigestSchema, StoredActivityDigestSchema } from './index.ts'

type Wire = Record<string, unknown>

const wires = sampleDataset().activities.map(
  (activity) => JSON.parse(serializeDigest(digestActivity(activity))) as Wire,
)
const ride = wires.find((w) => w.sport === 'ride' && w.powerSource === 'measured')!
const sampleRun = wires.find((w) => w.sport === 'run' && w.hasHeartRate === true)!
/** The same run made long enough to have durability points and drift. */
const run: Wire = { ...sampleRun, durationS: 20_000 }
const SCHEMAS = [
  ['create', ActivityDigestSchema],
  ['stored', StoredActivityDigestSchema],
] as const

describe('digest evidence', () => {
  it.each(SCHEMAS)(
    '%s schema accepts the distributions, durability and drift of real digests',
    (_l, schema) => {
      for (const wire of wires) {
        const parsed = schema.parse(wire)
        expect(parsed.distributions).toEqual(wire.distributions)
        expect(parsed.durability).toEqual(wire.durability)
        expect(parsed.drift).toEqual(wire.drift)
      }
    },
  )

  it.each(SCHEMAS)('%s schema accepts a digest from before the fields', (_l, schema) => {
    const { distributions: _d, durability: _u, drift: _r, ...old } = ride
    const parsed = schema.parse(old)
    for (const key of ['distributions', 'durability', 'drift'])
      expect(parsed).not.toHaveProperty(key)
  })

  it.each(SCHEMAS)('%s schema keeps a null drift and an empty durability', (_l, schema) => {
    const parsed = schema.parse({ ...run, durability: [], drift: null })
    expect(parsed.durability).toEqual([])
    expect(parsed.drift).toBeNull()
  })

  /** Each is refused on a create. A stored row is read without the part, since it names no activity. */
  type Parsed = ReturnType<typeof StoredActivityDigestSchema.parse>
  const repaired: [string, Wire, (stored: Parsed) => boolean][] = [
    [
      'a speed distribution on a ride',
      { ...ride, distributions: { speed: { offset: 1, counts: [1] } } },
      (p) => p.distributions?.speed === undefined,
    ],
    [
      'a power distribution on a run',
      { ...run, distributions: { power: { offset: 1, counts: [1] } } },
      (p) => p.distributions?.power === undefined,
    ],
    [
      'a bin past the last',
      { ...run, distributions: { heartRate: { offset: 300, counts: [1] } } },
      (p) => p.distributions?.heartRate === undefined,
    ],
    [
      'a distribution longer than its bins',
      {
        ...run,
        distributions: { heartRate: { offset: 0, counts: new Array<number>(257).fill(0) } },
      },
      (p) => p.distributions?.heartRate === undefined,
    ],
    [
      'more seconds than the digest holds',
      {
        ...run,
        distributions: { heartRate: { offset: 100, counts: [run.durationS as number, 1] } },
      },
      (p) => p.distributions?.heartRate === undefined,
    ],
    [
      'an unknown durability time',
      { ...run, durability: [{ afterS: 60, durationS: 300, value: 5 }] },
      (p) => p.durability?.length === 0,
    ],
    [
      'a zero durability value',
      { ...run, durability: [{ afterS: 3600, durationS: 300, value: 0 }] },
      (p) => p.durability?.length === 0,
    ],
    [
      'a repeated durability point',
      {
        ...run,
        durability: [
          { afterS: 3600, durationS: 300, value: 5 },
          { afterS: 3600, durationS: 300, value: 5 },
        ],
      },
      (p) => p.durability?.length === 1,
    ],
    [
      'more durability points than there are pairs',
      { ...run, durability: new Array(7).fill({ afterS: 3600, durationS: 300, value: 5 }) },
      (p) => p.durability?.length === 1,
    ],
    [
      'a drift that is not positive',
      { ...run, drift: { firstRatio: 0, secondRatio: 1, durationS: 3000 } },
      (p) => p.drift === null,
    ],
    [
      'a drift on a digest without heart rate',
      { ...run, hasHeartRate: false, drift: { firstRatio: 1, secondRatio: 1, durationS: 3000 } },
      (p) => p.drift === null,
    ],
  ]
  it.each(repaired)('create refuses %s, and a stored row is read without it', (_n, wire, left) => {
    expect(ActivityDigestSchema.safeParse(wire).success).toBe(false)
    const stored = StoredActivityDigestSchema.safeParse(wire)
    expect(stored.success).toBe(true)
    expect(stored.success && left(stored.data)).toBe(true)
  })

  it.each(SCHEMAS)('%s schema refuses a fractional count, which is damage', (_l, schema) => {
    const wire = { ...run, distributions: { heartRate: { offset: 100, counts: [1.5] } } }
    expect(schema.safeParse(wire).success).toBe(false)
  })

  it.each(SCHEMAS)(
    '%s schema accepts the long run each rejection above is made from',
    (_l, schema) => {
      const wire = {
        ...run,
        durability: [{ afterS: 3600, durationS: 300, value: 5 }],
        drift: { firstRatio: 1, secondRatio: 1, durationS: 3000 },
      }
      expect(schema.safeParse(wire).success).toBe(true)
      expect(schema.safeParse(ride).success).toBe(true)
    },
  )
})
