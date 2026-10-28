import { describe, expect, it } from 'vitest'
import type { Activity, Sport } from '../types'
import { digestActivity } from '../digest/digestActivity'
import { encodeFit } from '../fit/encode'
import { parseFit } from '../fit/parse'
import type { ParseLimits, ParseResult } from '../import/result'
import { generatedName } from '../import/names'
import { encodeTcx } from './encode'
import { parseTcx } from './parse'

const START_MS = Date.UTC(2024, 4, 1, 7, 30, 0)
const METRES_PER_DEGREE = (6_371_008.8 * Math.PI) / 180

interface FixtureOptions {
  withPower?: boolean
  /** Indexes in [pauseFrom, pauseTo) are paused: speed and power 0, no heart rate. */
  pauseFrom?: number
  pauseTo?: number
}

/** Deterministic activity whose values sit on the TCX and FIT grids, so they survive a round trip. */
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

function maxAbsDiff(a: Float64Array, b: Float64Array): number {
  let worst = 0
  for (let i = 0; i < a.length; i++) {
    worst = Math.max(worst, Math.abs(a[i]! - b[i]!))
  }
  return worst
}

function utf8(text: string): Uint8Array {
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

// Hand-written documents in the shape Garmin Connect exports: ns2/ns3 prefixes, a Lap-level
// average heart rate that must never be read as a trackpoint value, and TPX extensions.

function isoAt(second: number): string {
  return new Date(START_MS + second * 1000).toISOString()
}

interface PointXml {
  second: number
  /** Overrides the time written for `second`. */
  time?: string
  lat?: number
  lon?: number
  distance?: number
  altitude?: number
  hr?: number | string
  speed?: number
  watts?: number
  runCadence?: number
}

function optional(name: string, value: number | string | undefined): string {
  return value === undefined ? '' : `<${name}>${value}</${name}>`
}

function pointXml(p: PointXml): string {
  const position =
    p.lat === undefined || p.lon === undefined
      ? ''
      : `<Position>${optional('LatitudeDegrees', p.lat)}${optional('LongitudeDegrees', p.lon)}</Position>`
  const hr = p.hr === undefined ? '' : `<HeartRateBpm><Value>${p.hr}</Value></HeartRateBpm>`
  const tpx = [
    optional('ns3:RunCadence', p.runCadence),
    optional('ns3:Speed', p.speed),
    optional('ns3:Watts', p.watts),
  ].join('')
  const extensions = tpx === '' ? '' : `<Extensions><ns3:TPX>${tpx}</ns3:TPX></Extensions>`
  return (
    `<Trackpoint><Time>${p.time ?? isoAt(p.second)}</Time>${position}` +
    `${optional('AltitudeMeters', p.altitude)}${optional('DistanceMeters', p.distance)}` +
    `${hr}${extensions}</Trackpoint>`
  )
}

function lapXml(points: string[]): string {
  return (
    `<Lap StartTime="${isoAt(0)}"><TotalTimeSeconds>0</TotalTimeSeconds>` +
    `<AverageHeartRateBpm><Value>999</Value></AverageHeartRateBpm>` +
    `<Intensity>Active</Intensity><TriggerMethod>Manual</TriggerMethod>` +
    `<Track>${points.join('')}</Track></Lap>`
  )
}

function activityXml(sport: string, laps: string[]): string {
  return `<Activity Sport="${sport}"><Id>${isoAt(0)}</Id>${laps.join('')}</Activity>`
}

function documentXml(activities: string[]): Uint8Array {
  return utf8(
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"' +
      ' xmlns:ns2="http://www.garmin.com/xmlschemas/UserProfile/v2"' +
      ' xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2">\n' +
      `<Activities>${activities.join('')}</Activities></TrainingCenterDatabase>\n`,
  )
}

/** A run of `count` seconds from `from`, with a cumulative distance of 3.5 m a second. */
function runPoints(from: number, count: number, withGps: boolean): string[] {
  const out: string[] = []
  for (let s = from; s < from + count; s++) {
    out.push(
      pointXml({
        second: s,
        lat: withGps ? 51.5 + s * 0.00003 : undefined,
        lon: withGps ? -0.12 : undefined,
        distance: s * 3.5,
        altitude: 10 + s * 0.1,
        hr: 140 + (s % 10),
        speed: 3.5,
        runCadence: 170,
      }),
    )
  }
  return out
}

describe('parseTcx names', () => {
  /** A local 6:11 am start, so the literal name below holds in any time zone. */
  const LOCAL_MORNING = new Date(2025, 4, 15, 6, 11).getTime()

  /** The same activity with the Notes element a device or app writes under the Activity's Id. */
  function withNotes(notes: string): Uint8Array {
    const activity = { ...makeActivity('run', 120), startMs: LOCAL_MORNING }
    const text = new TextDecoder().decode(encodeTcx(activity, { gps: true }))
    return utf8(text.replace('</Id>', `</Id><Notes>${notes}</Notes>`))
  }

  it('ignores Notes, which are free text, and names the activity from its start', () => {
    const a = firstActivity(parseTcx(withNotes('Dr Lee: knee pain, 12 Example Rd'), 'run.tcx'))
    expect(a.name).toBe('Morning Run')
  })

  it('generates the name when the activity has no Notes', () => {
    const activity = { ...makeActivity('run', 120), startMs: LOCAL_MORNING }
    const a = firstActivity(parseTcx(encodeTcx(activity, { gps: true }), 'run.tcx'))
    expect(a.name).toBe('Morning Run')
  })
})

describe('parseTcx round trip', () => {
  it('reproduces a ride with power and heart rate', () => {
    const original = makeActivity('ride', 120)
    const result = parseTcx(encodeTcx(original, { gps: true }), 'Morning Ride.tcx')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.activities.length).toBe(1)
    expect(result.skipped).toEqual([])

    const a = result.activities[0]!
    expect(a.sport).toBe('ride')
    expect(a.name).toBe(generatedName(START_MS, 'ride'))
    expect(a.id).toBe(`${START_MS}-Morning Ride.tcx`)
    expect(a.startMs).toBe(START_MS)
    expect(a.n).toBe(120)
    expect(a.indoor).toBe(false)
    expect(a.hasPower).toBe(true)
    expect(a.hasHeartRate).toBe(true)
    expect(a.hasAltitude).toBe(true)
    expect(maxAbsDiff(a.speed, original.speed)).toBeLessThanOrEqual(0.001)
    for (let i = 0; i < a.n; i++) {
      const tolerance = 0.005 * Math.max(original.distance[i]!, 1)
      expect(Math.abs(a.distance[i]! - original.distance[i]!)).toBeLessThanOrEqual(tolerance)
    }
    expect(maxAbsDiff(a.altitude, original.altitude)).toBeLessThanOrEqual(0.001)
    expect(Array.from(a.heartRate)).toEqual(Array.from(original.heartRate))
    expect(Array.from(a.power)).toEqual(Array.from(original.power))
    expect(Array.from(a.paused)).toEqual(Array.from(original.paused))
  })

  it('reproduces a run without power', () => {
    const original = makeActivity('run', 90, { withPower: false })
    const a = firstActivity(parseTcx(encodeTcx(original), 'tempo.tcx'))
    expect(a.sport).toBe('run')
    expect(a.name).toBe(generatedName(START_MS, 'run'))
    expect(a.n).toBe(90)
    expect(a.hasPower).toBe(false)
    expect(a.power.every((v) => Number.isNaN(v))).toBe(true)
    expect(maxAbsDiff(a.speed, original.speed)).toBeLessThanOrEqual(0.001)
    expect(Array.from(a.heartRate)).toEqual(Array.from(original.heartRate))
  })

  it('keeps a pause as a gap in the trackpoints, so it parses back as paused', () => {
    const original = makeActivity('run', 300, { withPower: false, pauseFrom: 120, pauseTo: 180 })
    const a = firstActivity(parseTcx(encodeTcx(original), 'paused.tcx'))
    expect(a.n).toBe(300)
    expect(Array.from(a.paused)).toEqual(Array.from(original.paused))
    expect(a.speed[150]).toBe(0)
    expect(Number.isNaN(a.heartRate[150])).toBe(true)
  })

  it('digests the same as the FIT file it was written from', () => {
    for (const sport of ['ride', 'run'] as const) {
      const original = makeActivity(sport, 300)
      const fit = firstActivity(parseFit(encodeFit(original), 'same.fit'))
      const tcx = firstActivity(parseTcx(encodeTcx(original, { gps: true }), 'same.tcx'))
      const fromFit = digestActivity(fit)
      const fromTcx = digestActivity(tcx)

      expect(fromTcx.sport).toBe(fromFit.sport)
      expect(fromTcx.indoor).toBe(fromFit.indoor)
      expect(fromTcx.hasHeartRate).toBe(fromFit.hasHeartRate)
      expect(fromTcx.durationS).toBe(fromFit.durationS)
      expect(
        Math.abs(fromTcx.distanceM - fromFit.distanceM) / fromFit.distanceM,
      ).toBeLessThanOrEqual(0.005)
      expect(fromTcx.curve.length).toBe(fromFit.curve.length)
      fromFit.curve.forEach((point, k) => {
        const other = fromTcx.curve[k]!.value
        if (Number.isNaN(point.value)) {
          expect(Number.isNaN(other)).toBe(true)
        } else {
          expect(Math.abs(other - point.value) / Math.abs(point.value)).toBeLessThanOrEqual(0.01)
        }
      })
    }
  })
})

describe('parseTcx garmin-style documents', () => {
  it('reads positions, heart rate, distance and TPX speed, and ignores lap averages', () => {
    const bytes = documentXml([activityXml('Running', [lapXml(runPoints(0, 90, true))])])
    const result = parseTcx(bytes, 'Garmin Run.tcx')
    const a = firstActivity(result)
    expect(a.sport).toBe('run')
    expect(a.indoor).toBe(false)
    expect(a.n).toBe(90)
    expect(a.distance[89]).toBeCloseTo(89 * 3.5, 6)
    expect(a.speed[10]).toBeCloseTo(3.5, 9)
    expect(a.altitude[50]).toBeCloseTo(15, 6)
    expect(Array.from(a.heartRate.slice(0, 12))).toEqual([
      140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 140, 141,
    ])
    expect(a.heartRate.includes(999)).toBe(false)
    expect(a.hasPower).toBe(false)
  })

  it('reads power from TPX Watts on a ride', () => {
    const trackpoints: string[] = []
    for (let s = 0; s < 90; s++) {
      trackpoints.push(
        pointXml({
          second: s,
          lat: 51.5 + s * 0.00003,
          lon: -0.12,
          distance: s * 8,
          hr: 150,
          speed: 8,
          watts: 210 + (s % 3),
        }),
      )
    }
    const bytes = documentXml([activityXml('Biking', [lapXml(trackpoints)])])
    const a = firstActivity(parseTcx(bytes, 'ride.tcx'))
    expect(a.sport).toBe('ride')
    expect(a.hasPower).toBe(true)
    expect(a.power[4]).toBe(211)
  })

  it('reads a multi-lap activity as one continuous activity', () => {
    const laps = [lapXml(runPoints(0, 45, true)), lapXml(runPoints(45, 45, true))]
    const a = firstActivity(parseTcx(documentXml([activityXml('Running', laps)]), 'laps.tcx'))
    expect(a.n).toBe(90)
    expect(a.distance[89]).toBeCloseTo(89 * 3.5, 6)
    expect(a.paused.every((p) => p === 0)).toBe(true)
  })

  it('treats a gap between laps as a pause through the gap logic, not a timer event', () => {
    const first = runPoints(0, 60, true)
    const second = runPoints(120, 60, true)
    const a = firstActivity(
      parseTcx(documentXml([activityXml('Running', [lapXml(first), lapXml(second)])]), 'gap.tcx'),
    )
    expect(a.n).toBe(180)
    expect(a.paused[30]).toBe(0)
    expect(a.paused[90]).toBe(1)
    expect(a.speed[90]).toBe(0)
  })

  it('reads a trainer ride with no positions as indoor', () => {
    const trackpoints: string[] = []
    for (let s = 0; s < 90; s++) {
      trackpoints.push(
        pointXml({
          second: s,
          distance: s * 9,
          altitude: undefined,
          hr: 130,
          watts: 200,
          speed: 9,
        }),
      )
    }
    const a = firstActivity(
      parseTcx(documentXml([activityXml('Biking', [lapXml(trackpoints)])]), 'trainer.tcx'),
    )
    expect(a.sport).toBe('ride')
    expect(a.indoor).toBe(true)
    expect(a.hasAltitude).toBe(false)
    expect(a.hasPower).toBe(true)
    expect(a.n).toBe(90)
  })

  it('falls back to haversine distance when DistanceMeters is missing', () => {
    const trackpoints: string[] = []
    for (let s = 0; s < 90; s++) {
      trackpoints.push(pointXml({ second: s, lat: 51.5 + s * 0.00003, lon: -0.12, hr: 140 }))
    }
    const a = firstActivity(
      parseTcx(documentXml([activityXml('Running', [lapXml(trackpoints)])]), 'no-distance.tcx'),
    )
    const stepM = 0.00003 * METRES_PER_DEGREE
    expect(Math.abs(a.distance[89]! - 89 * stepM) / (89 * stepM)).toBeLessThanOrEqual(0.005)
    expect(a.speed[10]).toBeCloseTo(stepM, 1)
  })

  it('carries DistanceMeters across a lap reset instead of falling back to positions', () => {
    const trackpoints: string[] = []
    for (let s = 0; s < 90; s++) {
      trackpoints.push(
        pointXml({
          second: s,
          lat: 51.5 + s * 0.00003,
          lon: -0.12,
          distance: s < 45 ? s * 2 : (s - 45) * 2,
        }),
      )
    }
    const a = firstActivity(
      parseTcx(documentXml([activityXml('Running', [lapXml(trackpoints)])]), 'reset.tcx'),
    )
    // 88 m before the reset, then 88 m after it, on top of the carried 88 m.
    expect(a.distance[89]).toBeCloseTo(176, 6)
    expect(a.speed[20]).toBeCloseTo(2, 6)
  })

  it('sorts unsorted trackpoints stably and drops exact duplicates', () => {
    const ordered = runPoints(0, 90, false)
    const reversed = [...runPoints(0, 90, false)].reverse()
    const duplicated = [...reversed, ordered[10]!, ordered[10]!]
    const expected = firstActivity(
      parseTcx(documentXml([activityXml('Running', [lapXml(ordered)])]), 'sorted.tcx'),
    )
    const actual = firstActivity(
      parseTcx(documentXml([activityXml('Running', [lapXml(duplicated)])]), 'shuffled.tcx'),
    )
    expect(actual.n).toBe(expected.n)
    expect(maxAbsDiff(actual.distance, expected.distance)).toBe(0)
    expect(maxAbsDiff(actual.speed, expected.speed)).toBe(0)
    expect(Array.from(actual.heartRate)).toEqual(Array.from(expected.heartRate))
  })

  it('skips invalid values and trackpoints without a valid time', () => {
    const points = runPoints(0, 90, true)
    points[20] = pointXml({ second: 20, hr: 'abc', distance: 70 })
    points[30] =
      '<Trackpoint><Time>not a time</Time><HeartRateBpm><Value>150</Value></HeartRateBpm></Trackpoint>'
    points[40] = pointXml({ second: 40, lat: 200, lon: -0.12, hr: 150, distance: 140 })
    const a = firstActivity(
      parseTcx(documentXml([activityXml('Running', [lapXml(points)])]), 'invalid.tcx'),
    )
    expect(a.n).toBe(90)
    // The invalid 'abc' is not read as a value: the pipeline bridges the one-second hole.
    expect(a.heartRate[20]).toBeCloseTo((a.heartRate[19]! + a.heartRate[21]!) / 2, 9)
    expect(a.heartRate[21]).toBe(141)
  })

  it('splits a file with two activities into two, named and identified by sport and index', () => {
    const run = activityXml('Running', [lapXml(runPoints(0, 90, true))])
    const ride: string[] = []
    for (let s = 0; s < 90; s++) {
      ride.push(
        pointXml({ second: s, lat: 51.6 + s * 0.00003, lon: -0.2, distance: s * 8, hr: 150 }),
      )
    }
    const rideXml = activityXml('Biking', [lapXml(ride)])
    const result = parseTcx(documentXml([run, rideXml]), 'two.tcx')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.activities.map((a) => a.sport)).toEqual(['run', 'ride'])
    expect(result.activities.map((a) => a.name)).toEqual([
      generatedName(START_MS, 'run'),
      generatedName(START_MS, 'ride'),
    ])
    expect(result.activities[0]!.id.endsWith('#0')).toBe(true)
    expect(result.activities[1]!.id.endsWith('#1')).toBe(true)
  })

  it('refuses a sport Other activity with a clear reason', () => {
    const points = runPoints(0, 90, true)
    const reason = reasonOf(
      parseTcx(documentXml([activityXml('Other', [lapXml(points)])]), 'strength.tcx'),
    )
    expect(reason).toBe('Unsupported sport: Other')
  })

  it('keeps the supported activity beside a skipped Other one', () => {
    const other = activityXml('Other', [lapXml(runPoints(0, 90, true))])
    const run = activityXml('Running', [lapXml(runPoints(0, 90, true))])
    const result = parseTcx(documentXml([other, run]), 'mixed.tcx')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.activities.length).toBe(1)
    expect(result.skipped).toEqual(['Other session skipped'])
  })

  it('refuses an activity with no Sport attribute, naming it unknown', () => {
    const bare = `<Activity>${lapXml(runPoints(0, 90, true))}</Activity>`
    const reason = reasonOf(parseTcx(documentXml([bare]), 'none.tcx'))
    expect(reason).toBe('Unsupported sport: unknown')
  })
})

describe('parseTcx validation', () => {
  it('returns a clean failure for garbage bytes', () => {
    const reason = reasonOf(parseTcx(utf8('not xml at all <<<'), 'junk.tcx'))
    expect(reason).toBe('Could not decode TCX file')
    expect(reasonOf(parseTcx(new Uint8Array(), 'empty.tcx'))).toBe('Could not decode TCX file')
  })

  it('never throws, even for input that is not a byte array', () => {
    const notBytes = null as unknown as Uint8Array
    expect(parseTcx(notBytes, 'null.tcx').ok).toBe(false)
  })

  it('rejects XML that is not a TCX document', () => {
    const gpx = utf8('<?xml version="1.0"?><gpx version="1.1"><trk/></gpx>')
    expect(reasonOf(parseTcx(gpx, 'route.tcx'))).toBe('Not a TCX file')
  })

  it('reports no records when no trackpoint has a time, as GPX does', () => {
    const untimed = Array.from(
      { length: 90 },
      (_, s) => `<Trackpoint><DistanceMeters>${s * 3.5}</DistanceMeters></Trackpoint>`,
    )
    const reason = reasonOf(
      parseTcx(documentXml([activityXml('Running', [lapXml(untimed)])]), 'untimed.tcx'),
    )
    expect(reason).toBe('File contains no activity records')
  })

  it('rejects a TCX document with no activities', () => {
    const empty = utf8(
      '<TrainingCenterDatabase><Courses><Course><Name>loop</Name></Course></Courses>' +
        '</TrainingCenterDatabase>',
    )
    expect(reasonOf(parseTcx(empty, 'course.tcx'))).toBe('File contains no activities')
  })

  it('rejects a file over the byte limit', () => {
    const bytes = encodeTcx(makeActivity('run', 90))
    const limits: ParseLimits = {
      maxFileBytes: 100,
      maxRecordMessages: 2_000_000,
      maxActivitySeconds: 172_800,
    }
    expect(reasonOf(parseTcx(bytes, 'big.tcx', limits))).toContain('100-byte limit')
  })

  it('rejects a file over the trackpoint limit', () => {
    const bytes = encodeTcx(makeActivity('run', 90))
    const limits: ParseLimits = {
      maxFileBytes: 1e9,
      maxRecordMessages: 10,
      maxActivitySeconds: 172_800,
    }
    expect(reasonOf(parseTcx(bytes, 'many.tcx', limits))).toContain('10-record limit')
  })

  it('rejects a ride shorter than one minute', () => {
    const reason = reasonOf(parseTcx(encodeTcx(makeActivity('ride', 30)), 'short.tcx'))
    expect(reason).toBe('Activity is shorter than one minute')
  })
})

describe('parseTcx distance and speed sources', () => {
  it('reads an indoor ride with two laps and no TPX speed as 9,600 m', () => {
    const laps: string[] = []
    for (let lap = 0; lap < 2; lap++) {
      const trackpoints: string[] = []
      for (let s = 0; s < 600; s++) {
        // Each lap's DistanceMeters restarts at zero, then climbs 8 m a second.
        trackpoints.push(pointXml({ second: lap * 600 + s, distance: (s + 1) * 8 }))
      }
      laps.push(lapXml(trackpoints))
    }
    const a = firstActivity(parseTcx(documentXml([activityXml('Biking', laps)]), 'two-laps.tcx'))
    expect(a.indoor).toBe(true)
    expect(a.n).toBe(1200)
    expect(a.distance[1199]).toBeCloseTo(9600, 6)
    expect(a.speed[600]).toBeCloseTo(8, 6)
  })

  it('treats a DistanceMeters drop under 1 m as jitter and keeps distance non-decreasing', () => {
    const trackpoints: string[] = []
    for (let s = 0; s < 90; s++) {
      // Second 30 reads 0.5 m below second 29: sensor jitter, not a reset.
      const distance = s === 30 ? 115.5 : s * 4
      trackpoints.push(pointXml({ second: s, distance }))
    }
    const a = firstActivity(
      parseTcx(documentXml([activityXml('Biking', [lapXml(trackpoints)])]), 'jitter.tcx'),
    )
    for (let i = 1; i < a.n; i++) {
      expect(a.distance[i]).toBeGreaterThanOrEqual(a.distance[i - 1]!)
    }
    expect(a.distance[30]).toBeCloseTo(116, 6)
    expect(a.distance[89]).toBeCloseTo(356, 6)
  })

  it('derives speed from DistanceMeters over a centred 10 s window, not raw 1 s steps', () => {
    // Steps alternate 2 m and 6 m, so one-second differences read 2 or 6 m/s around 4 m/s.
    const trackpoints: string[] = []
    let total = 0
    for (let s = 0; s < 120; s++) {
      if (s > 0) total += s % 2 === 0 ? 2 : 6
      trackpoints.push(pointXml({ second: s, distance: total }))
    }
    const a = firstActivity(
      parseTcx(documentXml([activityXml('Running', [lapXml(trackpoints)])]), 'alternating.tcx'),
    )
    for (const i of [30, 60, 90]) expect(a.speed[i]).toBeCloseTo(4, 6)
  })

  it('reads an indoor ride with power and no distance, speed or position as stationary', () => {
    const trackpoints: string[] = []
    for (let s = 0; s < 90; s++) trackpoints.push(pointXml({ second: s, hr: 130, watts: 200 }))
    const a = firstActivity(
      parseTcx(documentXml([activityXml('Biking', [lapXml(trackpoints)])]), 'power-only.tcx'),
    )
    expect(a.indoor).toBe(true)
    expect(a.hasPower).toBe(true)
    expect(a.speed.every((v) => v === 0)).toBe(true)
  })
})

describe('parseTcx positions', () => {
  /** A 120 s ride at 9 m/s with power, each second at the position `at` gives for it. */
  function rideAt(at: (s: number) => { lat: number; lon: number }): string[] {
    return Array.from({ length: 120 }, (_, s) =>
      pointXml({ second: s, ...at(s), distance: s * 9, hr: 130, watts: 200, speed: 9 }),
    )
  }

  it('reads a trainer ride whose positions are all 0,0 as indoor, with no route', () => {
    const xml = documentXml([activityXml('Biking', [lapXml(rideAt(() => ({ lat: 0, lon: 0 })))])])
    const a = firstActivity(parseTcx(xml, 'placeholder.tcx'))
    expect(a.sport).toBe('ride')
    expect(a.indoor).toBe(true)
    expect(a.route).toBeUndefined()
  })

  it('keeps a ride with real positions outdoor, with its route', () => {
    const real = rideAt((s) => ({ lat: 51.5 + s * 0.00008, lon: -0.12 }))
    const a = firstActivity(
      parseTcx(documentXml([activityXml('Biking', [lapXml(real)])]), 'outdoor.tcx'),
    )
    expect(a.indoor).toBe(false)
    expect(a.route?.points.length).toBeGreaterThanOrEqual(2)
  })

  it('keeps a ride outdoor when some of its positions are real, though others are 0,0', () => {
    const mixed = rideAt((s) =>
      s < 10 ? { lat: 0, lon: 0 } : { lat: 51.5 + s * 0.00008, lon: -0.12 },
    )
    const a = firstActivity(
      parseTcx(documentXml([activityXml('Biking', [lapXml(mixed)])]), 'mixed.tcx'),
    )
    expect(a.indoor).toBe(false)
    expect(a.route).toBeDefined()
  })
})

describe('parseTcx timestamps', () => {
  it('refuses a trackpoint time with no time zone, with a clear reason', () => {
    const points = runPoints(0, 90, false)
    points[10] = pointXml({ second: 10, time: '2024-05-01T07:30:10', distance: 35 })
    const reason = reasonOf(
      parseTcx(documentXml([activityXml('Running', [lapXml(points)])]), 'no-zone.tcx'),
    )
    expect(reason).toBe('TCX times need a time zone (Z or ±hh:mm)')
  })

  it('accepts fractional seconds and ±hh:mm offsets', () => {
    const points: string[] = []
    for (let s = 0; s < 90; s++) {
      const millis = START_MS + s * 1000 + 500
      const time =
        s % 2 === 0
          ? new Date(millis).toISOString()
          : `${new Date(millis + 3_600_000).toISOString().slice(0, -1)}+01:00`
      points.push(pointXml({ second: s, time, distance: s * 3.5, speed: 3.5 }))
    }
    const a = firstActivity(
      parseTcx(documentXml([activityXml('Running', [lapXml(points)])]), 'zones.tcx'),
    )
    expect(a.startMs).toBe(START_MS + 500)
    expect(a.n).toBe(90)
    expect(a.distance[89]).toBeCloseTo(89 * 3.5, 6)
  })
})

/** A steady activity: speed v metres a second, and a cumulative distance that grows by v each second. */
function steadyActivity(sport: Sport, n: number, v: number): Activity {
  const distance = new Float64Array(n)
  for (let i = 0; i < n; i++) distance[i] = v * (i + 1)
  return {
    id: 'steady',
    name: 'steady',
    sport,
    startMs: START_MS,
    n,
    speed: new Float64Array(n).fill(v),
    distance,
    altitude: new Float64Array(n).fill(100),
    heartRate: new Float64Array(n).fill(140),
    power: new Float64Array(n).fill(200),
    paused: new Uint8Array(n),
    hasPower: true,
    hasHeartRate: true,
    hasAltitude: true,
    indoor: false,
  }
}

/**
 * Great-circle distance by the spherical Vincenty formula. It is a different identity from the
 * encoder's destination point, and stays precise for metre-sized steps where acos does not.
 */
function vincentyM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = Math.PI / 180
  const phi1 = a.lat * toRad
  const phi2 = b.lat * toRad
  const dLambda = (b.lon - a.lon) * toRad
  const cross = Math.cos(phi2) * Math.sin(dLambda)
  const along =
    Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda)
  const sigma = Math.atan2(
    Math.hypot(cross, along),
    Math.sin(phi1) * Math.sin(phi2) + Math.cos(phi1) * Math.cos(phi2) * Math.cos(dLambda),
  )
  return 6_371_008.8 * sigma
}

function positionsIn(bytes: Uint8Array): { lat: number; lon: number }[] {
  const text = new TextDecoder().decode(bytes)
  const pattern =
    /<LatitudeDegrees>([^<]+)<\/LatitudeDegrees><LongitudeDegrees>([^<]+)<\/LongitudeDegrees>/g
  return [...text.matchAll(pattern)].map((m) => ({ lat: Number(m[1]), lon: Number(m[2]) }))
}

describe('encodeTcx options', () => {
  it('writes several laps as one continuous activity', () => {
    const bytes = encodeTcx(steadyActivity('ride', 300, 8), { laps: 3 })
    expect(new TextDecoder().decode(bytes).match(/<Lap /g)?.length).toBe(3)
    const a = firstActivity(parseTcx(bytes, 'laps.tcx'))
    expect(a.n).toBe(300)
    expect(a.distance[299]).toBeCloseTo(8 * 300, 6)
  })

  it('restarts DistanceMeters at each lap and still reads a continuous distance', () => {
    const bytes = encodeTcx(steadyActivity('ride', 1200, 8), {
      laps: 2,
      resetDistancePerLap: true,
      speed: false,
    })
    const text = new TextDecoder().decode(bytes)
    expect(text).toContain('<DistanceMeters>8</DistanceMeters>')
    expect(text).not.toContain('<DistanceMeters>4808</DistanceMeters>')
    const a = firstActivity(parseTcx(bytes, 'reset-laps.tcx'))
    expect(a.distance[600]).toBeCloseTo(8 * 601, 6)
    expect(a.distance[1199]).toBeCloseTo(8 * 1200, 6)
  })

  it('omits TPX Speed, so speed comes from a centred difference of DistanceMeters', () => {
    const bytes = encodeTcx(steadyActivity('run', 120, 3), { speed: false })
    expect(new TextDecoder().decode(bytes)).not.toContain('Speed>')
    const a = firstActivity(parseTcx(bytes, 'no-speed.tcx'))
    expect(a.speed[60]).toBeCloseTo(3, 6)
    expect(a.distance[119]).toBeCloseTo(3 * 120, 6)
  })

  it('omits DistanceMeters, so distance comes from positions', () => {
    const bytes = encodeTcx(steadyActivity('run', 300, 3), {
      gps: true,
      distance: false,
      speed: false,
    })
    const a = firstActivity(parseTcx(bytes, 'positions.tcx'))
    expect(a.indoor).toBe(false)
    // The first point is the origin, so the walk covers 3 m for each of the 299 steps after it.
    expect(a.distance[299]).toBeCloseTo(3 * 299, 0)
    expect(a.speed[150]).toBeCloseTo(3, 2)
  })

  it('walks positions with a destination-point formula, one step per second of distance', () => {
    const bytes = encodeTcx(steadyActivity('run', 60, 3), { gps: true })
    const positions = positionsIn(bytes)
    expect(positions.length).toBe(60)
    for (let i = 1; i < positions.length; i++) {
      expect(vincentyM(positions[i - 1]!, positions[i]!)).toBeCloseTo(3, 6)
    }
  })

  it('adds position noise that positions-only distance still reads within 1%', () => {
    const activity = steadyActivity('run', 300, 3)
    const options = { gps: true, distance: false, speed: false } as const
    const clean = encodeTcx(activity, { ...options, noise: 0 })
    const noisy = encodeTcx(activity, { ...options, noise: 3 })
    expect(new TextDecoder().decode(noisy)).not.toBe(new TextDecoder().decode(clean))
    const a = firstActivity(parseTcx(noisy, 'noisy.tcx'))
    expect(Math.abs(a.distance[299]! - 3 * 299) / (3 * 299)).toBeLessThanOrEqual(0.01)
  })

  it('writes neither distance nor speed, which reads as an indoor ride with no speed', () => {
    const bytes = encodeTcx(steadyActivity('ride', 120, 8), { speed: false, distance: false })
    const text = new TextDecoder().decode(bytes)
    expect(text).not.toContain('Speed>')
    expect(text).not.toContain('<DistanceMeters>')
    const a = firstActivity(parseTcx(bytes, 'none.tcx'))
    expect(a.indoor).toBe(true)
    expect(a.speed.every((v) => v === 0)).toBe(true)
  })
})

describe('parseTcx route shape', () => {
  it('gives the activity a route shape from its positions', () => {
    const result = parseTcx(encodeTcx(steadyActivity('run', 600, 3), { gps: true }), 'run.tcx')

    expect(result.ok && result.activities[0]?.route?.points.length).toBeGreaterThanOrEqual(2)
  })

  it('gives an activity without positions no route shape', () => {
    const result = parseTcx(encodeTcx(steadyActivity('run', 600, 3)), 'nopos.tcx')

    expect(result.ok && result.activities[0]?.route).toBeUndefined()
  })
})

/** The code and detail of a refusal. */
function refusalOf(result: ParseResult): { code: string; detail: string | undefined } {
  if (result.ok) throw new Error('expected a failure')
  return { code: result.code, detail: result.detail }
}

/** Whether a refusal's sport name is the one the export's list gives. */
function listedOf(result: ParseResult): boolean | undefined {
  if (result.ok) throw new Error('expected a failure')
  return result.listed
}

describe('parseTcx with the type an export list gives', () => {
  const parseListed = (xml: Uint8Array, activityType: string | undefined): ParseResult =>
    parseTcx(xml, 'listed.tcx', undefined, { activityType })
  const other = documentXml([activityXml('Other', [lapXml(runPoints(0, 90, true))])])

  it.each([
    ['Run', 'run'],
    ['Trail Run', 'run'],
    ['Ride', 'ride'],
    ['Gravel Ride', 'ride'],
  ] as const)('reads an Other activity as %s', (activityType, sport) => {
    expect(firstActivity(parseListed(other, activityType)).sport).toBe(sport)
  })

  it('reads a virtual ride as an indoor ride', () => {
    expect(firstActivity(parseListed(other, 'Virtual Ride')).indoor).toBe(true)
  })

  it('reads an activity with no Sport attribute from the list', () => {
    const bare = documentXml([`<Activity>${lapXml(runPoints(0, 90, true))}</Activity>`])
    expect(firstActivity(parseListed(bare, 'Run')).sport).toBe('run')
  })

  it('keeps the sport the activity names, whatever the list says', () => {
    const run = documentXml([activityXml('Running', [lapXml(runPoints(0, 90, true))])])
    expect(firstActivity(parseListed(run, 'Ride')).sport).toBe('run')
  })

  it('refuses an Other activity as the sport the list names, and as Other when it names none', () => {
    expect(refusalOf(parseListed(other, 'Hike'))).toEqual({
      code: 'unsupported-sport',
      detail: 'Hike',
    })
    expect(refusalOf(parseListed(other, undefined))).toEqual({
      code: 'unsupported-sport',
      detail: 'Other',
    })
  })

  it('says the refused name is the list type only when the list gave it, not when the file did', () => {
    const swim = documentXml([activityXml('Swimming', [lapXml(runPoints(0, 90, true))])])
    const results = [
      parseListed(other, 'Yoga'),
      parseListed(other, undefined),
      parseListed(swim, 'Run'),
    ]
    expect(results.map(listedOf)).toEqual([true, undefined, undefined])
    expect(results.map((result) => refusalOf(result).detail)).toEqual(['Yoga', 'Other', 'Swimming'])
  })

  it('keeps refusing a Sport the TCX schema does not allow, whatever the list says', () => {
    const swim = documentXml([activityXml('Swimming', [lapXml(runPoints(0, 90, true))])])
    expect(refusalOf(parseListed(swim, 'Run'))).toEqual({
      code: 'unsupported-sport',
      detail: 'Swimming',
    })
  })

  it.each(['E-Bike Ride', 'E-Mountain Bike Ride'])(
    'refuses a Biking activity when the list says %s, which is the one case the list overrides',
    (activityType) => {
      const biking = documentXml([activityXml('Biking', [lapXml(runPoints(0, 90, true))])])
      expect(refusalOf(parseListed(biking, activityType)).code).toBe('e-bike')
    },
  )

  it('keeps refusing an e-bike ride named by the list', () => {
    expect(refusalOf(parseListed(other, 'E-Bike Ride')).code).toBe('e-bike')
  })

  it('keeps an empty Other activity as the sport the list names', () => {
    const empty = documentXml([activityXml('Other', [])])
    expect(refusalOf(parseListed(empty, 'Hike'))).toEqual({
      code: 'unsupported-sport',
      detail: 'Hike',
    })
    expect(refusalOf(parseListed(empty, 'Run')).code).toBe('empty')
  })
})
