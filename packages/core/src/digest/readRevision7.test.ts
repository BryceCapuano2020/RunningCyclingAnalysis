import { describe, expect, it } from 'vitest'
import { sampleDataset } from '../synthetic'
import { digestActivity } from './digestActivity'
import { readDigest } from './readDigest'
import { summaryOf } from './summary'
import { serializeDigest } from './serialize'
import type { DigestView } from './readRules'

const run = sampleDataset().activities.find((a) => a.sport === 'run' && a.hasHeartRate)!
const wire = JSON.parse(serializeDigest(digestActivity(run))) as Record<string, unknown>

const VIEWS: DigestView[] = ['create', 'stored', 'device']
const FIELDS = {
  temperature: { c: 14.5, coverage: 0.9 },
  athleteType: 'hike',
  localDayShift: 1,
}

describe('the revision-7 fields', () => {
  it('are absent on a digest made before them, and stay absent', () => {
    for (const view of VIEWS) {
      const digest = readDigest(wire, view)
      for (const key of Object.keys(FIELDS))
        expect(digest, `${view}: ${key}`).not.toHaveProperty(key)
    }
  })

  it('are kept as they are by every view', () => {
    for (const view of VIEWS) {
      expect(readDigest({ ...wire, ...FIELDS }, view), view).toMatchObject(FIELDS)
    }
  })

  it('take every value of their kinds', () => {
    for (const athleteType of ['walk', 'hike', 'ski', 'other']) {
      expect(readDigest({ ...wire, athleteType }, 'create').athleteType).toBe(athleteType)
    }
    for (const localDayShift of [-1, 0, 1]) {
      expect(readDigest({ ...wire, localDayShift }, 'create').localDayShift).toBe(localDayShift)
    }
    for (const c of [-30, -0.5, 0, 55]) {
      expect(
        readDigest({ ...wire, temperature: { c, coverage: 1 } }, 'create').temperature?.c,
      ).toBe(c)
    }
    expect(readDigest({ ...wire, temperature: { c: 5, coverage: 0.5 } }, 'create')).toHaveProperty(
      'temperature.coverage',
      0.5,
    )
  })

  it('are refused by a create when out of bounds, and read as absent by stored and device rows', () => {
    const outOfBounds: Array<[string, Record<string, unknown>, string]> = [
      ['too cold', { temperature: { c: -30.5, coverage: 1 } }, 'temperature'],
      ['too warm', { temperature: { c: 55.5, coverage: 1 } }, 'temperature'],
      ['too little coverage', { temperature: { c: 10, coverage: 0.45 } }, 'temperature'],
      ['more than all of it', { temperature: { c: 10, coverage: 1.05 } }, 'temperature'],
      ['a day two ahead', { localDayShift: 2 }, 'localDayShift'],
      ['a day two behind', { localDayShift: -2 }, 'localDayShift'],
      ['a class nobody knows', { athleteType: 'swim' }, 'athleteType'],
    ]
    for (const [label, extra, key] of outOfBounds) {
      expect(() => readDigest({ ...wire, ...extra }, 'create'), label).toThrow(key)
      for (const view of ['stored', 'device'] as const) {
        const digest = readDigest({ ...wire, ...extra }, view)
        expect(digest, `${label}: ${view}`).not.toHaveProperty(key)
        expect(digest.id, `${label}: ${view}`).toBe(wire.id)
      }
    }
  })

  it('are refused by every view when damaged, as any other field of the digest is', () => {
    const damaged: Array<Record<string, unknown>> = [
      { temperature: 'warm' },
      { temperature: null },
      { temperature: { c: '14', coverage: 0.9 } },
      { temperature: { coverage: 0.9 } },
      { temperature: { c: 14 } },
      { localDayShift: '1' },
      { localDayShift: 0.5 },
      { localDayShift: null },
      { athleteType: 4 },
      { athleteType: null },
    ]
    for (const extra of damaged) {
      for (const view of VIEWS) {
        expect(
          () => readDigest({ ...wire, ...extra }, view),
          `${JSON.stringify(extra)} ${view}`,
        ).toThrow()
      }
    }
  })

  it('are left out of what a reader keeps when it is not given them, never set to undefined', () => {
    const digest = readDigest({ ...wire, athleteType: undefined }, 'create')
    expect(Object.keys(digest)).not.toContain('athleteType')
  })
})

describe('the heart-rate cadence-lock flag', () => {
  const flag = {
    kind: 'hr-cadence-lock',
    start: 100,
    end: 140,
    message: 'Heart rate matched cadence',
  }
  const flagged = { ...wire, flags: [flag], flagCounts: { 'hr-cadence-lock': 1 } }

  it('is read as a quality kind by every view, with its count', () => {
    for (const view of VIEWS) {
      const digest = readDigest(flagged, view)
      expect(digest.flags, view).toEqual([flag])
      expect(digest.flagCounts, view).toEqual({ 'hr-cadence-lock': 1 })
    }
  })

  it('has its flag held to the same rules as any other', () => {
    const outside = { ...flagged, flags: [{ ...flag, end: 1e9 }] }
    expect(() => readDigest(outside, 'create')).toThrow(/flags\[0\]/)
    expect(() =>
      readDigest({ ...flagged, flagCounts: { 'hr-cadence-lock': -1 } }, 'create'),
    ).toThrow()
  })
})

describe('summaryOf: the revision-7 fields', () => {
  it('carries the label and the day shift, and leaves them out when the digest has none', () => {
    const plain = readDigest(wire, 'create')
    expect(summaryOf(plain)).not.toHaveProperty('athleteType')
    expect(summaryOf(plain)).not.toHaveProperty('localDayShift')
    const summary = summaryOf(readDigest({ ...wire, ...FIELDS }, 'create'))
    expect(summary.athleteType).toBe('hike')
    expect(summary.localDayShift).toBe(1)
    expect(summary).not.toHaveProperty('temperature')
  })
})
