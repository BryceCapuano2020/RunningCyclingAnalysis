import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { DEFAULT_EXTRACT_LIMITS } from '../fit/archive'
import {
  garminList,
  MAX_GARMIN_SUMMARY_BYTES,
  parseGarminSummaries,
  readGarminList,
  START_TOLERANCE_MS,
} from './garminList'

const START = Date.UTC(2024, 4, 1, 7, 30)
const FOLDER = 'DI_CONNECT/DI-Connect-Fitness/'

function zip(entries: Record<string, string>, name = 'export.zip'): File {
  const bytes = Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, strToU8(v)]))
  return new File([new Uint8Array(zipSync(bytes))], name)
}

describe('parseGarminSummaries', () => {
  it('reads the list Garmin writes, an object holding summarizedActivitiesExport', () => {
    const text = JSON.stringify([
      {
        summarizedActivitiesExport: [
          { activityId: 1, name: 'Lakeside Run', startTimeGmt: START, beginTimestamp: START + 1 },
          { activityId: 2, name: '  ', beginTimestamp: START + 5000 },
        ],
      },
    ])
    expect(parseGarminSummaries(text)).toEqual([
      { startMs: START, name: 'Lakeside Run' },
      { startMs: START + 5000 },
    ])
  })

  it.each([
    ['the object alone', { summarizedActivitiesExport: [{ name: 'A', startTimeGmt: START }] }],
    ['a bare list of activities', [{ name: 'A', startTimeGmt: START }]],
    ['several objects', [{ summarizedActivitiesExport: [{ name: 'A', startTimeGmt: START }] }, {}]],
  ])('also reads %s', (_label, root) => {
    expect(parseGarminSummaries(JSON.stringify(root))).toEqual([{ startMs: START, name: 'A' }])
  })

  it('reads a start given in seconds, and leaves out entries with no usable start or no object', () => {
    const text = JSON.stringify([
      {
        summarizedActivitiesExport: [
          { name: 'Seconds', startTimeGmt: START / 1000 },
          { name: 'No start' },
          { name: 'Text start', startTimeGmt: '2024-05-01' },
          { name: 'Zero', startTimeGmt: 0 },
          'not an object',
          null,
        ],
      },
    ])
    expect(parseGarminSummaries(text)).toEqual([{ startMs: START, name: 'Seconds' }])
  })

  it('is null for text that is not JSON, and empty for JSON of another shape', () => {
    expect(parseGarminSummaries('{ nope')).toBeNull()
    expect(parseGarminSummaries('42')).toEqual([])
    expect(parseGarminSummaries('{"summarizedActivitiesExport": 3}')).toEqual([])
  })
})

describe('garminList nameAt', () => {
  const list = garminList([
    { startMs: START + 3_600_000, name: 'Later' },
    { startMs: START, name: 'First' },
    { startMs: START + 2000, name: 'Close behind' },
    { startMs: START + 7_200_000 },
  ])

  it('names the activity that started within the tolerance, the nearest when there are two', () => {
    expect(list.nameAt(START)).toBe('First')
    expect(list.nameAt(START + 1500)).toBe('Close behind')
    expect(list.nameAt(START - START_TOLERANCE_MS)).toBe('First')
    expect(list.nameAt(START + 3_600_000 + 4000)).toBe('Later')
  })

  it('gives no name past the tolerance, between activities, or for an unnamed one', () => {
    expect(list.nameAt(START - START_TOLERANCE_MS - 1)).toBeUndefined()
    expect(list.nameAt(START + 1_800_000)).toBeUndefined()
    expect(list.nameAt(START + 7_200_000)).toBeUndefined()
    expect(garminList([]).nameAt(START)).toBeUndefined()
  })
})

describe('readGarminList', () => {
  const summary = (name: string, startMs: number) =>
    JSON.stringify([{ summarizedActivitiesExport: [{ name, startTimeGmt: startMs }] }])

  it('reads every summarizedActivities file of DI-Connect-Fitness, in any case and with either slash', async () => {
    const file = zip({
      [`${FOLDER}a@example.com_0_summarizedActivities.json`]: summary('One', START),
      'di_connect\\di-connect-fitness\\a@example.com_1_SummarizedActivities.json': summary(
        'Two',
        START + 86_400_000,
      ),
      [`${FOLDER}a@example.com_0_summarizedActivities.json.bak`]: summary('Backup', START + 1),
      'DI_CONNECT/DI-Connect-Wellness/a@example.com_summarizedActivities.json': summary('X', START),
      [`${FOLDER}Training/other.json`]: summary('Y', START),
    })
    const list = await readGarminList(file)

    expect(list?.activities.map((a) => a.name)).toEqual(['One', 'Two'])
    expect(list?.decompressedBytes).toBe(
      summary('One', START).length + summary('Two', START).length,
    )
  })

  it('is null for a zip with no summary, a source that is not a zip, and one past the source limit', async () => {
    expect(await readGarminList(zip({ 'activities.csv': 'x' }))).toBeNull()
    expect(await readGarminList(new File([strToU8('x')], 'run.fit'))).toBeNull()
    const file = zip({ [`${FOLDER}a_summarizedActivities.json`]: summary('One', START) })
    expect(await readGarminList(file, { ...DEFAULT_EXTRACT_LIMITS, maxSourceBytes: 10 })).toBeNull()
  })

  it('leaves out a summary past the entry limit, and stops before the budget of decompressed bytes', async () => {
    const files = {
      [`${FOLDER}a_0_summarizedActivities.json`]: summary('One', START),
      [`${FOLDER}a_1_summarizedActivities.json`]: summary('Two', START + 1000),
    }
    const one = summary('One', START).length
    const budget = await readGarminList(zip(files), {
      ...DEFAULT_EXTRACT_LIMITS,
      maxTotalDecompressedBytes: one + 5,
    })
    expect(budget?.activities.map((a) => a.name)).toEqual(['One'])
    const entry = await readGarminList(zip(files), { ...DEFAULT_EXTRACT_LIMITS, maxEntryBytes: 10 })
    expect(entry).toBeNull()
    expect(MAX_GARMIN_SUMMARY_BYTES).toBeLessThanOrEqual(
      DEFAULT_EXTRACT_LIMITS.maxTotalDecompressedBytes,
    )
  })

  it('counts the bytes of a summary that is not JSON, and reads no activities from it', async () => {
    const list = await readGarminList(zip({ [`${FOLDER}a_summarizedActivities.json`]: '{ nope' }))

    expect(list?.activities).toEqual([])
    expect(list?.decompressedBytes).toBe(6)
  })

  it('keeps no more activities than the export may hold files', async () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      name: `A${i}`,
      startTimeGmt: START + i * 60_000,
    }))
    const file = zip({
      [`${FOLDER}a_summarizedActivities.json`]: JSON.stringify([
        { summarizedActivitiesExport: many },
      ]),
    })
    const list = await readGarminList(file, { ...DEFAULT_EXTRACT_LIMITS, maxArchiveEntries: 3 })

    expect(list?.activities).toHaveLength(3)
  })
})
