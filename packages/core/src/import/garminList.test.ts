import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { DEFAULT_EXTRACT_LIMITS } from '../fit/archive'
import { streamedZip, toZip64 } from '../fit/zipTestFiles'
import { realisticSummary, SUMMARY_START_MS, SUMMARY_STEP_MS } from './garminTestFiles'
import { MAX_TITLE_CHARS } from './names'
import {
  garminList,
  MAX_GARMIN_SUMMARIES_BYTES,
  MAX_GARMIN_SUMMARY_DEPTH,
  MAX_GARMIN_SUMMARY_OBJECTS,
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

/** A zip of one entry whose central directory lists the entry `times` times. */
function listedTimes(zipBytes: Uint8Array, times: number): Uint8Array<ArrayBuffer> {
  const end = zipBytes.length - 22
  const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength)
  const size = view.getUint32(end + 12, true)
  const offset = view.getUint32(end + 16, true)
  const directory = zipBytes.subarray(offset, offset + size)
  const out = new Uint8Array(offset + size * times + 22)
  out.set(zipBytes.subarray(0, offset))
  for (let i = 0; i < times; i++) out.set(directory, offset + i * size)
  out.set(zipBytes.subarray(end), offset + size * times)
  const outView = new DataView(out.buffer)
  outView.setUint16(offset + size * times + 10, times, true)
  outView.setUint32(offset + size * times + 12, size * times, true)
  return out
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

  it('reads none of a summary with more objects than a summary can hold, before it parses it', () => {
    const many = `[${Array.from({ length: MAX_GARMIN_SUMMARY_OBJECTS + 1 }, () => '{}').join(',')}]`
    expect(parseGarminSummaries(many)).toEqual([])
    const fewer = `[{"summarizedActivitiesExport":[{"name":"A","startTimeGmt":${START}}]}]`
    expect(parseGarminSummaries(fewer)).toEqual([{ startMs: START, name: 'A' }])
  })

  it('reads none of a summary nested deeper than a summary can be, without parsing it', () => {
    const deep = (levels: number) => `${'['.repeat(levels)}${']'.repeat(levels)}`
    // 4 Mi of brackets would be a stack overflow in a parser, and is refused on the way past the 65th.
    expect(parseGarminSummaries('['.repeat(4 * 1024 * 1024))).toEqual([])
    expect(parseGarminSummaries(deep(MAX_GARMIN_SUMMARY_DEPTH + 1))).toEqual([])
    // At the limit it is parsed (and is JSON that lists no activity), and brackets in a name do not count.
    expect(parseGarminSummaries(deep(MAX_GARMIN_SUMMARY_DEPTH))).toEqual([])
    const quoted = JSON.stringify([
      { name: `${'['.repeat(200)}\\"${']'.repeat(10)}`, startTimeGmt: START },
    ])
    expect(parseGarminSummaries(quoted)?.map((a) => a.startMs)).toEqual([START])
  })

  it('still parses a realistic summary of a few hundred activities with nested objects', async () => {
    const text = realisticSummary(300)
    // The size at the cap is the perf test's; here it is the checks, which look at objects and depth.
    expect(text.split('{').length - 1).toBeLessThan(MAX_GARMIN_SUMMARY_OBJECTS / 100)

    const parsed = parseGarminSummaries(text)
    expect(parsed).toHaveLength(300)
    expect(parsed?.[299]).toEqual({
      startMs: SUMMARY_START_MS + 299 * SUMMARY_STEP_MS,
      name: 'Activity number 299',
      sport: 'run',
    })
    const list = await readGarminList(zip({ [`${FOLDER}a_0_summarizedActivities.json`]: text }))
    expect(list?.activities).toHaveLength(300)
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
    expect(list.nameAt(START, 'run')).toBe('First')
    expect(list.nameAt(START + 1500, 'run')).toBe('Close behind')
    expect(list.nameAt(START - START_TOLERANCE_MS, 'run')).toBe('First')
    expect(list.nameAt(START + 3_600_000 + 4000, 'run')).toBe('Later')
  })

  it('gives no name past the tolerance, between activities, or for an unnamed one', () => {
    expect(list.nameAt(START - START_TOLERANCE_MS - 1, 'run')).toBeUndefined()
    expect(list.nameAt(START + 1_800_000, 'run')).toBeUndefined()
    expect(list.nameAt(START + 7_200_000, 'run')).toBeUndefined()
    expect(garminList([]).nameAt(START, 'run')).toBeUndefined()
  })
})

describe('garminList nameAt for summaries that start together', () => {
  const run = { startMs: START, name: 'Park run', sport: 'run' as const }
  const ride = { startMs: START + 400, name: 'Commute', sport: 'ride' as const }

  it('takes the one whose type is the sport of the file', () => {
    const list = garminList([run, ride])
    expect(list.nameAt(START, 'run')).toBe('Park run')
    expect(list.nameAt(START, 'ride')).toBe('Commute')
    // The nearer is the run here, but the file is a ride.
    expect(list.nameAt(START + 100, 'ride')).toBe('Commute')
  })

  it('declines when the sport cannot tell them apart, or the types are unknown', () => {
    const twoRuns = garminList([run, { ...run, startMs: START + 300, name: 'Track session' }])
    expect(twoRuns.nameAt(START, 'run')).toBeUndefined()
    expect(twoRuns.nameAt(START, 'ride')).toBeUndefined()
    const untyped = garminList([
      { startMs: START, name: 'A' },
      { startMs: START + 500, name: 'B' },
    ])
    expect(untyped.nameAt(START, 'run')).toBeUndefined()
  })

  it('names it when the ones that start together agree on the name', () => {
    const twice = garminList([run, { ...run, startMs: START + 200 }])
    expect(twice.nameAt(START, 'run')).toBe('Park run')
    const untyped = garminList([
      { startMs: START, name: 'Same' },
      { startMs: START + 500, name: 'Same' },
    ])
    expect(untyped.nameAt(START, 'ride')).toBe('Same')
  })

  it('gives the same answer whatever order the summaries are in', () => {
    const all = [
      run,
      ride,
      { startMs: START + 300, name: 'Track session', sport: 'run' as const },
      { startMs: START + 900, name: 'Other' },
      { startMs: START + 3000, name: 'Apart' },
    ]
    const orders = [all, [...all].reverse(), [all[2]!, all[4]!, all[0]!, all[3]!, all[1]!]]
    for (const sport of ['run', 'ride'] as const) {
      for (const at of [START - 2000, START, START + 350, START + 2500, START + 3000]) {
        const answers = orders.map((order) => garminList(order).nameAt(at, sport))
        expect(new Set(answers).size).toBe(1)
      }
    }
  })

  it('reads the type from a string or an object, and counts only runs and rides', () => {
    const entries = [
      'running',
      'trail_running',
      'treadmill_running',
      'cycling',
      'indoor_cycling',
      'road_biking',
      'e_bike_fitness',
      'lap_swimming',
      'strength_training',
    ]
    const text = JSON.stringify(
      entries
        .map((activityType, i) => ({ startTimeGmt: START + i, activityType }))
        .concat([
          { startTimeGmt: START + 99, activityType: { typeKey: 'mountain_biking' } } as never,
        ]),
    )
    expect(parseGarminSummaries(text)?.map((a) => a.sport)).toEqual([
      'run',
      'run',
      'run',
      'ride',
      'ride',
      'ride',
      undefined,
      undefined,
      undefined,
      'ride',
    ])
  })

  it('cuts a name to a title: its whitespace joined and its length bounded', () => {
    const text = JSON.stringify([
      { startTimeGmt: START, name: '  Long\n\n  run  ' },
      { startTimeGmt: START + 1, name: 'x'.repeat(500) },
      { startTimeGmt: START + 2, name: '   ' },
    ])
    const parsed = parseGarminSummaries(text)!
    expect(parsed[0]?.name).toBe('Long run')
    expect(parsed[1]?.name?.length).toBe(MAX_TITLE_CHARS)
    expect(parsed[2]).not.toHaveProperty('name')
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

  it('reads summaries from zips written with data descriptors or with ZIP64 records', async () => {
    const files = { [`${FOLDER}a_0_summarizedActivities.json`]: strToU8(summary('One', START)) }
    for (const bytes of [
      streamedZip(files),
      toZip64(zipSync(files)),
      toZip64(streamedZip(files)),
    ]) {
      const list = await readGarminList(new File([bytes], 'export.zip'))

      expect(list?.activities).toEqual([{ startMs: START, name: 'One' }])
    }
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
    expect(entry?.activities).toEqual([])
    expect(MAX_GARMIN_SUMMARIES_BYTES).toBeLessThanOrEqual(
      DEFAULT_EXTRACT_LIMITS.maxTotalDecompressedBytes,
    )
    expect(MAX_GARMIN_SUMMARY_BYTES).toBeLessThanOrEqual(MAX_GARMIN_SUMMARIES_BYTES)
  })

  it('reads an entry that many directory headers point at once, so a small zip cannot make it inflate again and again', async () => {
    const one = summary('One', START)
    const once = zip({ [`${FOLDER}a_0_summarizedActivities.json`]: one })
    const repeated = new File(
      [listedTimes(new Uint8Array(await once.arrayBuffer()), 40)],
      'export.zip',
    )
    const list = await readGarminList(repeated)

    expect(list?.activities).toHaveLength(1)
    expect(list?.decompressedBytes).toBe(one.length)
  })

  it('charges the most an oversized summary could take, and keeps no more than the share of the export', async () => {
    // A small zip that inflates to megabytes of text: refused at its share, and the share is spent.
    const bomb = new Uint8Array(
      zipSync({
        [`${FOLDER}a_0_summarizedActivities.json`]: new Uint8Array(4 * 1024 * 1024).fill(32),
      }),
    )
    const limits = { ...DEFAULT_EXTRACT_LIMITS, maxTotalDecompressedBytes: 1024 * 1024 }
    const list = await readGarminList(new File([bomb], 'export.zip'), limits)

    expect(bomb.length).toBeLessThan(10_000)
    expect(list?.activities).toEqual([])
    expect(list?.decompressedBytes).toBeGreaterThan(0)
    expect(list?.decompressedBytes).toBeLessThanOrEqual(limits.maxTotalDecompressedBytes)
  })

  it('stops trying entries after a few for each it may read, whether or not they can be read', async () => {
    const entries: Record<string, Uint8Array> = {}
    for (let i = 0; i < 400; i++) {
      entries[`${FOLDER}a_${i}_summarizedActivities.json`] = strToU8(summary('x', START + i))
    }
    const bytes = new Uint8Array(zipSync(entries))
    // Mark every entry encrypted in the directory, so none can be read and none costs inflating.
    const view = new DataView(bytes.buffer)
    for (let at = 0; at + 46 < bytes.length; at++) {
      if (view.getUint32(at, true) === 0x02014b50)
        view.setUint16(at + 8, view.getUint16(at + 8, true) | 1, true)
    }
    let slices = 0
    const counted = {
      name: 'export.zip',
      size: bytes.length,
      stream: () => new Blob([bytes]).stream(),
      arrayBuffer: () => new Blob([bytes]).arrayBuffer(),
      slice: (start: number, end: number) => {
        slices++
        return new Blob([bytes]).slice(start, end)
      },
    }
    const list = await readGarminList(counted)

    expect(list).toBeNull()
    // The directory, then one read of a local header for each of at most 4 x 32 tries.
    expect(slices).toBeLessThan(4 * 32 + 20)
  })

  it('reads no summary once a third of the buffer cannot hold what it would take', async () => {
    const file = zip({ [`${FOLDER}a_0_summarizedActivities.json`]: summary('One', START) })
    // The directory fits, the summary and its copies do not.
    const bytes = new Uint8Array(await file.arrayBuffer())
    const directory = new DataView(bytes.buffer).getUint32(bytes.length - 22 + 12, true)
    const list = await readGarminList(file, {
      ...DEFAULT_EXTRACT_LIMITS,
      maxBufferedBytes: directory + 150,
    })

    expect(list?.activities).toEqual([])
    expect(list?.decompressedBytes).toBeGreaterThan(0)
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
