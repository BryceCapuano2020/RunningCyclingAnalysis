import { digestActivity, serializeDigest } from '@rca/core/digest'
import { MODEL_REVISION } from '@rca/core/digest/modelRevision'
import { DURATIONS_S } from '@rca/core/constants'
import { sampleDataset } from '@rca/core/synthetic'
import { describe, expect, it } from 'vitest'
import { MAX_DIGEST_BYTES } from './limits.ts'
import {
  ActivityCreateSchema,
  ActivityDigestSchema,
  ActivityPageSchema,
  ActivityPageWireSchema,
  ActivityRecordSchema,
  ApiErrorSchema,
  DevLoginSchema,
  ProfileInputSchema,
  ProfileSchema,
  StoredActivityDigestSchema,
  UserSchema,
} from './index.ts'

const curve = DURATIONS_S.map((durationS) => ({
  durationS,
  value: null,
  startIndex: -1,
  windowS: durationS,
  heartRate: null,
  terms: null,
}))

/** A valid one-hour digest with no HR blocks. Revision-less, so it reads as the oldest revision. */
const digestWire = {
  version: 1,
  id: 'a',
  name: 'Ride',
  sport: 'ride',
  startMs: 1_700_000_000_000,
  durationS: 3600,
  distanceM: 1000,
  elevationGainM: 0,
  hasHeartRate: false,
  indoor: true,
  powerSource: 'none',
  flags: [{ kind: 'power-spike', start: 1, end: 2, message: 'Spike' }],
  flagCounts: { 'power-spike': 1 },
  maxHeartRate: null,
  curve,
  hrBlocks: [],
  calibration: null,
  climbSections: [],
}

const hrBlock = { heartRate: 150, value: 210, terms: null }

/** Stored digests from every revision a row can carry. */
const REVISIONS = [1, 2, MODEL_REVISION] as const

function atRevision(revision: number, overrides: Record<string, unknown> = {}) {
  return { ...digestWire, modelRevision: revision, ...overrides }
}

/** Real digests of the core sample dataset, as the API receives them: JSON with null for NaN. */
const sampleWires = sampleDataset()
  .activities.slice(0, 3)
  .map(
    (activity) => JSON.parse(serializeDigest(digestActivity(activity))) as Record<string, unknown>,
  )

describe('ActivityDigestSchema', () => {
  it('restores null to NaN for number fields and keeps null for nullable ones', () => {
    const digest = ActivityDigestSchema.parse({ ...digestWire, distanceM: null })
    expect(Number.isNaN(digest.distanceM)).toBe(true)
    expect(Number.isNaN(digest.curve[0]?.value)).toBe(true)
    expect(digest.maxHeartRate).toBeNull()
    expect(digest.curve[0]?.heartRate).toBeNull()
    expect(digest.flags[0]?.kind).toBe('power-spike')
    expect(digest.flagCounts).toEqual({ 'power-spike': 1 })
    expect(digest.modelRevision).toBe(1)
  })

  it('validates the current model revision shape and accepts missing legacy revision', () => {
    const current = atRevision(MODEL_REVISION)
    expect(ActivityDigestSchema.safeParse(current).success).toBe(true)
    expect(
      ActivityDigestSchema.safeParse({ ...current, curve: current.curve.slice(1) }).success,
    ).toBe(false)
    expect(ActivityDigestSchema.safeParse({ ...digestWire, modelRevision: 0 }).success).toBe(false)
    expect(
      ActivityDigestSchema.safeParse({ ...digestWire, modelRevision: MODEL_REVISION + 1 }).success,
    ).toBe(true)
    expect(
      ActivityDigestSchema.safeParse({ ...digestWire, modelRevision: Number.MAX_SAFE_INTEGER + 1 })
        .success,
    ).toBe(false)
    expect(
      ActivityCreateSchema.safeParse({
        digest: { ...digestWire, modelRevision: MODEL_REVISION + 1 },
        fileName: 'ride.fit',
        fileHash: 'a'.repeat(64),
      }).success,
    ).toBe(false)
  })

  it('rejects infinities, which JSON cannot carry', () => {
    expect(ActivityDigestSchema.safeParse({ ...digestWire, distanceM: Infinity }).success).toBe(
      false,
    )
  })

  it('requires a finite startMs, because the dedupe key depends on it', () => {
    expect(ActivityDigestSchema.safeParse({ ...digestWire, startMs: null }).success).toBe(false)
  })

  it('rejects a digest without flagCounts or with an unknown kind in it', () => {
    const { flagCounts: _omitted, ...withoutCounts } = digestWire
    expect(ActivityDigestSchema.safeParse(withoutCounts).success).toBe(false)
    expect(ActivityDigestSchema.safeParse({ ...digestWire, flagCounts: { nope: 1 } }).success).toBe(
      false,
    )
  })

  it('rejects unknown sports, quality kinds and digest versions', () => {
    expect(ActivityDigestSchema.safeParse({ ...digestWire, sport: 'swim' }).success).toBe(false)
    expect(ActivityDigestSchema.safeParse({ ...digestWire, version: 2 }).success).toBe(false)
    const badFlag = { ...digestWire, flags: [{ kind: 'nope', start: 0, end: 1, message: 'm' }] }
    expect(ActivityDigestSchema.safeParse(badFlag).success).toBe(false)
  })

  it('rejects a duration that is not a whole number of seconds', () => {
    for (const revision of REVISIONS) {
      expect(
        ActivityDigestSchema.safeParse(atRevision(revision, { durationS: null })).success,
      ).toBe(false)
      expect(ActivityDigestSchema.safeParse(atRevision(revision, { durationS: 1.5 })).success).toBe(
        false,
      )
    }
  })

  it('rejects flag counts that are not non-negative whole numbers', () => {
    for (const revision of REVISIONS) {
      const fractional = { 'power-spike': 1.5 }
      const negative = { 'power-spike': -1 }
      expect(
        ActivityDigestSchema.safeParse(atRevision(revision, { flagCounts: fractional })).success,
      ).toBe(false)
      expect(
        ActivityDigestSchema.safeParse(atRevision(revision, { flagCounts: negative })).success,
      ).toBe(false)
    }
  })
})

describe('bounds apply to every accepted revision', () => {
  it.each(REVISIONS)('accepts the HR blocks a one-hour digest can hold (revision %i)', (rev) => {
    // Blocks start after a 600 s warm-up and take 300 s each: 10 fit in one hour.
    const hrBlocks = Array.from({ length: 10 }, () => hrBlock)
    expect(ActivityDigestSchema.safeParse(atRevision(rev, { hrBlocks })).success).toBe(true)
  })

  it.each(REVISIONS)('rejects 6,386 HR blocks in a one-hour digest (revision %i)', (rev) => {
    const hrBlocks = Array.from({ length: 6386 }, () => hrBlock)
    expect(ActivityDigestSchema.safeParse(atRevision(rev, { hrBlocks })).success).toBe(false)
  })

  it.each(REVISIONS)('rejects HR blocks beyond the absolute cap (revision %i)', (rev) => {
    // A claimed duration of 1e9 s would otherwise allow millions of blocks.
    const hrBlocks = Array.from({ length: 2015 }, () => hrBlock)
    expect(
      ActivityDigestSchema.safeParse(atRevision(rev, { durationS: 1e9, hrBlocks })).success,
    ).toBe(false)
  })

  it.each(REVISIONS)('rejects a curve of the wrong length or durations (revision %i)', (rev) => {
    expect(ActivityDigestSchema.safeParse(atRevision(rev, { curve: curve.slice(1) })).success).toBe(
      false,
    )
    const extra = [...curve, { ...curve[0]! }]
    expect(ActivityDigestSchema.safeParse(atRevision(rev, { curve: extra })).success).toBe(false)
    const shifted = curve.map((p, i) => (i === 0 ? { ...p, durationS: 6 } : p))
    expect(ActivityDigestSchema.safeParse(atRevision(rev, { curve: shifted })).success).toBe(false)
  })

  it.each(REVISIONS)('rejects more flags than the digest keeps (revision %i)', (rev) => {
    const flags = Array.from({ length: 51 }, () => digestWire.flags[0])
    expect(ActivityDigestSchema.safeParse(atRevision(rev, { flags })).success).toBe(false)
  })

  it.each(REVISIONS)('rejects more climb sections than the cap (revision %i)', (rev) => {
    const section = { start: 0, end: 300, measuredW: 200, terms: digestSectionTerms }
    const climbSections = Array.from({ length: 5041 }, () => section)
    expect(
      ActivityDigestSchema.safeParse(atRevision(rev, { durationS: 1e9, climbSections })).success,
    ).toBe(false)
  })

  it.each(REVISIONS)('rejects over-long strings (revision %i)', (rev) => {
    const long = 'x'.repeat(MAX_DIGEST_BYTES + 1)
    expect(ActivityDigestSchema.safeParse(atRevision(rev, { name: long })).success).toBe(false)
    expect(ActivityDigestSchema.safeParse(atRevision(rev, { id: long })).success).toBe(false)
    const flags = [{ kind: 'power-spike', start: 1, end: 2, message: long }]
    expect(ActivityDigestSchema.safeParse(atRevision(rev, { flags })).success).toBe(false)
  })
})

const digestSectionTerms = { gravityAccel: 1, rolling: 0.1, aero: 0.2 }

describe('realistic digests from the sample dataset', () => {
  it('still parse at revisions 1, 2 and the current revision', () => {
    expect(sampleWires.length).toBeGreaterThan(0)
    for (const wire of sampleWires) {
      for (const revision of REVISIONS) {
        const result = ActivityDigestSchema.safeParse({ ...wire, modelRevision: revision })
        expect(result.success, `${String(wire.id)} at revision ${revision}`).toBe(true)
      }
    }
  })

  it('still parse when the revision field is absent, as in the oldest rows', () => {
    for (const wire of sampleWires) {
      const { modelRevision: _omitted, ...legacy } = wire
      const parsed = ActivityDigestSchema.safeParse(legacy)
      expect(parsed.success).toBe(true)
      expect(parsed.data?.modelRevision).toBe(1)
    }
  })
})

describe('stored digests', () => {
  it('reads an old-revision digest with a null duration and an off-grid curve, which create rejects', () => {
    const legacy = {
      ...digestWire,
      modelRevision: 1,
      durationS: null,
      curve: curve.slice(0, 3).map((point) => Object.assign({}, point, { durationS: 7 })),
    }
    expect(ActivityDigestSchema.safeParse(legacy).success).toBe(false)
    const stored = StoredActivityDigestSchema.safeParse(legacy)
    expect(stored.success).toBe(true)
    expect(stored.data?.durationS).toBeNaN()
  })

  it('still bounds the array lengths of stored digests, by cutting the list', () => {
    const oversized = {
      ...digestWire,
      modelRevision: 1,
      curve: Array.from({ length: DURATIONS_S.length * 4 + 1 }, () => curve[0]),
    }
    expect(ActivityDigestSchema.safeParse(oversized).success).toBe(false)
    expect(StoredActivityDigestSchema.parse(oversized).curve).toHaveLength(DURATIONS_S.length * 4)
  })
})

describe('string bounds on API payloads', () => {
  const user = { id: 'u1', email: 'rider@example.com', name: 'Rider', pictureUrl: null }
  const record = {
    id: 'a1',
    digest: digestWire,
    fileName: 'ride.fit',
    hasFile: false,
    fileSize: null,
    createdAt: 1,
  }

  it('bounds the user fields', () => {
    expect(UserSchema.safeParse(user).success).toBe(true)
    expect(UserSchema.safeParse({ ...user, id: 'x'.repeat(65) }).success).toBe(false)
    expect(UserSchema.safeParse({ ...user, name: 'x'.repeat(513) }).success).toBe(false)
    expect(UserSchema.safeParse({ ...user, pictureUrl: 'x'.repeat(2049) }).success).toBe(false)
    expect(UserSchema.safeParse({ ...user, email: `${'x'.repeat(310)}@example.com` }).success).toBe(
      false,
    )
  })

  it('bounds the activity record and page fields', () => {
    expect(ActivityRecordSchema.safeParse(record).success).toBe(true)
    expect(ActivityRecordSchema.safeParse({ ...record, id: 'x'.repeat(65) }).success).toBe(false)
    expect(ActivityRecordSchema.safeParse({ ...record, fileName: 'x'.repeat(256) }).success).toBe(
      false,
    )
    const cursor = 'c'.repeat(257)
    expect(ActivityPageSchema.safeParse({ items: [], nextCursor: cursor }).success).toBe(false)
  })

  it('reads a page off the wire with each digest left for the caller to check', () => {
    const wire = {
      items: [record, { ...record, id: 'a2', digest: { version: 1 } }],
      nextCursor: null,
    }
    expect(ActivityPageSchema.safeParse(wire).success).toBe(false)
    const parsed = ActivityPageWireSchema.safeParse(wire)
    expect(parsed.success).toBe(true)
    expect(parsed.data?.items.map((item) => item.digest)).toEqual([digestWire, { version: 1 }])
    // The envelope keeps the bounds of the strict page schema.
    const longName = { ...record, fileName: 'x'.repeat(256) }
    expect(ActivityPageWireSchema.safeParse({ items: [longName], nextCursor: null }).success).toBe(
      false,
    )
    expect(
      ActivityPageWireSchema.safeParse({ items: [], nextCursor: 'c'.repeat(257) }).success,
    ).toBe(false)
  })

  it('bounds the error code and message', () => {
    const error = { error: { code: 'invalid_request', message: 'body: Required' } }
    expect(ApiErrorSchema.safeParse(error).success).toBe(true)
    expect(
      ApiErrorSchema.safeParse({ error: { code: 'x'.repeat(65), message: 'm' } }).success,
    ).toBe(false)
    expect(
      ApiErrorSchema.safeParse({ error: { code: 'c', message: 'x'.repeat(4097) } }).success,
    ).toBe(false)
  })
})

describe('ActivityCreateSchema', () => {
  it('requires a lowercase 64-character hex SHA-256', () => {
    const base = { digest: digestWire, fileName: 'a.fit' }
    expect(ActivityCreateSchema.safeParse({ ...base, fileHash: 'f'.repeat(64) }).success).toBe(true)
    expect(ActivityCreateSchema.safeParse({ ...base, fileHash: 'F'.repeat(64) }).success).toBe(
      false,
    )
    expect(ActivityCreateSchema.safeParse({ ...base, fileHash: 'f'.repeat(63) }).success).toBe(
      false,
    )
  })

  it('requires a non-empty file name', () => {
    const base = { digest: digestWire, fileHash: 'f'.repeat(64) }
    expect(ActivityCreateSchema.safeParse({ ...base, fileName: '' }).success).toBe(false)
  })
})

describe('ProfileInputSchema', () => {
  const valid = { massKg: 75, bikeMassKg: 9, units: 'metric', keepFiles: false }

  it('accepts the bounds and rejects values just outside them', () => {
    expect(ProfileInputSchema.safeParse({ ...valid, massKg: 30, bikeMassKg: 3 }).success).toBe(true)
    expect(ProfileInputSchema.safeParse({ ...valid, massKg: 200, bikeMassKg: 30 }).success).toBe(
      true,
    )
    expect(ProfileInputSchema.safeParse({ ...valid, massKg: 29.99 }).success).toBe(false)
    expect(ProfileInputSchema.safeParse({ ...valid, bikeMassKg: 30.01 }).success).toBe(false)
  })

  it('rejects NaN and unknown units', () => {
    expect(ProfileInputSchema.safeParse({ ...valid, massKg: Number.NaN }).success).toBe(false)
    expect(ProfileInputSchema.safeParse({ ...valid, units: 'stone' }).success).toBe(false)
  })

  it('treats null as clearing the body mass, and leaves it out when it is omitted', () => {
    expect(ProfileInputSchema.parse({ ...valid, massKg: null })).toMatchObject({ massKg: null })
    expect(
      ProfileInputSchema.parse({ bikeMassKg: 9, units: 'metric', keepFiles: false }),
    ).not.toHaveProperty('massKg')
  })

  it('rejects a body mass that is text, even though null is accepted', () => {
    expect(ProfileInputSchema.safeParse({ ...valid, massKg: '75' }).success).toBe(false)
  })

  it('leaves year of birth and sex out of the parsed value when they are omitted', () => {
    const parsed = ProfileInputSchema.parse(valid)
    expect(parsed).not.toHaveProperty('birthYear')
    expect(parsed).not.toHaveProperty('sex')
  })

  it('treats null as clearing year of birth and sex', () => {
    expect(ProfileInputSchema.parse({ ...valid, birthYear: null, sex: null })).toMatchObject({
      birthYear: null,
      sex: null,
    })
    expect(ProfileInputSchema.parse({ ...valid, birthYear: 1985, sex: 'female' })).toMatchObject({
      birthYear: 1985,
      sex: 'female',
    })
  })

  it('accepts the year bounds and rejects years outside them or not whole', () => {
    for (const birthYear of [1900, 2100]) {
      expect(ProfileInputSchema.safeParse({ ...valid, birthYear }).success).toBe(true)
    }
    for (const birthYear of [1899, 2101, 1985.5, Number.NaN, '1985']) {
      expect(ProfileInputSchema.safeParse({ ...valid, birthYear }).success, String(birthYear)).toBe(
        false,
      )
    }
  })

  it('accepts only female or male as sex', () => {
    for (const sex of ['male', 'female']) {
      expect(ProfileInputSchema.safeParse({ ...valid, sex }).success).toBe(true)
    }
    for (const sex of ['other', 'Female', '']) {
      expect(ProfileInputSchema.safeParse({ ...valid, sex }).success, sex).toBe(false)
    }
  })
})

describe('ProfileSchema', () => {
  const stored = { massKg: 75, bikeMassKg: 9, units: 'imperial', keepFiles: false, updatedAt: 1 }

  it('reads a profile saved before age and sex existed as null for both', () => {
    expect(ProfileSchema.parse(stored)).toMatchObject({ birthYear: null, sex: null })
  })

  it('reads a profile with no body mass entered as a null body mass', () => {
    expect(ProfileSchema.parse({ ...stored, massKg: null })).toMatchObject({ massKg: null })
  })

  it('keeps a saved year of birth and sex', () => {
    expect(ProfileSchema.parse({ ...stored, birthYear: 1972, sex: 'male' })).toMatchObject({
      birthYear: 1972,
      sex: 'male',
    })
  })
})

describe('DevLoginSchema', () => {
  it('lower-cases the email and trims the name', () => {
    expect(DevLoginSchema.parse({ email: 'Bryce@Example.COM', name: ' Bryce ' })).toEqual({
      email: 'bryce@example.com',
      name: 'Bryce',
    })
  })
})

describe('digest splits', () => {
  const split = {
    distanceM: 1000,
    seconds: 300,
    gradeAdjustedSeconds: 290,
    elevationGainM: 12,
    avgHeartRate: 150,
  }
  const splitsOf = (km: number, mile: number) => ({
    km: Array.from({ length: km }, () => ({ ...split })),
    mile: Array.from({ length: mile }, () => ({ ...split, distanceM: 1609.344 })),
  })
  const withSplits = (splits: unknown) => ({ ...digestWire, splits })
  const withKm = (override: Record<string, unknown>) =>
    withSplits({ km: [{ ...split, ...override }], mile: [] })

  it('reads splits back, from both the create and the stored schemas', () => {
    const wire = withSplits(splitsOf(2, 1))
    expect(ActivityDigestSchema.parse(wire).splits).toEqual(splitsOf(2, 1))
    expect(StoredActivityDigestSchema.parse(wire).splits).toEqual(splitsOf(2, 1))
  })

  it('reads a digest without splits as having none', () => {
    expect(ActivityDigestSchema.parse(digestWire)).not.toHaveProperty('splits')
    expect(StoredActivityDigestSchema.parse(digestWire)).not.toHaveProperty('splits')
  })

  it('accepts null for a split whose time, grade, climb or heart rate is unknown', () => {
    const parsed = ActivityDigestSchema.parse(
      withKm({
        seconds: null,
        gradeAdjustedSeconds: null,
        elevationGainM: null,
        avgHeartRate: null,
      }),
    )
    expect(parsed.splits?.km[0]).toMatchObject({
      seconds: null,
      gradeAdjustedSeconds: null,
      elevationGainM: null,
      avgHeartRate: null,
    })
  })

  it('accepts exactly 500 kilometre splits and 320 mile splits', () => {
    expect(ActivityDigestSchema.safeParse(withSplits(splitsOf(500, 320))).success).toBe(true)
  })

  it('rejects more than 500 kilometre splits or 320 mile splits in a create', () => {
    expect(ActivityDigestSchema.safeParse(withSplits(splitsOf(501, 0))).success).toBe(false)
    expect(ActivityDigestSchema.safeParse(withSplits(splitsOf(0, 321))).success).toBe(false)
  })

  it('reads stored rows at four times the create limit, as apps/api/LIMITS.md describes', () => {
    expect(StoredActivityDigestSchema.safeParse(withSplits(splitsOf(2000, 1280))).success).toBe(
      true,
    )
    // Past that a unit has no splits, as a digest makes it for a run over the limit.
    const past = StoredActivityDigestSchema.parse(withSplits(splitsOf(2001, 1)))
    expect(past.splits?.km).toEqual([])
    expect(past.splits?.mile).toHaveLength(1)
    const pastMiles = StoredActivityDigestSchema.parse(withSplits(splitsOf(1, 1281)))
    expect(pastMiles.splits?.km).toHaveLength(1)
    expect(pastMiles.splits?.mile).toEqual([])
  })

  it('rejects a split value that is missing, negative, infinite or NaN', () => {
    for (const override of [
      { seconds: undefined },
      { seconds: -1 },
      { distanceM: Number.POSITIVE_INFINITY },
      { elevationGainM: Number.NaN },
      { gradeAdjustedSeconds: Number.NaN },
      { avgHeartRate: -5 },
    ]) {
      expect(ActivityDigestSchema.safeParse(withKm(override)).success).toBe(false)
    }
    // A stored row refuses what is damaged, and reads a value out of bounds as unknown.
    for (const damage of [
      { seconds: undefined },
      { distanceM: Number.POSITIVE_INFINITY },
      { elevationGainM: Number.NaN },
      { gradeAdjustedSeconds: Number.NaN },
    ]) {
      expect(StoredActivityDigestSchema.safeParse(withKm(damage)).success).toBe(false)
    }
    const read = StoredActivityDigestSchema.parse(withKm({ seconds: -1, avgHeartRate: -5 }))
    expect(read.splits?.km[0]).toMatchObject({ seconds: null, avgHeartRate: null })
  })

  it('rejects splits with the wrong shape', () => {
    expect(ActivityDigestSchema.safeParse(withSplits({ km: [] })).success).toBe(false)
    expect(ActivityDigestSchema.safeParse(withSplits(null)).success).toBe(false)
  })
})

describe('shared limits', () => {
  it('pins the owner-approved daily budgets, with the two deliberate import exceptions', async () => {
    const {
      DAILY_LIMITS,
      MAX_CONCURRENT_UPLOADS_PER_USER,
      MAX_GLOBAL_R2_WRITE_BYTES,
      MAX_MONTHLY_R2_PUT_BYTES,
    } = await import('./index.ts')
    expect(DAILY_LIMITS).toEqual({
      fileDownload: 5000,
      profileWrite: 50,
      activityDelete: 50,
      activityCreate: 5000,
      fileUpload: 2000,
      read: 100,
      measurementWrite: 200,
      measurementRead: 300,
    })
    expect(MAX_CONCURRENT_UPLOADS_PER_USER).toBe(2)
    expect(MAX_GLOBAL_R2_WRITE_BYTES).toBe(4 * 1024 * 1024 * 1024)
    expect(MAX_MONTHLY_R2_PUT_BYTES).toBe(2 * 1024 * 1024 * 1024)
  })
})

describe('distance bests', () => {
  const bests = [
    { distanceM: 1000, seconds: 250 },
    { distanceM: 5000, seconds: 1250 },
  ]
  /** A ten-kilometre run; a ride is the same wire with its sport changed. */
  const run = (overrides: Record<string, unknown> = {}) =>
    atRevision(MODEL_REVISION, {
      sport: 'run',
      distanceM: 10000,
      durationS: 2500,
      distanceBests: bests,
      ...overrides,
    })
  /** The create and the stored schema apply the same distance-best rules. */
  const SCHEMAS = [
    ['create', ActivityDigestSchema],
    ['stored', StoredActivityDigestSchema],
  ] as const

  it.each(SCHEMAS)(
    '%s schema accepts a run with ascending record distances it covers',
    (_l, schema) => {
      expect(schema.safeParse(run()).success).toBe(true)
      expect(schema.safeParse(run({ distanceM: 900, distanceBests: [] })).success).toBe(true)
    },
  )

  it.each(SCHEMAS)(
    '%s schema accepts a distance the run falls just short of, timed up to the distance',
    (_l, schema) => {
      // The longest scaled time is the duration over (1 - tolerance): 2,500 / 0.99 is 2,525.25 s.
      for (const seconds of [2506, 2525]) {
        const race = run({ distanceM: 9920, distanceBests: [{ distanceM: 10000, seconds }] })
        expect(schema.safeParse(race).success).toBe(true)
      }
    },
  )

  it.each(SCHEMAS)(
    '%s schema accepts what the digest makes for a run whose only clean stretch is a little short',
    (_l, schema) => {
      // 10,020 m covered, but a jump in the first seconds leaves one clean stretch about 9.94 km
      // long: the 10 km is timed over it and scaled up to a time past the 3,600 s of the activity.
      const n = 3600
      const speed = new Float64Array(n).fill(9950 / (n - 2))
      speed[0] = 0
      speed[1] = 70
      const distance = new Float64Array(n)
      for (let i = 1; i < n; i++) distance[i] = distance[i - 1]! + speed[i]!
      const digest = digestActivity({
        id: 'short-stretch',
        name: 'Short stretch',
        sport: 'run',
        startMs: 0,
        n,
        speed,
        distance,
        altitude: new Float64Array(n).fill(100),
        heartRate: new Float64Array(n).fill(NaN),
        power: new Float64Array(n).fill(NaN),
        paused: new Uint8Array(n),
        hasPower: false,
        hasHeartRate: false,
        hasAltitude: true,
        indoor: false,
      })
      const tenK = digest.distanceBests!.find((b) => b.distanceM === 10_000)!
      expect(tenK.seconds).toBeGreaterThan(n)
      const wire = JSON.parse(serializeDigest(digest)) as Record<string, unknown>
      expect(schema.safeParse(wire).success).toBe(true)
    },
  )

  it('accepts a digest without the field, as digests from before it are', () => {
    expect(ActivityDigestSchema.safeParse(atRevision(MODEL_REVISION)).success).toBe(true)
    expect(StoredActivityDigestSchema.safeParse(atRevision(MODEL_REVISION)).success).toBe(true)
  })

  it('reads a stored run back with its distance bests equal to the wire', () => {
    expect(StoredActivityDigestSchema.parse(run()).distanceBests).toEqual(bests)
  })

  it('refuses distance bests on a ride on a create, and reads a stored row without them', () => {
    expect(ActivityDigestSchema.safeParse(run({ sport: 'ride' })).success).toBe(false)
    const stored = StoredActivityDigestSchema.parse(run({ sport: 'ride' }))
    expect(stored).not.toHaveProperty('distanceBests')
    expect(stored.sport).toBe('ride')
  })

  // Each case breaks one rule: a zero time, a time past the duration, a run that does not cover the
  // distance, a repeated distance and descending order.
  const rejected: [string, Record<string, unknown>][] = [
    ['a zero time', { distanceBests: [{ distanceM: 1000, seconds: 0 }] }],
    ['a time past the duration', { distanceBests: [{ distanceM: 1000, seconds: 2526 }] }],
    [
      'a distance the run does not cover',
      { distanceM: 900, distanceBests: [{ distanceM: 5000, seconds: 1250 }] },
    ],
    [
      'a short distance timed past the scaled duration',
      { distanceM: 9920, distanceBests: [{ distanceM: 10000, seconds: 2526 }] },
    ],
    [
      'a distance further short than the tolerance',
      { distanceM: 9850, distanceBests: [{ distanceM: 10000, seconds: 2500 }] },
    ],
    ['a repeated distance', { distanceBests: [bests[0], bests[0]] }],
    ['descending order', { distanceBests: [...bests].reverse() }],
  ]
  it.each(rejected)(
    'create refuses %s; a stored row is read without that best',
    (_n, overrides) => {
      expect(ActivityDigestSchema.safeParse(run(overrides)).success).toBe(false)
      const stored = StoredActivityDigestSchema.parse(run(overrides))
      const given = overrides.distanceBests as unknown[]
      expect(stored.distanceBests?.length ?? 0).toBeLessThan(given.length)
    },
  )

  // A build that adds a record distance writes bests this one does not know. A create refuses them;
  // a stored row is read without them, so a rollback does not hide the run.
  const unknownDistance = {
    distanceBests: [bests[0], { distanceM: 2000, seconds: 500 }],
  }

  it('refuses a distance that is not a record distance on a create', () => {
    expect(ActivityDigestSchema.safeParse(run(unknownDistance)).success).toBe(false)
  })

  it('reads a stored run without the record distance it does not know', () => {
    expect(StoredActivityDigestSchema.parse(run(unknownDistance)).distanceBests).toEqual([bests[0]])
  })
})

describe('moving time and averages', () => {
  it('accepts them on a create and on a stored row', () => {
    const wire = atRevision(MODEL_REVISION, { movingS: 3000, avgHeartRate: 150, avgPowerW: null })
    expect(ActivityDigestSchema.parse(wire).movingS).toBe(3000)
    expect(ActivityDigestSchema.parse(wire).avgHeartRate).toBe(150)
    expect(StoredActivityDigestSchema.parse(wire).avgPowerW).toBeNull()
  })

  it('keeps a run at walking pace on a create and on a stored row, and reads other digests as having none', () => {
    const wire = atRevision(MODEL_REVISION, { sport: 'run', walkingPace: true })
    expect(ActivityDigestSchema.parse(wire).walkingPace).toBe(true)
    expect(StoredActivityDigestSchema.parse(wire).walkingPace).toBe(true)
    expect(StoredActivityDigestSchema.parse(digestWire)).not.toHaveProperty('walkingPace')
    expect(() =>
      ActivityDigestSchema.parse(atRevision(MODEL_REVISION, { sport: 'run', walkingPace: false })),
    ).toThrow()
  })

  it('keeps a race tag, of either sport, on a create and on a stored row, and a create rejects anything but true', () => {
    for (const sport of ['run', 'ride'] as const) {
      const wire = atRevision(MODEL_REVISION, { sport, race: true })
      expect(ActivityDigestSchema.parse(wire).race).toBe(true)
      expect(StoredActivityDigestSchema.parse(wire).race).toBe(true)
    }
    expect(StoredActivityDigestSchema.parse(digestWire)).not.toHaveProperty('race')
    const unmarked = atRevision(MODEL_REVISION, { sport: 'run', race: false })
    expect(() => ActivityDigestSchema.parse(unmarked)).toThrow()
    // A stored row may come from a build that writes it another way, and is listed without the mark.
    expect(StoredActivityDigestSchema.parse(unmarked)).not.toHaveProperty('race')
  })

  it('allows walking pace on a run only', () => {
    const ride = atRevision(MODEL_REVISION, { sport: 'ride', walkingPace: true })
    expect(() => ActivityDigestSchema.parse(ride)).toThrow(/is only kept for runs/)
    expect(StoredActivityDigestSchema.parse(ride)).not.toHaveProperty('walkingPace')
    const run = atRevision(MODEL_REVISION, { sport: 'run', walkingPace: true })
    expect(ActivityDigestSchema.parse(run).walkingPace).toBe(true)
    expect(StoredActivityDigestSchema.parse(run).walkingPace).toBe(true)
    expect(
      ActivityDigestSchema.parse(atRevision(MODEL_REVISION, { sport: 'ride' })),
    ).not.toHaveProperty('walkingPace')
  })

  it('reads a digest without them as having none', () => {
    expect(ActivityDigestSchema.parse(digestWire)).not.toHaveProperty('movingS')
  })

  it('rejects a negative moving time', () => {
    expect(() => ActivityDigestSchema.parse(atRevision(MODEL_REVISION, { movingS: -1 }))).toThrow()
  })
})

describe('moving time against duration, and the session key', () => {
  it('rejects a moving time longer than the duration on a create, and clamps it on a stored row', () => {
    const wire = atRevision(MODEL_REVISION, { durationS: 3600, movingS: 3601 })
    expect(() => ActivityDigestSchema.parse(wire)).toThrow()
    expect(StoredActivityDigestSchema.parse(wire).movingS).toBe(3600)
  })

  it('accepts a session key on a create and on a stored row, and reads a digest without one', () => {
    const wire = atRevision(MODEL_REVISION, { sessionKey: 'brick.fit' })
    expect(ActivityDigestSchema.parse(wire).sessionKey).toBe('brick.fit')
    expect(StoredActivityDigestSchema.parse(wire).sessionKey).toBe('brick.fit')
    expect(ActivityDigestSchema.parse(digestWire)).not.toHaveProperty('sessionKey')
  })
})
