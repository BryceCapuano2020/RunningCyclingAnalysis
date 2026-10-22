import { describe, expect, it } from 'vitest'
import {
  ActivityCreateSchema,
  ActivityDigestSchema,
  DevLoginSchema,
  ProfileInputSchema,
} from './index.ts'

const digestWire = {
  version: 1,
  id: 'a',
  name: 'Ride',
  sport: 'ride',
  startMs: 1_700_000_000_000,
  durationS: null,
  distanceM: 1000,
  elevationGainM: 0,
  hasHeartRate: false,
  indoor: true,
  powerSource: 'none',
  flags: [{ kind: 'power-spike', start: 1, end: 2, message: 'Spike' }],
  flagCounts: { 'power-spike': 1 },
  maxHeartRate: null,
  curve: [{ durationS: 5, value: null, startIndex: -1, windowS: 5, heartRate: null, terms: null }],
  hrBlocks: [],
  calibration: null,
  climbSections: [],
}

describe('ActivityDigestSchema', () => {
  it('restores null to NaN for number fields and keeps null for nullable ones', () => {
    const digest = ActivityDigestSchema.parse(digestWire)
    expect(Number.isNaN(digest.durationS)).toBe(true)
    expect(Number.isNaN(digest.curve[0]?.value)).toBe(true)
    expect(digest.maxHeartRate).toBeNull()
    expect(digest.curve[0]?.heartRate).toBeNull()
    expect(digest.flags[0]?.kind).toBe('power-spike')
    expect(digest.flagCounts).toEqual({ 'power-spike': 1 })
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
})

describe('DevLoginSchema', () => {
  it('lower-cases the email and trims the name', () => {
    expect(DevLoginSchema.parse({ email: 'Bryce@Example.COM', name: ' Bryce ' })).toEqual({
      email: 'bryce@example.com',
      name: 'Bryce',
    })
  })
})
