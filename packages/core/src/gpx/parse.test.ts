import { describe, expect, it } from 'vitest'
import type { Activity, Sport } from '../types'
import { digestActivity } from '../digest'
import { encodeFit } from '../fit/encode'
import { parseFit } from '../fit/parse'
import { DEFAULT_PARSE_LIMITS } from '../import/result'
import type { ParseResult } from '../import/result'
import { generatedName } from '../import/names'
import { encodeGpx } from './encode'
import { parseGpx } from './parse'
import { parseIsoTime } from '../import/time'

const START_MS = Date.UTC(2024, 4, 1, 7, 30, 0)
const HOUR = 3_600_000
const E_BIKE = 'E-bike activities are not supported because motor assistance hides your own power'
const HEADER =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1"' +
  ' xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">'

interface FixtureOptions {
  withPower?: boolean
  /** Indexes in [pauseFrom, pauseTo) are paused: speed and power 0, no heart rate. */
  pauseFrom?: number
  pauseTo?: number
}

/** Deterministic activity whose values sit on the FIT field grid, so they survive a round trip. */
function makeActivity(sport: Sport, n: number, options: FixtureOptions = {}): Activity {
  const { withPower = true, pauseFrom = 0, pauseTo = 0 } = options
  const speed = new Float64Array(n)
  const distance = new Float64Array(n)
  const altitude = new Float64Array(n)
  const heartRate = new Float64Array(n)
  const power = new Float64Array(n)
  const paused = new Uint8Array(n)
  let total = 0
  for (let i = 0; i < n; i++) {
    const isPaused = i >= pauseFrom && i < pauseTo
    const v = isPaused ? 0 : 4 + (i % 7) * 0.25
    speed[i] = v
    total += v
    distance[i] = total
    altitude[i] = 100 + i * 0.2
    paused[i] = isPaused ? 1 : 0
    heartRate[i] = isPaused ? NaN : 120 + (i % 30)
    power[i] = withPower ? (isPaused ? 0 : 200 + (i % 50)) : NaN
  }
  return {
    id: 'fixture',
    name: 'fixture',
    sport,
    startMs: START_MS,
    n,
    speed,
    distance,
    altitude,
    heartRate,
    power,
    paused,
    hasPower: withPower,
    hasHeartRate: true,
    hasAltitude: true,
    indoor: false,
  }
}

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

/** Parses bytes that must succeed and returns the first activity. */
function firstActivity(result: ParseResult): Activity {
  if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`)
  const [activity] = result.activities
  if (activity === undefined) throw new Error('expected at least one activity')
  return activity
}

/** Parses bytes that must fail and returns the reason. */
function reasonOf(result: ParseResult): string {
  if (result.ok) throw new Error('expected a failure')
  return result.reason
}

/** One trkpt, moving north at `speed` m/s, `i` seconds after `startMs`. */
function trkpt(i: number, extra: { speed?: number; startMs?: number; ext?: string } = {}): string {
  const speed = extra.speed ?? 3
  const lat = (51 + (speed * i) / 111_195).toFixed(9)
  const time = new Date((extra.startMs ?? START_MS) + i * 1000).toISOString()
  return `<trkpt lat="${lat}" lon="-0.100000000"><ele>20</ele><time>${time}</time>${extra.ext ?? ''}</trkpt>`
}

function points(count: number, extra: Parameters<typeof trkpt>[1] = {}): string[] {
  return Array.from({ length: count }, (_, i) => trkpt(i, extra))
}

function garmin(hr: number, power?: number): string {
  const powerXml = power === undefined ? '' : `<power>${power}</power>`
  return (
    `<extensions>${powerXml}<gpxtpx:TrackPointExtension>` +
    `<gpxtpx:hr>${hr}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>`
  )
}

function track(type: string | undefined, segments: string[][], name?: string): string {
  const nameXml = name === undefined ? '' : `<name>${name}</name>`
  const typeXml = type === undefined ? '' : `<type>${type}</type>`
  const body = segments.map((pts) => `<trkseg>${pts.join('')}</trkseg>`).join('')
  return `<trk>${nameXml}${typeXml}${body}</trk>`
}

function gpxFile(...tracks: string[]): Uint8Array {
  return bytes(`${HEADER}${tracks.join('')}</gpx>`)
}

describe('parseGpx round trip', () => {
  it('reproduces a ride with power and heart rate', () => {
    const original = makeActivity('ride', 120)
    const result = parseGpx(encodeGpx(original), 'Morning Ride.gpx')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.activities.length).toBe(1)
    expect(result.skipped).toEqual([])

    const a = result.activities[0]!
    expect(a.sport).toBe('ride')
    expect(a.indoor).toBe(false)
    expect(a.name).toBe(generatedName(START_MS, 'ride'))
    expect(a.startMs).toBe(START_MS)
    expect(a.n).toBe(original.n)
    expect(a.hasPower).toBe(true)
    expect(a.hasHeartRate).toBe(true)
    expect(a.hasAltitude).toBe(true)
    const covered = coveredDistance(original, 119)
    expect(Math.abs(a.distance[119]! - covered) / covered).toBeLessThanOrEqual(0.005)
    expect(Array.from(a.heartRate)).toEqual(Array.from(original.heartRate))
    expect(Array.from(a.power)).toEqual(Array.from(original.power))
    expect(Array.from(a.paused)).toEqual(Array.from(original.paused))
    expect(maxAbsDiff(a.altitude, original.altitude)).toBeLessThanOrEqual(0.001)
  })

  it('reproduces a run without power', () => {
    const original = makeActivity('run', 90, { withPower: false })
    const a = firstActivity(parseGpx(encodeGpx(original), 'tempo.gpx'))
    expect(a.sport).toBe('run')
    expect(a.name).toBe(generatedName(START_MS, 'run'))
    expect(a.n).toBe(90)
    expect(a.hasPower).toBe(false)
    expect(a.power.every((v) => Number.isNaN(v))).toBe(true)
    expect(Array.from(a.heartRate)).toEqual(Array.from(original.heartRate))
    const covered = coveredDistance(original, 89)
    expect(Math.abs(a.distance[89]! - covered) / covered).toBeLessThanOrEqual(0.005)
  })

  it('keeps a pause longer than the gap limit as a paused stretch', () => {
    const original = makeActivity('ride', 300, { pauseFrom: 120, pauseTo: 180 })
    const a = firstActivity(parseGpx(encodeGpx(original), 'paused.gpx'))
    expect(a.n).toBe(300)
    expect(Array.from(a.paused)).toEqual(Array.from(original.paused))
    expect(a.power[150]).toBe(0)
    expect(Number.isNaN(a.heartRate[150])).toBe(true)
    // Distance is the integral of smoothed GPS speed, so it is a relative check, not exact.
    const covered = coveredDistance(original, 150)
    expect(Math.abs(a.distance[150]! - covered) / covered).toBeLessThanOrEqual(0.005)
  })

  it('digests match the FIT form of the same activity', () => {
    for (const sport of ['ride', 'run'] as const) {
      const original = makeActivity(sport, 600, { withPower: sport === 'ride' })
      const fromFit = firstActivity(parseFit(encodeFit(original), 'a.fit'))
      const fromGpx = firstActivity(parseGpx(encodeGpx(original), 'a.gpx'))
      const fit = digestActivity(fromFit)
      const gpx = digestActivity(fromGpx)

      expect(gpx.durationS).toBe(fit.durationS)
      expect(gpx.hasHeartRate).toBe(fit.hasHeartRate)
      // The first second's movement (distance[0]) is before the first trackpoint, so GPX lacks it.
      expect(Math.abs(gpx.distanceM - fit.distanceM) / fit.distanceM).toBeLessThanOrEqual(0.01)
      expect(gpx.curve.length).toBe(fit.curve.length)
      gpx.curve.forEach((point, k) => {
        const reference = fit.curve[k]!
        if (Number.isNaN(reference.value)) {
          expect(Number.isNaN(point.value)).toBe(true)
          return
        }
        // GPS speed is a 20 s centred difference (import/gps.ts), so runs shorter than 30 s are
        // smoothed away from the per-second FIT speed and are not compared. Rides use power.
        if (sport === 'run' && reference.durationS < 30) return
        const relative = Math.abs(point.value - reference.value) / Math.abs(reference.value)
        expect(relative, `${sport} ${reference.durationS}s`).toBeLessThanOrEqual(0.01)
      })
    }
  })
})

describe('parseGpx mapping', () => {
  it('reads a Strava-style file: type 9 and no extensions', () => {
    const file = gpxFile(track('9', [points(120)]))
    const a = firstActivity(parseGpx(file, 'lunch.gpx'))
    expect(a.sport).toBe('run')
    expect(a.hasHeartRate).toBe(false)
    expect(a.hasPower).toBe(false)
    expect(a.hasAltitude).toBe(true)
    expect(a.n).toBe(120)
    expect(a.speed[60]).toBeCloseTo(3, 1)
  })

  it('reads Garmin heart rate and the power extensions', () => {
    const pts = Array.from({ length: 120 }, (_, i) => trkpt(i, { ext: garmin(140 + (i % 5), 210) }))
    const a = firstActivity(parseGpx(gpxFile(track('cycling', [pts])), 'ride.gpx'))
    expect(a.sport).toBe('ride')
    expect(a.hasHeartRate).toBe(true)
    expect(a.heartRate[12]).toBe(142)
    expect(a.hasPower).toBe(true)
    expect(a.power[10]).toBe(210)
  })

  it('reads PowerInWatts from any namespace prefix', () => {
    const ext = '<extensions><ns3:PowerInWatts>180</ns3:PowerInWatts></extensions>'
    const a = firstActivity(parseGpx(gpxFile(track('biking', [points(120, { ext })])), 'p.gpx'))
    expect(a.hasPower).toBe(true)
    expect(a.power[5]).toBe(180)
  })

  it('ignores negative and non-finite heart rate and power', () => {
    const ext =
      '<extensions><power>-4</power><gpxtpx:TrackPointExtension>' +
      '<gpxtpx:hr>NaN</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>'
    const a = firstActivity(parseGpx(gpxFile(track('cycling', [points(120, { ext })])), 'bad.gpx'))
    expect(a.hasHeartRate).toBe(false)
    expect(a.hasPower).toBe(false)
  })

  it('keeps negative altitude, which is below sea level', () => {
    const pts = Array.from({ length: 120 }, (_, i) =>
      trkpt(i).replace('<ele>20</ele>', '<ele>-430</ele>'),
    )
    const a = firstActivity(parseGpx(gpxFile(track('running', [pts])), 'dead-sea.gpx'))
    expect(a.altitude[30]).toBe(-430)
  })

  it('skips points without a time and reports them as dropped', () => {
    const untimed = Array.from({ length: 5 }, (_, i) =>
      trkpt(200 + i).replace(/<time>[^<]*<\/time>/, ''),
    )
    const result = parseGpx(gpxFile(track('running', [[...points(120), ...untimed]])), 'mixed.gpx')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.activities[0]!.n).toBe(120)
    expect(result.droppedValues).toBe(5)
  })

  it('fails with no records when no point has a time', () => {
    const untimed = Array.from({ length: 120 }, (_, i) =>
      trkpt(i).replace(/<time>[^<]*<\/time>/, ''),
    )
    const result = parseGpx(gpxFile(track('running', [untimed])), 'untimed.gpx')
    expect(reasonOf(result)).toBe('File contains no activity records')
  })

  it('sorts unsorted points and drops a duplicate time', () => {
    const ordered = points(120)
    const reversed = [...ordered].reverse()
    // A second point at time 50 s with a different position: the same time, so it is dropped.
    const duplicate = trkpt(50, { speed: 9 })
    const sorted = firstActivity(parseGpx(gpxFile(track('running', [ordered])), 'sorted.gpx'))
    const shuffled = parseGpx(gpxFile(track('running', [[...reversed, duplicate]])), 'shuffled.gpx')
    expect(shuffled.ok).toBe(true)
    if (!shuffled.ok) return
    expect(shuffled.droppedValues).toBe(1)
    const a = shuffled.activities[0]!
    expect(a.n).toBe(120)
    expect(Array.from(a.distance)).toEqual(Array.from(sorted.distance))
  })

  it('takes each track as one activity, with its own sport', () => {
    const result = parseGpx(
      gpxFile(
        track('running', [points(120)]),
        track('cycling', [points(120, { startMs: START_MS + HOUR })]),
      ),
      'multi.gpx',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.activities.map((a) => a.sport)).toEqual(['run', 'ride'])
    expect(result.activities[0]!.id).toMatch(/#0$/)
    expect(result.activities[1]!.id).toMatch(/#1$/)
    expect(result.activities.map((a) => a.name)).toEqual([
      generatedName(START_MS, 'run'),
      generatedName(START_MS + HOUR, 'ride'),
    ])
  })

  it('joins the segments of one track, and a long gap between them is paused', () => {
    const first = points(120, { speed: 3 })
    const second = Array.from({ length: 60 }, (_, i) => trkpt(180 + i, { speed: 3 }))
    const a = firstActivity(parseGpx(gpxFile(track('running', [first, second])), 'segments.gpx'))
    expect(a.n).toBe(240)
    expect(a.paused.reduce((sum, v) => sum + v, 0)).toBe(60)
    expect(a.paused[150]).toBe(1)
    expect(a.paused[100]).toBe(0)
  })

  it('refuses an unknown sport with the sport in the reason', () => {
    const result = parseGpx(gpxFile(track('swimming', [points(120)])), 'swim.gpx')
    expect(reasonOf(result)).toBe('Unsupported sport: swimming')
  })

  it('refuses a track with no type, naming the file creator, rather than guessing', () => {
    const result = parseGpx(gpxFile(track(undefined, [points(120)])), 'untyped.gpx')
    expect(reasonOf(result)).toBe(
      'This GPX file does not say whether it is a run or a ride (creator: test)',
    )
  })

  it('refuses a track with no type and no creator with the plain message', () => {
    const file = bytes(
      `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">` +
        `${track(undefined, [points(120)])}</gpx>`,
    )
    expect(reasonOf(parseGpx(file, 'bare.gpx'))).toBe(
      'This GPX file does not say whether it is a run or a ride',
    )
  })

  it.each([
    'e-bike',
    'E-Bike',
    'ebikeride',
    'e_bike_ride',
    'e-bike ride',
    'eBiking',
    'eBikeFitness',
    'E-Mountain Bike Ride',
  ])('refuses the e-bike type %s with the FIT message', (type) => {
    const result = parseGpx(gpxFile(track(type, [points(120)])), 'ebike.gpx')
    expect(reasonOf(result)).toBe(E_BIKE)
  })

  it('keeps the run when an e-bike track sits beside it', () => {
    const result = parseGpx(
      gpxFile(track('e-bike', [points(120)]), track('running', [points(120)])),
      'mixed-sports.gpx',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.activities.map((a) => a.sport)).toEqual(['run'])
    expect(result.skipped).toContain('e-bike session skipped')
  })

  it('maps virtual_ride to an indoor ride', () => {
    const a = firstActivity(parseGpx(gpxFile(track('virtual_ride', [points(120)])), 'zwift.gpx'))
    expect(a.sport).toBe('ride')
    expect(a.indoor).toBe(true)
  })

  it('treats a biking track with no position and no altitude as indoor', () => {
    const pts = Array.from({ length: 120 }, (_, i) => {
      const time = new Date(START_MS + i * 1000).toISOString()
      return `<trkpt lat="" lon=""><time>${time}</time></trkpt>`
    })
    const a = firstActivity(parseGpx(gpxFile(track('biking', [pts])), 'trainer.gpx'))
    expect(a.sport).toBe('ride')
    expect(a.indoor).toBe(true)
  })

  it('treats a biking track whose points are all (0,0) as indoor, as one with no position', () => {
    const pts = Array.from({ length: 120 }, (_, i) => {
      const time = new Date(START_MS + i * 1000).toISOString()
      return `<trkpt lat="0" lon="0"><time>${time}</time></trkpt>`
    })
    const a = firstActivity(parseGpx(gpxFile(track('biking', [pts])), 'placeholder.gpx'))
    expect(a.sport).toBe('ride')
    expect(a.indoor).toBe(true)
    expect(a.route).toBeUndefined()
  })

  it('keeps a biking track with real positions outdoor, with its route', () => {
    const a = firstActivity(parseGpx(gpxFile(track('biking', [points(120)])), 'outdoor.gpx'))
    expect(a.indoor).toBe(false)
    expect(a.route?.points.length).toBeGreaterThanOrEqual(2)
  })

  it('matches the type text case-insensitively and accepts the numeric type 1 as a ride', () => {
    const a = firstActivity(parseGpx(gpxFile(track(' RIDE ', [points(120)])), 'a.gpx'))
    expect(a.sport).toBe('ride')
    const b = firstActivity(parseGpx(gpxFile(track('1', [points(120)])), 'b.gpx'))
    expect(b.sport).toBe('ride')
  })

  it('fails with a clear reason for a file shorter than one minute', () => {
    const result = parseGpx(gpxFile(track('running', [points(30)])), 'short.gpx')
    expect(reasonOf(result)).toBe('Activity is shorter than one minute')
  })

  it('uses the injected clock for the date check', () => {
    const result = parseGpx(gpxFile(track('running', [points(120)])), 'old.gpx', undefined, {
      nowMs: Date.UTC(2020, 0, 1),
    })
    expect(reasonOf(result)).toBe('Activity date is not plausible')
  })
})

describe('parseGpx names', () => {
  it('names an activity from its track name', () => {
    const file = gpxFile(track('cycling', [points(120)], 'Sunday Long Ride'))
    expect(firstActivity(parseGpx(file, 'ride.gpx')).name).toBe('Sunday Long Ride')
  })

  it('names each track of a file by its own name', () => {
    const later = { startMs: START_MS + 3 * HOUR }
    const file = gpxFile(
      track('cycling', [points(120)], 'Out'),
      track('cycling', [points(120, later)], 'Back'),
    )
    const result = parseGpx(file, 'two.gpx')

    if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`)
    expect(result.activities.map((a) => a.name)).toEqual(['Out', 'Back'])
  })

  it('generates the name when the track carries a name a device writes by default', () => {
    const file = gpxFile(track('cycling', [points(120)], 'ACTIVE LOG'))
    expect(firstActivity(parseGpx(file, 'log.gpx')).name).toBe(generatedName(START_MS, 'ride'))
  })

  it('names a run from the local clock of its start, as a literal name', () => {
    // Built from local clock time, so the name is the same in every time zone.
    const start = new Date(2025, 4, 15, 6, 11).getTime()
    const file = gpxFile(track('running', [points(120, { startMs: start })]))
    expect(firstActivity(parseGpx(file, 'run.gpx')).name).toBe('Morning Run')
  })
})

describe('parseGpx errors', () => {
  it('returns a parse error for a file of only whitespace', () => {
    const result = parseGpx(bytes('   \n\t  \r\n'), 'blank.gpx')
    expect(reasonOf(result)).toBe('Not a GPX file')
  })

  it('returns a parse error for garbage bytes', () => {
    const result = parseGpx(bytes('<<not xml & at all'), 'garbage.gpx')
    expect(result.ok).toBe(false)
  })

  it('rejects a document whose root is not gpx', () => {
    const result = parseGpx(bytes('<kml><trk/></kml>'), 'other.gpx')
    expect(reasonOf(result)).toBe('Not a GPX file')
  })

  it('refuses a file over the byte limit', () => {
    const result = parseGpx(gpxFile(track('running', [points(120)])), 'big.gpx', {
      ...DEFAULT_PARSE_LIMITS,
      maxFileBytes: 100,
    })
    expect(reasonOf(result)).toBe('GPX file exceeds the 100-byte limit')
  })

  it('refuses a file over the record limit', () => {
    const result = parseGpx(gpxFile(track('running', [points(120)])), 'many.gpx', {
      ...DEFAULT_PARSE_LIMITS,
      maxRecordMessages: 100,
    })
    expect(reasonOf(result)).toBe('GPX file exceeds the 100-record limit')
  })

  it('never throws on an empty byte array', () => {
    expect(parseGpx(new Uint8Array(0), 'empty.gpx').ok).toBe(false)
  })
})

/**
 * Distance covered from the first trackpoint to sample i. A GPX track measures from its first
 * point, so the first second's movement, distance[0], is not part of it.
 */
function coveredDistance(activity: Activity, i: number): number {
  return activity.distance[i]! - activity.distance[0]!
}

function maxAbsDiff(a: Float64Array, b: Float64Array): number {
  let worst = 0
  for (let i = 0; i < a.length; i++) {
    worst = Math.max(worst, Math.abs(a[i]! - b[i]!))
  }
  return worst
}

/** A one-second track `speed` m/s north of the start, with no heart rate or power. */
function constantRun(n: number, speed: number): Activity {
  return {
    id: 'constant',
    name: 'constant',
    sport: 'run',
    startMs: START_MS,
    n,
    speed: new Float64Array(n).fill(speed),
    distance: Float64Array.from({ length: n }, (_, i) => speed * i),
    altitude: new Float64Array(n),
    heartRate: new Float64Array(n).fill(NaN),
    power: new Float64Array(n).fill(NaN),
    paused: new Uint8Array(n),
    hasPower: false,
    hasHeartRate: false,
    hasAltitude: true,
    indoor: false,
  }
}

/** One trkpt at `seconds` after START_MS with explicit coordinates. Times may be fractional. */
function fixText(seconds: number, lat: string, lon: string): string {
  const time = new Date(START_MS + seconds * 1000).toISOString()
  return `<trkpt lat="${lat}" lon="${lon}"><time>${time}</time></trkpt>`
}

/** `count` trkpts 1 s apart at 3 m/s north, with the time text from `timeText`. */
function timedPoints(count: number, timeText: (i: number) => string): string[] {
  return Array.from({ length: count }, (_, i) => {
    const lat = (51 + (3 * i) / 111_195).toFixed(9)
    return `<trkpt lat="${lat}" lon="-0.100000000"><ele>20</ele><time>${timeText(i)}</time></trkpt>`
  })
}

/** The result, which must be a success. */
function okOf(result: ParseResult) {
  if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`)
  return result
}

/** The largest distance covered in any window of `windowS` seconds, in m/s. */
function bestWindowSpeed(distance: Float64Array, windowS: number): number {
  let best = 0
  for (let i = 0; i + windowS < distance.length; i++) {
    best = Math.max(best, (distance[i + windowS]! - distance[i]!) / windowS)
  }
  return best
}

describe('parseGpx GPS fixes', () => {
  it('ignores a (0,0) fix in the middle of a run instead of adding thousands of km', () => {
    const base = points(600, { speed: 3 })
    const withZero = [...base.slice(0, 300), fixText(300.5, '0', '0'), ...base.slice(300)]
    const result = okOf(parseGpx(gpxFile(track('running', [withZero])), 'zero.gpx'))
    const a = result.activities[0]!
    expect(Math.abs(a.distance[599]! - 3 * 599) / (3 * 599)).toBeLessThan(0.005)
    expect(result.droppedValues).toBe(1)
  })

  it('ignores a 500 m outlier in the middle of a run', () => {
    const base = points(600, { speed: 3 })
    const spike = fixText(300.5, (51 + 1400 / 111_195).toFixed(9), '-0.100000000')
    const result = okOf(
      parseGpx(
        gpxFile(track('running', [[...base.slice(0, 300), spike, ...base.slice(300)]])),
        'spike.gpx',
      ),
    )
    const a = result.activities[0]!
    expect(Math.abs(a.distance[599]! - 3 * 599) / (3 * 599)).toBeLessThan(0.005)
    expect(result.droppedValues).toBe(1)
  })
})

describe('parseGpx GPS noise', () => {
  it('reports no motion for 30 min standing still with 2.5 m noise', () => {
    const still = constantRun(1800, 0)
    const bytes = encodeGpx(still, { type: 'running', noise: { sigmaM: 2.5, seed: 11 } })
    const a = okOf(parseGpx(bytes, 'still.gpx')).activities[0]!
    expect(a.distance[a.n - 1]!).toBeLessThan(100)
    expect(bestWindowSpeed(a.distance, 60)).toBeLessThan(1)
  })

  it('keeps distance within 2% and the best 60 s speed within 3% for 3 m/s with 2.5 m noise', () => {
    const run = constantRun(1800, 3)
    const bytes = encodeGpx(run, { type: 'running', noise: { sigmaM: 2.5, seed: 12 } })
    const a = okOf(parseGpx(bytes, 'noisy.gpx')).activities[0]!
    const expected = 3 * 1799
    expect(Math.abs(a.distance[a.n - 1]! - expected) / expected).toBeLessThan(0.02)
    expect(Math.abs(bestWindowSpeed(a.distance, 60) - 3) / 3).toBeLessThan(0.03)
  })
})

describe('parseGpx coordinates', () => {
  it('treats a hexadecimal coordinate as missing, as the XML decimal type does', () => {
    const moving = Array.from(
      { length: 120 },
      (_, i) =>
        `<trkpt lat="0x2A" lon="${(0.0001 * i).toFixed(6)}">` +
        `<time>${new Date(START_MS + i * 1000).toISOString()}</time></trkpt>`,
    )
    const a = firstActivity(parseGpx(gpxFile(track('running', [moving])), 'hex.gpx'))
    expect(a.distance[119]).toBe(0)
  })
})

describe('parseGpx times', () => {
  it.each([
    ['2024-05-01T07:30:00', Date.UTC(2024, 4, 1, 7, 30)],
    ['2024-05-01T07:30:00Z', Date.UTC(2024, 4, 1, 7, 30)],
    ['2024-05-01T08:30:00+01:00', Date.UTC(2024, 4, 1, 7, 30)],
    ['2024-05-01T05:30:00-02:00', Date.UTC(2024, 4, 1, 7, 30)],
    ['2024-05-01T07:30:00.250Z', Date.UTC(2024, 4, 1, 7, 30) + 250],
    ['2024-05-01T07:30:00.5', Date.UTC(2024, 4, 1, 7, 30) + 500],
  ])('reads %s as the instant the GPX standard means', (text, ms) => {
    expect(parseIsoTime(text, 'utc')).toBe(ms)
  })

  it.each([
    '',
    'not a time',
    '2024-05-01T07:30',
    '2024-05-01',
    '2024-02-30T07:30:00Z',
    '2024-05-01T25:00:00Z',
  ])('rejects %s', (text) => {
    expect(parseIsoTime(text, 'utc')).toBeUndefined()
  })

  it('reads a time with no zone as UTC even when the local zone is not UTC', () => {
    const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process
      ?.env
    if (env === undefined) return
    const saved = env.TZ
    env.TZ = 'America/New_York'
    try {
      // Guard: the zone change must be in effect, or the test proves nothing.
      expect(new Date(2024, 4, 1, 7, 30).getTimezoneOffset()).toBe(240)
      const zoneless = timedPoints(120, (i) =>
        new Date(START_MS + i * 1000).toISOString().slice(0, 19),
      )
      const a = okOf(parseGpx(gpxFile(track('running', [zoneless])), 'zoneless.gpx')).activities[0]!
      expect(a.startMs).toBe(START_MS)
    } finally {
      if (saved === undefined) delete env.TZ
      else env.TZ = saved
    }
  })

  it('reads Z and numeric offsets in trackpoint times', () => {
    const offset = timedPoints(120, (i) => {
      const local = new Date(START_MS + 3_600_000 + i * 1000).toISOString().slice(0, 19)
      return `${local}+01:00`
    })
    const a = okOf(parseGpx(gpxFile(track('running', [offset])), 'offset.gpx')).activities[0]!
    expect(a.startMs).toBe(START_MS)
  })
})

describe('parseGpx route shape', () => {
  it('gives the activity a route shape from its positions', () => {
    const result = parseGpx(encodeGpx(makeActivity('run', 600), { type: 'running' }), 'run.gpx')

    expect(result.ok && result.activities[0]?.route?.points.length).toBeGreaterThanOrEqual(2)
  })

  it('gives an activity without positions no route shape', () => {
    const points = Array.from(
      { length: 120 },
      (_, i) => `<trkpt><time>${new Date(START_MS + i * 1000).toISOString()}</time></trkpt>`,
    ).join('')
    const bytes = new TextEncoder().encode(
      `${HEADER}<trk><type>running</type><trkseg>${points}</trkseg></trk></gpx>`,
    )

    const result = parseGpx(bytes, 'nopos.gpx')

    expect(result.ok && result.activities.length).toBe(1)
    expect(result.ok && result.activities[0]?.route).toBeUndefined()
  })
})

/** The code and detail of a refusal. */
function refusalOf(result: ParseResult): { code: string; detail: string | undefined } {
  if (result.ok) throw new Error('expected a failure')
  return { code: result.code, detail: result.detail }
}

describe('parseGpx with the type an export list gives', () => {
  it.each([
    ['Run', 'run', false],
    ['Trail Run', 'run', false],
    ['Virtual Run', 'run', true],
    ['Ride', 'ride', false],
    ['Gravel Ride', 'ride', false],
    ['Mountain Bike Ride', 'ride', false],
    ['Virtual Ride', 'ride', true],
  ] as const)('reads a track with no type of its own as %s', (activityType, sport, indoor) => {
    const file = gpxFile(track(undefined, [points(120)]))
    const a = firstActivity(parseGpx(file, 'untyped.gpx', DEFAULT_PARSE_LIMITS, { activityType }))
    expect(a.sport).toBe(sport)
    expect(a.indoor).toBe(indoor)
  })

  it.each(['Trail Run', 'trail_running', 'TRAIL-RUN', 'trailrun'])(
    'reads the type %s, spelled with spaces, dashes or underscores, as a run',
    (type) => {
      const a = firstActivity(parseGpx(gpxFile(track(type, [points(120)])), 'trail.gpx'))
      expect(a.sport).toBe('run')
    },
  )

  it.each(['E-Bike Ride', 'E-Mountain Bike Ride'])(
    'refuses a ride the track names when the list says %s, which is the one case the list overrides',
    (activityType) => {
      for (const type of ['1', 'Ride', 'cycling']) {
        const file = gpxFile(track(type, [points(120)]))
        const result = parseGpx(file, 'ebike.gpx', DEFAULT_PARSE_LIMITS, { activityType })
        expect(refusalOf(result).code).toBe('e-bike')
      }
    },
  )

  it('keeps refusing a track with no type when the list gives none', () => {
    const file = gpxFile(track(undefined, [points(120)]))
    const result = parseGpx(file, 'untyped.gpx', DEFAULT_PARSE_LIMITS, {})
    expect(refusalOf(result).code).toBe('no-sport')
  })

  it('keeps refusing e-bike rides named by the list', () => {
    const file = gpxFile(track(undefined, [points(120)]))
    const options = { activityType: 'E-Bike Ride' }
    const result = parseGpx(file, 'untyped.gpx', DEFAULT_PARSE_LIMITS, options)
    expect(refusalOf(result).code).toBe('e-bike')
  })

  it('refuses a track with no type as the sport the list names, rather than as unsaid', () => {
    const file = gpxFile(track(undefined, [points(120)]))
    const result = parseGpx(file, 'hike.gpx', DEFAULT_PARSE_LIMITS, { activityType: 'Hike' })
    expect(refusalOf(result)).toEqual({ code: 'unsupported-sport', detail: 'Hike' })
  })

  it('keeps the sport the track names, whatever the list says', () => {
    const run = gpxFile(track('running', [points(120)]))
    const code = gpxFile(track('9', [points(120)]))
    const options = { activityType: 'Ride' }
    expect(firstActivity(parseGpx(run, 'a.gpx', DEFAULT_PARSE_LIMITS, options)).sport).toBe('run')
    expect(firstActivity(parseGpx(code, 'b.gpx', DEFAULT_PARSE_LIMITS, options)).sport).toBe('run')
  })

  it('labels a refused numeric type with the list type, and with the code when there is none', () => {
    const file = gpxFile(track('4', [points(120)]))
    const listed = parseGpx(file, 'a.gpx', DEFAULT_PARSE_LIMITS, { activityType: 'Hike' })
    expect(refusalOf(listed)).toEqual({ code: 'unsupported-sport', detail: 'Hike' })
    expect(refusalOf(parseGpx(file, 'a.gpx'))).toEqual({ code: 'unsupported-sport', detail: '4' })
  })

  it('reads a track whose type is a number the app does not know as the list says', () => {
    const file = gpxFile(track('16', [points(120)]))
    const ride = parseGpx(file, 'a.gpx', DEFAULT_PARSE_LIMITS, { activityType: 'Virtual Ride' })
    expect(firstActivity(ride).sport).toBe('ride')
    expect(firstActivity(ride).indoor).toBe(true)
    const ebike = parseGpx(file, 'a.gpx', DEFAULT_PARSE_LIMITS, { activityType: 'E-Bike Ride' })
    expect(refusalOf(ebike).code).toBe('e-bike')
  })

  it('keeps the type a track names in words, when it is not a run or a ride', () => {
    const file = gpxFile(track('hiking', [points(120)]))
    const result = parseGpx(file, 'a.gpx', DEFAULT_PARSE_LIMITS, { activityType: 'Walk' })
    expect(refusalOf(result)).toEqual({ code: 'unsupported-sport', detail: 'hiking' })
  })
})

/** Whether a refusal's sport name is the one the export's list gives. */
function listedOf(result: ParseResult): boolean | undefined {
  if (result.ok) throw new Error('expected a failure')
  return result.listed
}

describe('parseGpx: where a refused sport name came from', () => {
  const options = (activityType?: string) => ({ activityType })

  it('says the name is the list type when the track names no sport', () => {
    const file = gpxFile(track(undefined, [points(120)]))
    const result = parseGpx(file, 'a.gpx', DEFAULT_PARSE_LIMITS, options('Kayaking'))
    expect(refusalOf(result)).toEqual({ code: 'unsupported-sport', detail: 'Kayaking' })
    expect(listedOf(result)).toBe(true)
  })

  it('says it for a track that names its sport only by a number, and for an empty track', () => {
    const numbered = gpxFile(track('4', [points(120)]))
    const empty = gpxFile(track(undefined, [[]]))
    const a = parseGpx(numbered, 'a.gpx', DEFAULT_PARSE_LIMITS, options('Rock Climbing'))
    const b = parseGpx(empty, 'b.gpx', DEFAULT_PARSE_LIMITS, options('Yoga'))
    expect([refusalOf(a).detail, listedOf(a)]).toEqual(['Rock Climbing', true])
    expect([refusalOf(b).detail, listedOf(b)]).toEqual(['Yoga', true])
  })

  it('says it only for the name the list gave, not for a name the track gives or a bare number', () => {
    const listed = parseGpx(
      gpxFile(track(undefined, [points(120)])),
      'a.gpx',
      DEFAULT_PARSE_LIMITS,
      options('Kayaking'),
    )
    const own = parseGpx(
      gpxFile(track('kayaking', [points(120)])),
      'b.gpx',
      DEFAULT_PARSE_LIMITS,
      options('Walk'),
    )
    const code = parseGpx(gpxFile(track('4', [points(120)])), 'c.gpx')
    expect([listed, own, code].map(listedOf)).toEqual([true, undefined, undefined])
    expect([listed, own, code].map((result) => refusalOf(result).detail)).toEqual([
      'Kayaking',
      'kayaking',
      '4',
    ])
  })
})

describe('parseGpx with no points', () => {
  it('reports the sport of an empty track that is refused, not that it is empty', () => {
    const result = parseGpx(gpxFile(track('hiking', [[]])), 'hike.gpx')
    expect(refusalOf(result)).toEqual({ code: 'unsupported-sport', detail: 'hiking' })
  })

  it('reports an empty e-bike track as an e-bike', () => {
    const result = parseGpx(gpxFile(track('e-bike', [[]])), 'ebike.gpx')
    expect(refusalOf(result).code).toBe('e-bike')
  })

  it('reports the sport the list names for an empty track with none of its own', () => {
    const options = { activityType: 'Weight Training' }
    const result = parseGpx(
      gpxFile(track(undefined, [[]])),
      'gym.gpx',
      DEFAULT_PARSE_LIMITS,
      options,
    )
    expect(refusalOf(result)).toEqual({ code: 'unsupported-sport', detail: 'Weight Training' })
  })

  it('keeps an empty run or ride as empty', () => {
    expect(refusalOf(parseGpx(gpxFile(track('running', [[]])), 'a.gpx')).code).toBe('empty')
    expect(refusalOf(parseGpx(gpxFile(track('9', [[]])), 'b.gpx')).code).toBe('empty')
    const listed = parseGpx(gpxFile(track(undefined, [[]])), 'c.gpx', DEFAULT_PARSE_LIMITS, {
      activityType: 'Ride',
    })
    expect(refusalOf(listed).code).toBe('empty')
  })

  it('keeps an empty track that names no sport as empty', () => {
    expect(refusalOf(parseGpx(gpxFile(track(undefined, [[]])), 'a.gpx')).code).toBe('empty')
  })

  it('reads the sport from the list for a file with no track at all', () => {
    const file = gpxFile()
    const walk = parseGpx(file, 'a.gpx', DEFAULT_PARSE_LIMITS, { activityType: 'Walk' })
    expect(refusalOf(walk)).toEqual({ code: 'unsupported-sport', detail: 'Walk' })
    const run = parseGpx(file, 'a.gpx', DEFAULT_PARSE_LIMITS, { activityType: 'Run' })
    expect(refusalOf(run).code).toBe('empty')
    expect(refusalOf(parseGpx(file, 'a.gpx')).code).toBe('empty')
  })
})
