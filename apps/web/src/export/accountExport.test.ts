import type { ActivityRecord, Profile } from '@rca/contract'
import { digestActivity } from '@rca/core/digest'
import { sampleDataset } from '@rca/core/synthetic'
import { describe, expect, it } from 'vitest'
import {
  buildAccountExport,
  exportActivitiesJson,
  exportFooterJson,
  exportHeaderJson,
} from './accountExport'

const [sample] = sampleDataset().activities
if (sample === undefined) throw new Error('The sample has no activities')
const DIGEST = digestActivity(sample)

const RECORD: ActivityRecord = {
  id: 'rec-1',
  digest: DIGEST,
  fileName: 'morning-run.fit',
  hasFile: true,
  fileSize: 1234,
  createdAt: 5000,
}

const ACCOUNT = { name: 'Ada Lovelace', email: 'ada@example.com' }
const PROFILE: Profile = {
  massKg: 75,
  bikeMassKg: 9,
  units: 'metric',
  keepFiles: true,
  updatedAt: 1000,
}
const NOW = new Date('2026-10-23T12:34:56.000Z')

function build(overrides: Partial<Parameters<typeof buildAccountExport>[0]> = {}) {
  return buildAccountExport({
    now: NOW,
    account: ACCOUNT,
    profile: PROFILE,
    activities: [RECORD],
    unreadable: 0,
    ...overrides,
  })
}

describe('buildAccountExport', () => {
  it('starts with the format and version, then the sections in a fixed order', () => {
    expect(Object.keys(build())).toEqual([
      'format',
      'version',
      'exportedAt',
      'account',
      'profile',
      'activities',
      'unreadable',
      'notes',
    ])
    expect(build()).toMatchObject({ format: 'rca-export', version: 1 })
  })

  it('stamps the export with the time it was made, in ISO form', () => {
    expect(build().exportedAt).toBe('2026-10-23T12:34:56.000Z')
  })

  it('keeps only the account name and email, even when given more', () => {
    const doc = build({
      account: { ...ACCOUNT, id: 'user-1', pictureUrl: 'https://example.com/a.png' } as {
        name: string
        email: string
      },
    })
    expect(doc.account).toEqual(ACCOUNT)
    expect(Object.keys(doc.account)).toEqual(['name', 'email'])
  })

  it('keeps only the stored profile fields, in the API order', () => {
    const doc = build({ profile: { ...PROFILE, extra: 'nope' } as Profile })
    expect(doc.profile).toEqual(PROFILE)
    expect(Object.keys(doc.profile)).toEqual([
      'massKg',
      'bikeMassKg',
      'units',
      'keepFiles',
      'updatedAt',
    ])
  })

  it('lists each activity with its fields in a fixed order and its stored digest', () => {
    const [activity] = build().activities
    expect(Object.keys(activity ?? {})).toEqual([
      'id',
      'sport',
      'startMs',
      'name',
      'fileName',
      'hasFile',
      'createdAt',
      'digest',
    ])
    expect(activity).toEqual({
      id: 'rec-1',
      sport: DIGEST.sport,
      startMs: DIGEST.startMs,
      name: DIGEST.name,
      fileName: 'morning-run.fit',
      hasFile: true,
      createdAt: 5000,
      digest: DIGEST,
    })
  })

  it('does not add the file size or any other field to an activity', () => {
    const [activity] = build().activities
    expect(activity).not.toHaveProperty('fileSize')
    expect(activity).not.toHaveProperty('fileHash')
  })

  it('exports an empty library as an empty activity list', () => {
    expect(build({ activities: [] }).activities).toEqual([])
  })

  it('carries the unreadable count through', () => {
    expect(build({ unreadable: 2 }).unreadable).toBe(2)
  })

  it('says that original files are not included, and that non-numbers are written as null', () => {
    expect(build().notes).toEqual([
      'Original files are not included.',
      'Values that are not numbers are written as null.',
    ])
  })
})

/** The export as the writer streams it: header, each page's activities, then the footer. */
function streamed(pages: ActivityRecord[][], unreadable = 0): string {
  const entries = pages
    .map((page) => exportActivitiesJson(page))
    .filter((text) => text !== '')
    .join(',')
  return (
    exportHeaderJson({ now: NOW, account: ACCOUNT, profile: PROFILE }) +
    entries +
    exportFooterJson(unreadable)
  )
}

describe('streamed export writers', () => {
  it('assemble to the same document the schema builder describes', () => {
    const text = streamed([[RECORD]], 2)
    expect(JSON.parse(text)).toEqual(JSON.parse(JSON.stringify(build({ unreadable: 2 }))))
  })

  it('join several pages into one list with no stray commas', () => {
    const second = { ...RECORD, id: 'rec-2' }
    const text = streamed([[RECORD], [], [second]])
    expect(JSON.parse(text)).toEqual(
      JSON.parse(JSON.stringify(build({ activities: [RECORD, second] }))),
    )
  })

  it('writes an empty library as an empty activity list', () => {
    expect(JSON.parse(streamed([]))).toEqual(JSON.parse(JSON.stringify(build({ activities: [] }))))
  })

  it('is compact, not pretty-printed', () => {
    const text = streamed([[RECORD]])
    expect(text).not.toContain('\n')
    expect(text.startsWith('{"format":"rca-export","version":1,"exportedAt":')).toBe(true)
  })
})
