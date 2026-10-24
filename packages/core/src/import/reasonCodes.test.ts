import { zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { MIB } from '../constants'
import { encodeFit, extractFitFiles } from '../fit'
import { encodeGpx } from '../gpx/encode'
import { AnalysisSession } from '../session'
import { encodeTcx } from '../tcx/encode'
import { sampleDataset } from '../synthetic'
import type { Activity } from '../types'
import { DEFAULT_PARSE_LIMITS, parseActivityFile } from './index'
import { activitiesFromRecords } from './pipeline'
import type { ParseLimits } from './result'

function activityOf(sport: Activity['sport']): Activity {
  const found = sampleDataset().activities.find((activity) => activity.sport === sport)
  if (found === undefined) throw new Error(`The sample has no ${sport} activity`)
  return found
}

const text = (value: string) => new TextEncoder().encode(value)

describe('parseActivityFile reason codes', () => {
  it('gives a file of an unknown format the not-activity code', () => {
    expect(parseActivityFile(text('hello'), 'notes.txt')).toMatchObject({
      ok: false,
      code: 'not-activity',
    })
  })

  it('gives a FIT file whose content cannot be read the corrupt code', () => {
    const bytes = encodeFit(activityOf('run'), { gps: true })
    bytes[bytes.length - 1]! ^= 0xff
    expect(parseActivityFile(bytes, 'ride.fit')).toMatchObject({ ok: false, code: 'corrupt' })
  })

  it('gives a GPX file that is not XML the corrupt code', () => {
    expect(parseActivityFile(text('not xml at all'), 'track.gpx')).toMatchObject({
      ok: false,
      code: 'corrupt',
    })
  })

  it('gives a file over the byte limit the too-large code, with its reason unchanged', () => {
    const limits: ParseLimits = { ...DEFAULT_PARSE_LIMITS, maxFileBytes: 10 }
    const result = parseActivityFile(encodeFit(activityOf('run'), { gps: true }), 'run.fit', limits)
    expect(result).toMatchObject({
      ok: false,
      code: 'too-large',
      reason: 'FIT file exceeds the 10-byte limit',
      detail: '10',
    })
  })

  it('gives a GPX track with no type the no-sport code, and never guesses a sport', () => {
    const untyped = new TextDecoder()
      .decode(encodeGpx(activityOf('run')))
      .replace(/<type>[^<]*<\/type>/, '')
    expect(parseActivityFile(text(untyped), 'track.gpx')).toMatchObject({
      ok: false,
      code: 'no-sport',
    })
  })

  it('gives a sport the app does not count the unsupported-sport code and its label', () => {
    const walk = encodeGpx(activityOf('run'), { type: 'walking' })
    expect(parseActivityFile(walk, 'walk.gpx')).toMatchObject({
      ok: false,
      code: 'unsupported-sport',
      detail: 'walking',
      reason: 'Unsupported sport: walking',
    })
  })

  it('gives an e-bike track the e-bike code', () => {
    const ebike = encodeGpx(activityOf('ride'), { type: 'ebike' })
    expect(parseActivityFile(ebike, 'ebike.gpx')).toMatchObject({ ok: false, code: 'e-bike' })
  })

  it('gives an activity dated in the future the implausible-date code', () => {
    const bytes = encodeFit(activityOf('run'), { gps: true })
    expect(parseActivityFile(bytes, 'run.fit', undefined, { nowMs: 0 })).toMatchObject({
      ok: false,
      code: 'implausible-date',
    })
  })

  it('gives a file with no activities in it the empty code', () => {
    const emptyTcx = text(
      '<?xml version="1.0"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"></TrainingCenterDatabase>',
    )
    expect(parseActivityFile(emptyTcx, 'empty.tcx')).toMatchObject({ ok: false, code: 'empty' })
  })
})

/** A GPX track of timed points, with positions that move on, so each point is a fix. */
function gpxOf(times: number[]): Uint8Array {
  const points = times
    .map((ms, i) => {
      const lat = (51 + i * 0.0001).toFixed(6)
      return `<trkpt lat="${lat}" lon="-0.1"><time>${new Date(ms).toISOString()}</time></trkpt>`
    })
    .join('')
  const xml = `<?xml version="1.0"?><gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1"><trk><type>running</type><trkseg>${points}</trkseg></trk></gpx>`
  return text(xml)
}

const START = Date.UTC(2024, 4, 1, 7, 30)
const SETTINGS = { massKg: 75, bikeMassKg: 9 }

describe('DEFAULT_PARSE_LIMITS: the byte limit is the core MIB unit', () => {
  it('allows 64 MiB, the size the app tells people it reads', () => {
    expect(DEFAULT_PARSE_LIMITS.maxFileBytes).toBe(64 * MIB)
  })
})

describe('parseActivityFile reason codes: the rest of the core refusals', () => {
  it('gives a file with more records than the limit the too-much-data code', () => {
    const limits: ParseLimits = { ...DEFAULT_PARSE_LIMITS, maxRecordMessages: 1 }
    const bytes = encodeFit(activityOf('run'), { gps: true })
    expect(parseActivityFile(bytes, 'run.fit', limits)).toMatchObject({
      ok: false,
      code: 'too-much-data',
    })
  })

  it('gives a track under a minute of recording the too-short code', () => {
    const times = Array.from({ length: 6 }, (_, i) => START + i * 5000)
    expect(parseActivityFile(gpxOf(times), 'short.gpx')).toMatchObject({
      ok: false,
      code: 'too-short',
    })
  })

  it('gives a track whose points are far apart the too-sparse code', () => {
    const times = Array.from({ length: 22 }, (_, i) => START + i * 50_000)
    expect(parseActivityFile(gpxOf(times), 'sparse.gpx')).toMatchObject({
      ok: false,
      code: 'too-sparse',
    })
  })

  it('gives a TCX whose times have no time zone the no-date code', () => {
    const zoneless = new TextDecoder()
      .decode(encodeTcx(activityOf('run')))
      .replace(/<Time>([^<]*)Z<\/Time>/g, '<Time>$1</Time>')
    expect(parseActivityFile(text(zoneless), 'zoneless.tcx')).toMatchObject({
      ok: false,
      code: 'no-date',
    })
  })

  it('gives a recording longer than 48 hours the too-long code', () => {
    // Points ten seconds apart cover 49 hours without a gap, which is one long activity.
    const records = Array.from({ length: 49 * 360 + 1 }, (_, i) => ({
      tMs: START + i * 10_000,
      speed: 4,
      distance: 40 * i,
    }))
    const result = activitiesFromRecords(
      {
        fileName: 'long.gpx',
        records,
        timerEvents: [],
        sport: 'run',
        sportLabel: 'running',
        indoor: false,
        hasPosition: false,
      },
      DEFAULT_PARSE_LIMITS,
      { nowMs: START + 3 * 24 * 3600_000 },
    )
    expect(result).toMatchObject({ ok: false, code: 'too-long' })
  })

  it('gives a copy of a workout already held the duplicate code, and names the copy it duplicates', async () => {
    const run = activityOf('run')
    const session = new AnalysisSession()
    await session.addFiles(
      [new File([new Uint8Array(encodeFit(run, { gps: true }))], 'run.fit')],
      SETTINGS,
    )
    let duplicates: { fileName: string; reason: string; code: string; detail?: string }[] = []
    await session.addFiles(
      [new File([new Uint8Array(encodeGpx(run))], 'copy.gpx')],
      SETTINGS,
      undefined,
      undefined,
      false,
      (outcome) => {
        duplicates = outcome.duplicates
      },
    )
    expect(duplicates).toEqual([
      {
        fileName: 'copy.gpx',
        reason: 'Same workout as run.fit',
        code: 'duplicate',
        detail: 'run.fit',
      },
    ])
  })

  it('gives a zip nested too deep to read the unreadable code', async () => {
    const fit = encodeFit(activityOf('run'), { gps: true })
    const deep = zipSync({
      'a.zip': zipSync({ 'b.zip': zipSync({ 'c.zip': zipSync({ 'run.fit': fit }) }) }),
    })
    const rejected: { fileName: string; reason: string; code: string }[] = []
    await extractFitFiles(
      new File([deep], 'deep.zip'),
      () => undefined,
      (fileName, rejection) => {
        rejected.push({ fileName, reason: rejection.reason, code: rejection.code })
      },
    )
    expect(rejected).toEqual([
      expect.objectContaining({ reason: 'Nested archives are too deep', code: 'unreadable' }),
    ])
  })
})
