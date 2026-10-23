import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Decoder, Stream } from '@garmin/fitsdk'
import { describe, expect, it } from 'vitest'
import { parseFit } from '../fit/parse'
import type { ParseResult } from '../import/result'
import { decodeFit } from '../fit/protocol/decode'
import type { DecodedRecord, DecodedSession } from '../fit/protocol/decode'
import { FIT_EPOCH_OFFSET_S } from '../fit/protocol/profile'
import type { Activity, Sport } from '../types'
import { corpusReader } from './helpers'

/*
 * Real FIT files from python-fitparse (dtcooper/python-fitparse @ d88bb6997138, MIT). Each
 * *-records.csv is python-fitparse's own decoding of the FIT file of the same name, an independent
 * decoder. The device summaries are the session messages the FIT files carry.
 */

const CORPUS = new URL('../../test-corpus/fitparse/', import.meta.url)
const corpusDir = fileURLToPath(CORPUS)
const { bytes: load, text: corpusText } = corpusReader(CORPUS)
const fitNames = readdirSync(corpusDir)
  .filter((name) => name.endsWith('.fit'))
  .sort()
const csvNames = readdirSync(corpusDir)
  .filter((name) => name.endsWith('-records.csv'))
  .sort()

/** Sensor flags and sport of one accepted activity, as the importer reports them. */
interface Flags {
  sport: Sport
  n: number
  power: boolean
  hr: boolean
  alt: boolean
  indoor: boolean
}

/** What the importer must say about a file: its activities in order, or the reason it refuses it. */
type Verdict = { ok: true; activities: Flags[] } | { ok: false; reason: string }

const EXPECTED: Record<string, Verdict> = {
  '2013-02-06-12-11-14.fit': {
    ok: true,
    activities: [{ sport: 'run', n: 2625, power: false, hr: true, alt: true, indoor: false }],
  },
  '2015-10-13-08-43-15.fit': {
    ok: true,
    activities: [{ sport: 'ride', n: 1624, power: false, hr: false, alt: true, indoor: false }],
  },
  '20170518-191602-1740899583.fit': {
    ok: false,
    reason: 'Unsupported sport: fitnessEquipment',
  },
  '2019-02-17-062644-ELEMNT-297E-195-0.fit': {
    ok: true,
    activities: [{ sport: 'ride', n: 23592, power: true, hr: true, alt: true, indoor: false }],
  },
  'Edge810-Vector-2013-08-16-15-35-10.fit': {
    ok: true,
    activities: [{ sport: 'ride', n: 4700, power: true, hr: true, alt: true, indoor: false }],
  },
  'activity-large-fenxi2-multisport.fit': {
    ok: true,
    activities: [
      { sport: 'run', n: 2295, power: false, hr: true, alt: true, indoor: false },
      { sport: 'run', n: 6765, power: false, hr: true, alt: true, indoor: false },
      { sport: 'ride', n: 3212, power: false, hr: true, alt: true, indoor: false },
    ],
  },
  'activity-settings-corruptheader.fit': {
    ok: false,
    reason: 'Activity is shorter than one minute',
  },
  'activity-small-fenix2-run.fit': {
    ok: true,
    activities: [{ sport: 'run', n: 2834, power: false, hr: true, alt: true, indoor: false }],
  },
  'activity-unexpected-eof.fit': { ok: false, reason: 'File is incomplete or corrupt' },
  'compressed-speed-distance.fit': {
    ok: false,
    reason: 'Records have no date, only device time',
  },
  'coros-pace-2-cycling-misaligned-fields.fit': {
    ok: true,
    activities: [{ sport: 'ride', n: 12719, power: false, hr: true, alt: true, indoor: false }],
  },
  'developer-types-sample.fit': {
    ok: true,
    activities: [{ sport: 'run', n: 3424, power: true, hr: true, alt: true, indoor: false }],
  },
  'elemnt-bolt-no-application-id-inside-developer-data-id.fit': {
    ok: true,
    activities: [{ sport: 'ride', n: 132, power: true, hr: false, alt: true, indoor: false }],
  },
  'event_timestamp.fit': { ok: false, reason: 'Unsupported sport: swimming' },
  'garmin-edge-500-activity.fit': {
    ok: true,
    activities: [{ sport: 'ride', n: 12692, power: false, hr: true, alt: true, indoor: false }],
  },
  'garmin-edge-820-bike.fit': {
    ok: true,
    activities: [{ sport: 'ride', n: 66, power: false, hr: true, alt: true, indoor: false }],
  },
  'garmin-fenix-5-bike.fit': {
    ok: true,
    activities: [{ sport: 'ride', n: 62, power: false, hr: true, alt: true, indoor: false }],
  },
  'garmin-fenix-5-run.fit': { ok: false, reason: 'Activity is shorter than one minute' },
  'garmin-fenix-5-walk.fit': { ok: false, reason: 'Unsupported sport: walking' },
  'nick.fit': { ok: false, reason: 'File is corrupt (checksum mismatch)' },
  'null_compressed_speed_dist.fit': {
    ok: true,
    activities: [{ sport: 'ride', n: 1808, power: true, hr: false, alt: true, indoor: true }],
  },
  // A trainer with no position or speed, but altitude noise of 0 to 4 m. It has power, so the
  // pipeline reads it as indoor from its stationary samples.
  'sample-activity-indoor-trainer.fit': {
    ok: true,
    activities: [{ sport: 'ride', n: 2264, power: true, hr: true, alt: true, indoor: true }],
  },
  'sample-activity.fit': {
    ok: true,
    activities: [{ sport: 'ride', n: 11742, power: false, hr: true, alt: true, indoor: false }],
  },
  'sample_mulitple_header.fit': {
    ok: true,
    activities: [
      { sport: 'ride', n: 4420, power: false, hr: true, alt: true, indoor: false },
      { sport: 'run', n: 2851, power: false, hr: true, alt: true, indoor: false },
    ],
  },
  'strava-android-app-201.10-b1218918.fit': {
    ok: false,
    reason: 'File is incomplete or corrupt',
  },
}

/** Files whose bytes are damaged. The Garmin SDK reads each with an error. */
const DAMAGED = [
  'activity-unexpected-eof.fit',
  'nick.fit',
  'strava-android-app-201.10-b1218918.fit',
]

function flagsOf(a: Activity): Flags {
  return {
    sport: a.sport,
    n: a.n,
    power: a.hasPower,
    hr: a.hasHeartRate,
    alt: a.hasAltitude,
    indoor: a.indoor,
  }
}

function verdictOf(result: ParseResult): Verdict {
  if (!result.ok) return { ok: false, reason: result.reason }
  return { ok: true, activities: result.activities.map(flagsOf) }
}

/** The Garmin SDK's read errors for a file. It is an independent reader. */
function sdkErrorCount(bytes: Uint8Array): number {
  return new Decoder(Stream.fromByteArray(bytes)).read().errors.length
}

describe('FIT corpus: robustness', () => {
  it('has an expectation for every file in the corpus', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(fitNames)
  })

  it.each(fitNames)('%s decodes and parses without throwing', (name) => {
    const bytes = load(name)
    expect(() => decodeFit(bytes)).not.toThrow()
    expect(() => parseFit(bytes, name)).not.toThrow()
  })

  it.each(fitNames)('%s gives the recorded verdict, sport, sample count and sensors', (name) => {
    expect(verdictOf(parseFit(load(name), name))).toEqual(EXPECTED[name])
  })

  it.each(fitNames)('%s cut short gives a clean result, never an exception', (name) => {
    const bytes = load(name)
    for (const share of [0.25, 0.5, 0.9]) {
      const result = parseFit(bytes.slice(0, Math.floor(bytes.length * share)), name)
      if (result.ok) expect(result.activities.length).toBeGreaterThan(0)
      else expect(result.reason.length).toBeGreaterThan(0)
    }
  })

  it('refuses the two named corrupt files rather than keeping part of them', () => {
    for (const name of ['activity-unexpected-eof.fit', 'activity-settings-corruptheader.fit']) {
      expect(parseFit(load(name), name).ok).toBe(false)
    }
  })

  it.each(DAMAGED)('%s is also reported as damaged by the Garmin SDK', (name) => {
    expect(sdkErrorCount(load(name))).toBeGreaterThan(0)
  })

  it('the Garmin SDK reads every file the importer accepts without error', () => {
    const accepted = fitNames.filter((name) => EXPECTED[name]?.ok === true)
    expect(accepted.length).toBeGreaterThan(0)
    for (const name of accepted) expect(sdkErrorCount(load(name)), name).toBe(0)
  })
})

/** One CSV: its header, split and trimmed, and its rows. */
interface CsvTable {
  header: string[]
  rows: string[][]
}

function readCsv(name: string): CsvTable {
  const lines = corpusText(name)
    .split(/\r?\n/)
    .filter((line) => line !== '')
  const [head = '', ...body] = lines
  return {
    header: head.split(',').map((cell) => cell.trim()),
    rows: body.map((line) => line.split(',').map((cell) => cell.trim())),
  }
}

/** The index of the first header name present, or -1. Names carry a unit where one is printed. */
function column(table: CsvTable, names: string[]): number {
  return names.map((name) => table.header.indexOf(name)).find((index) => index >= 0) ?? -1
}

function cellAt(row: string[], index: number): string {
  return index < 0 ? '' : (row[index] ?? '')
}

/** A numeric cell, or undefined where python-fitparse printed null or nothing. */
function numberCell(cell: string): number | undefined {
  return cell === '' || cell === 'null' ? undefined : Number(cell)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const ZONE_HOURS: Record<string, number> = { PDT: -7, PST: -8 }

/**
 * A timestamp cell as FIT seconds. A bare integer is already FIT time, which is how python-fitparse
 * prints a system time. Otherwise it is a local time such as "Sun Sep 25 06:00:22 PDT 2011".
 */
function fitSecondsOf(cell: string): number {
  if (/^\d+$/.test(cell)) return Number(cell)
  const parts = cell.split(' ')
  const [, month = '', day = '', clock = '', zone = '', year = ''] = parts
  const [hh = '', mm = '', ss = ''] = clock.split(':')
  const offset = ZONE_HOURS[zone]
  const monthIndex = MONTHS.indexOf(month)
  if (offset === undefined || monthIndex < 0 || parts.length !== 6) {
    throw new Error(`Unrecognised CSV timestamp: ${cell}`)
  }
  const epochMs = Date.UTC(
    Number(year),
    monthIndex,
    Number(day),
    Number(hh) - offset,
    Number(mm),
    Number(ss),
  )
  return epochMs / 1000 - FIT_EPOCH_OFFSET_S
}

/** A record with a field beyond its timestamp. Records with only a timestamp are not in the CSV. */
function carriesData(record: DecodedRecord): boolean {
  return (Object.keys(record) as Array<keyof DecodedRecord>).some(
    (key) => key !== 'timestampMs' && key !== 'timestampS' && record[key] !== undefined,
  )
}

/*
 * Tolerances for the differential decode. Each is the resolution of the FIT field, or half the last
 * digit python-fitparse prints, and never wider.
 */
/** Speed: FIT resolves 1 mm/s, and python-fitparse prints metres per second to the millimetre. */
const SPEED_TOLERANCE_MS = 0.0005
/** Distance: FIT resolves 1 cm, and python-fitparse prints it to the centimetre. */
const DISTANCE_TOLERANCE_M = 0.005
/** Altitude: FIT resolves 0.2 m. This allows only float rounding in the scale and offset. */
const ALTITUDE_TOLERANCE_M = 1e-6

/**
 * Where python-fitparse's CSV and our records differ in shape, and why. The counts are asserted, so
 * a change in either decoder shows up here.
 */
const CSV_GAPS: Record<string, { timeOnly: number; carriedPositions: number; why: string }> = {
  'compressed-speed-distance-records.csv': {
    timeOnly: 1,
    carriedPositions: 0,
    why: 'the first record holds only a timestamp, and the CSV starts at the second record',
  },
  'garmin-edge-500-activity-records.csv': {
    timeOnly: 0,
    carriedPositions: 9,
    why: 'nine records have no position, and the CSV repeats the previous position in them',
  },
}
const NO_GAPS = { timeOnly: 0, carriedPositions: 0, why: '' }

describe('FIT corpus: differential decode against python-fitparse', () => {
  it.each(csvNames)('%s agrees with decodeFit record by record', (csvName) => {
    const table = readCsv(csvName)
    const records = decodeFit(load(csvName.replace('-records.csv', '.fit'))).messages.records
    const gaps = CSV_GAPS[csvName] ?? NO_GAPS
    const withData = records.filter(carriesData)
    expect(records.length - withData.length, 'records with only a timestamp').toBe(gaps.timeOnly)
    expect(withData.length, 'records and CSV rows').toBe(table.rows.length)

    const time = column(table, ['timestamp', 'Timestamp'])
    const hr = column(table, ['heart_rate', 'Heart Rate [bpm]'])
    const speed = column(table, ['speed', 'Speed [m/s]'])
    const distance = column(table, ['distance', 'Distance [m]'])
    const altitude = column(table, ['altitude'])
    const lat = column(table, ['position_lat'])
    const lon = column(table, ['position_long'])
    expect(time, 'a timestamp column').toBeGreaterThanOrEqual(0)

    const mismatches: string[] = []
    let compared = 0
    let carried = 0
    let worstSpeed = 0
    let worstDistance = 0
    let worstAltitude = 0
    let previousLat = ''
    let previousLon = ''
    table.rows.forEach((row, k) => {
      const r = withData[k]
      if (r === undefined) throw new Error(`no record for row ${k}`)
      const at = `row ${k}`
      compared++
      if (r.timestampS !== fitSecondsOf(cellAt(row, time))) {
        mismatches.push(`${at} time: ${r.timestampS} vs ${cellAt(row, time)}`)
      }
      if (hr >= 0 && numberCell(cellAt(row, hr)) !== r.heartRate) {
        mismatches.push(`${at} heart rate: ${r.heartRate} vs ${cellAt(row, hr)}`)
      }
      const speedCsv = numberCell(cellAt(row, speed))
      if (speedCsv !== undefined) {
        const error = Math.abs((r.speed ?? NaN) - speedCsv)
        worstSpeed = Math.max(worstSpeed, error)
        if (!(error <= SPEED_TOLERANCE_MS))
          mismatches.push(`${at} speed: ${r.speed} vs ${speedCsv}`)
      }
      const distanceCsv = numberCell(cellAt(row, distance))
      if (distanceCsv !== undefined) {
        const error = Math.abs((r.distance ?? NaN) - distanceCsv)
        worstDistance = Math.max(worstDistance, error)
        if (!(error <= DISTANCE_TOLERANCE_M)) {
          mismatches.push(`${at} distance: ${r.distance} vs ${distanceCsv}`)
        }
      }
      const altitudeCsv = numberCell(cellAt(row, altitude))
      if (altitudeCsv !== undefined) {
        const error = Math.abs((r.altitude ?? NaN) - altitudeCsv)
        worstAltitude = Math.max(worstAltitude, error)
        if (!(error <= ALTITUDE_TOLERANCE_M)) {
          mismatches.push(`${at} altitude: ${r.altitude} vs ${altitudeCsv}`)
        }
      }
      // A position the record lacks must be the one the CSV repeats from the record before. A CSV
      // without position columns has nothing to compare.
      const latCell = cellAt(row, lat)
      const lonCell = cellAt(row, lon)
      if (lat >= 0 && r.positionLat !== undefined) {
        if (numberCell(latCell) !== r.positionLat) mismatches.push(`${at} latitude`)
        if (numberCell(lonCell) !== r.positionLong) mismatches.push(`${at} longitude`)
        previousLat = latCell
        previousLon = lonCell
      } else if (lat >= 0) {
        carried++
        if (latCell !== previousLat || lonCell !== previousLon) {
          mismatches.push(`${at} position is neither present nor carried forward`)
        }
      }
    })
    expect(mismatches.slice(0, 10), `${mismatches.length} mismatches`).toEqual([])
    expect(carried, 'positions carried forward by the CSV').toBe(gaps.carriedPositions)
    expect(compared).toBe(table.rows.length)
  })
})

/** The device summaries that the pipeline output is compared with. */
type Check = 'distance' | 'timer' | 'heart-rate' | 'power'

/** Sport of a device session the importer keeps, or undefined for one it does not. */
function sportOf(session: DecodedSession): Sport | undefined {
  if (session.sport === 'running') return 'run'
  if (session.sport === 'cycling') return 'ride'
  return undefined
}

function sessionStartMs(session: DecodedSession): number {
  if (session.startTimeMs !== undefined) return session.startTimeMs
  return (session.timestampMs ?? 0) - (session.totalElapsedTime ?? 0) * 1000
}

/** Each activity with the device session it came from: the same sport, the nearest start. */
function pairActivities(
  activities: Activity[],
  sessions: DecodedSession[],
): Array<[Activity, DecodedSession]> {
  const taken = new Set<DecodedSession>()
  const pairs: Array<[Activity, DecodedSession]> = []
  for (const activity of activities) {
    let best: DecodedSession | undefined
    let bestGap = Infinity
    for (const session of sessions) {
      if (taken.has(session) || sportOf(session) !== activity.sport) continue
      const gap = Math.abs(sessionStartMs(session) - activity.startMs)
      if (gap < bestGap) {
        best = session
        bestGap = gap
      }
    }
    if (best !== undefined) {
      taken.add(best)
      pairs.push([activity, best])
    }
  }
  return pairs
}

function mean(values: number[]): number {
  return values.length === 0 ? NaN : values.reduce((sum, v) => sum + v, 0) / values.length
}

/** Samples the device was recording: not paused, and with a value. */
function recordedValues(a: Activity, values: Float64Array): number[] {
  const out: number[] = []
  for (let i = 0; i < a.n; i++) {
    const v = values[i] ?? NaN
    if ((a.paused[i] ?? 0) === 0 && Number.isFinite(v)) out.push(v)
  }
  return out
}

/** The grid seconds at which the device wrote a power value. */
function powerSeen(a: Activity, records: DecodedRecord[]): Uint8Array {
  const seen = new Uint8Array(a.n)
  for (const r of records) {
    if (r.power === undefined || r.timestampMs === undefined) continue
    const i = Math.round((r.timestampMs - a.startMs) / 1000)
    if (i >= 0 && i < a.n) seen[i] = 1
  }
  return seen
}

/**
 * Power over the timer as the device averages it. FIT avg_power is total_power / total_timer_time,
 * so a timer second with no power value adds nothing to the total and counts as zero. Our grid
 * interpolates gaps of up to 10 s (resample.ts), so those seconds are set back to zero here.
 */
function powerOnTimer(a: Activity, seen: Uint8Array): number[] {
  const out: number[] = []
  for (let i = 0; i < a.n; i++) {
    if (a.paused[i] === 1) continue
    const p = a.power[i] ?? NaN
    out.push(seen[i] === 1 && Number.isFinite(p) ? p : 0)
  }
  return out
}

interface Comparison {
  check: Check
  device: number
  ours: number
  /** Ours less the device: percent for distance and power, metres for a zero distance, s or bpm. */
  diff: number
  pass: boolean
}

/**
 * Compares one activity with its device session. Tolerances:
 * - distance within 1%: the last cumulative sample against the device's total. A device total of
 *   zero must have under a metre here.
 * - timer within the larger of 10 s and 2%: the device and the 1 Hz grid can start and stop a pause
 *   a second or two apart, and a few such edges add up.
 * - mean heart rate within 2 bpm: both average the same recorded samples over the timer.
 * - mean power within 3%, on the device's convention: a timer second with no power value is zero.
 *   See powerOnTimer.
 */
function compare(a: Activity, s: DecodedSession, seen: Uint8Array): Comparison[] {
  const out: Comparison[] = []
  if (s.totalDistance !== undefined) {
    const ours = a.distance[a.n - 1] ?? NaN
    if (s.totalDistance === 0) {
      out.push({ check: 'distance', device: 0, ours, diff: ours, pass: ours < 1 })
    } else {
      const pct = ((ours - s.totalDistance) / s.totalDistance) * 100
      out.push({
        check: 'distance',
        device: s.totalDistance,
        ours,
        diff: pct,
        pass: Math.abs(pct) <= 1,
      })
    }
  }
  if (s.totalTimerTime !== undefined) {
    const ours = a.n - a.paused.reduce((sum, p) => sum + p, 0)
    const diff = ours - s.totalTimerTime
    const allowed = Math.max(10, 0.02 * s.totalTimerTime)
    out.push({
      check: 'timer',
      device: s.totalTimerTime,
      ours,
      diff,
      pass: Math.abs(diff) <= allowed,
    })
  }
  if (s.avgHeartRate !== undefined && a.hasHeartRate) {
    const ours = mean(recordedValues(a, a.heartRate))
    const diff = ours - s.avgHeartRate
    out.push({ check: 'heart-rate', device: s.avgHeartRate, ours, diff, pass: Math.abs(diff) <= 2 })
  }
  if (s.avgPower !== undefined && a.hasPower) {
    const ours = mean(powerOnTimer(a, seen))
    const pct = ((ours - s.avgPower) / s.avgPower) * 100
    out.push({ check: 'power', device: s.avgPower, ours, diff: pct, pass: Math.abs(pct) <= 3 })
  }
  return out
}

const acceptedNames = fitNames.filter((name) => EXPECTED[name]?.ok === true)

describe('FIT corpus: pipeline against the device session summaries', () => {
  it.each(acceptedNames)('%s matches its device summaries within tolerance', (name) => {
    const bytes = load(name)
    const result = parseFit(bytes, name)
    if (!result.ok) throw new Error(result.reason)
    const decoded = decodeFit(bytes).messages
    const pairs = pairActivities(result.activities, decoded.sessions)
    expect(pairs.length, 'every activity has a device session').toBe(result.activities.length)
    const failures: string[] = []
    for (const [activity, session] of pairs) {
      const seen = powerSeen(activity, decoded.records)
      for (const comparison of compare(activity, session, seen)) {
        if (!comparison.pass) {
          failures.push(
            `${activity.sport} ${comparison.check}: device ${comparison.device}, ours ${comparison.ours}, diff ${comparison.diff}`,
          )
        }
      }
    }
    expect(failures).toEqual([])
  })

  it('averages power over the timer with zeros, as the device does', () => {
    // Summed over the corpus, zeros included are closer to the device than the powered seconds
    // alone. Per file that is not always so: the indoor trainer's device value lies between them.
    let filesWithPower = 0
    let errorWithZeros = 0
    let errorWithoutZeros = 0
    for (const name of acceptedNames) {
      const bytes = load(name)
      const result = parseFit(bytes, name)
      if (!result.ok) throw new Error(result.reason)
      const decoded = decodeFit(bytes).messages
      for (const [activity, session] of pairActivities(result.activities, decoded.sessions)) {
        if (session.avgPower === undefined || !activity.hasPower) continue
        filesWithPower++
        const device = session.avgPower
        const onTimer = powerOnTimer(activity, powerSeen(activity, decoded.records))
        errorWithZeros += Math.abs(mean(onTimer) - device)
        errorWithoutZeros += Math.abs(mean(onTimer.filter((v) => v > 0)) - device)
      }
    }
    expect(filesWithPower).toBeGreaterThan(2)
    expect(errorWithZeros).toBeLessThanOrEqual(errorWithoutZeros)
  })
})
