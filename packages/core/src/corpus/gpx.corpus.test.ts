import { describe, expect, it } from 'vitest'
import { parseActivityFile } from '../import'
import { haversineM, trackFromFixes } from '../import/gps'
import type { GpsFix } from '../import/gps'
import { corpusReader, isSaneActivity, mutations } from './helpers'

/*
 * Real GPX files from gpxpy (tkrajina/gpxpy @ 8bbf933eac9a, Apache-2.0).
 *
 * The distance and duration references were produced by gpxpy 1.6.2 with
 * `track.get_duration()` and `track.length_2d()` on each track. gpxpy's own test.py asserts only
 * relations for these tracks (for example moving distance below length, and the 1 degree segment
 * of 111319.49 m that test_segment_length_2d pins). Those assertions are cited where they apply.
 *
 * gpxpy measures on the WGS84 equatorial radius, 6378137 m. This code uses the IUGG mean radius,
 * 6371008.8 m, so every gpxpy length is scaled by RADIUS_RATIO before comparison.
 */

const { bytes: corpusBytes, text: corpusText } = corpusReader(
  new URL('../../test-corpus/gpxpy/', import.meta.url),
)
const NO_SPORT = 'This GPX file does not say whether it is a run or a ride'
const NO_RECORDS = 'File contains no activity records'
const SHORT = 'Activity is shorter than one minute'
const SPARSE = 'Activity is recorded too sparsely: its points are more than 10 seconds apart'
const RADIUS_RATIO = 6_371_008.8 / 6_378_137
/** The helper's own gap rule, from gps.ts: a longer gap credits no distance. */
const GAP_RULE_S = 30
/** The speed cap used for the ground-truth helper call, above any sport's limit. */
const TRUTH_MAX_SPEED_MS = 30

const DOCUMENTED: RegExp[] = [
  /^Not a GPX file$/,
  /^Could not decode GPX file$/,
  /^File contains no activity records$/,
  /^This GPX file does not say whether it is a run or a ride( \(creator: .+\))?$/,
  /^Unsupported sport: .+$/,
  /^E-bike activities are not supported/,
  /^GPX file exceeds the /,
  /^Activity is shorter than one minute$/,
  /^Activity is recorded too sparsely: its points are more than 10 seconds apart$/,
  /^Activity is longer than 48 hours$/,
  /^File contains too much data$/,
  /^Activity date is not plausible$/,
  /^Activity exceeds the /,
]

/** Expected outcome of every corpus file, read as the file is (no type element). */
const AS_SHIPPED: [string, string][] = [
  ['Mojstrovka.gpx', `${NO_SPORT} (creator: GPSBabel - http://www.gpsbabel.org)`],
  ['around-visnjan-with-car.gpx', `${NO_SPORT} (creator: eTrex 20x)`],
  [
    'cerknicko-jezero-without-elevations.gpx',
    `${NO_SPORT} (creator: GPSBabel - http://www.gpsbabel.org)`,
  ],
  ['cerknicko-jezero.gpx', `${NO_SPORT} (creator: GPSBabel - http://www.gpsbabel.org)`],
  ['cerknicko-without-times.gpx', `${NO_SPORT} (creator: GPSBabel - http://www.gpsbabel.org)`],
  ['gpx1.1_with_all_fields.gpx', 'Unsupported sport: t'],
  ['gpx_with_garmin_extension.gpx', NO_RECORDS],
  ['korita-zbevnica.gpx', 'Unsupported sport: jkljkl'],
  ['track-with-empty-segment.gpx', `${NO_SPORT} (creator: TC2 to GPX11 XSLT stylesheet)`],
  ['track_with_speed.gpx', NO_SPORT],
  ['unicode_with_bom.gpx', NO_RECORDS],
]

/**
 * Reference tracks with timed points: gpxpy's duration (seconds, first to last point) and length_2d
 * (metres, WGS84 radius). The chord and gap figures are computed in the test. helperOverKept is the
 * helper's distance over the gap-free chord, as pinned in docs/validation/gpx-tcx.md.
 */
const TRACKS: {
  file: string
  track: number
  points: number
  durationS: number
  length2dM: number
  helperOverKept: number
}[] = [
  {
    file: 'around-visnjan-with-car.gpx',
    track: 0,
    points: 104,
    durationS: 514,
    length2dM: 2736.3,
    helperOverKept: 0.939,
  },
  {
    file: 'cerknicko-jezero.gpx',
    track: 1,
    points: 173,
    durationS: 2469,
    length2dM: 1914.5,
    helperOverKept: 1.038,
  },
  {
    file: 'cerknicko-jezero.gpx',
    track: 2,
    points: 52,
    durationS: 155,
    length2dM: 874.18,
    helperOverKept: 1.003,
  },
  {
    file: 'cerknicko-jezero.gpx',
    track: 4,
    points: 44,
    durationS: 288,
    length2dM: 1353.62,
    helperOverKept: 1.045,
  },
  {
    file: 'cerknicko-jezero.gpx',
    track: 7,
    points: 21,
    durationS: 1092,
    length2dM: 347,
    helperOverKept: 0.891,
  },
  {
    file: 'korita-zbevnica.gpx',
    track: 2,
    points: 176,
    durationS: 4552,
    length2dM: 2284.6,
    helperOverKept: 0.976,
  },
  {
    file: 'korita-zbevnica.gpx',
    track: 3,
    points: 337,
    durationS: 8541,
    length2dM: 3983.95,
    helperOverKept: 1.006,
  },
  {
    file: 'track-with-empty-segment.gpx',
    track: 0,
    points: 9,
    durationS: 76,
    length2dM: 85.95,
    helperOverKept: 0.842,
  },
  {
    file: 'track_with_speed.gpx',
    track: 0,
    points: 3,
    durationS: 13,
    length2dM: 18.67,
    helperOverKept: 1.0,
  },
]

/** Gives every track a sport, as a file would if its type element said so. */
function withType(text: string, type: string): string {
  return text.replace(/<trk>/g, `<trk><type>${type}</type>`)
}

/** Timed trackpoints of one trk, read from the XML by a regex that is independent of the parser. */
function timedFixes(text: string, track: number): GpsFix[] {
  const body = text.split(/<trk>/)[track + 1]!.split('</trk>')[0]!
  const fixes: GpsFix[] = []
  const point = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"\s*>([\s\S]*?)<\/trkpt>/g
  for (const m of body.matchAll(point)) {
    const time = /<time>([^<]+)<\/time>/.exec(m[3]!)
    if (time === null) continue
    fixes.push({ t: Date.parse(time[1]!), lat: Number(m[1]), lon: Number(m[2]) })
  }
  return fixes
}

/** Sum of great-circle chords. Chords longer than the gap rule are kept or dropped by the flag. */
function chordLength(fixes: GpsFix[], keepGaps: boolean): number {
  let total = 0
  for (let k = 1; k < fixes.length; k++) {
    const a = fixes[k - 1]!
    const b = fixes[k]!
    if (!keepGaps && b.t - a.t > GAP_RULE_S * 1000) continue
    total += haversineM(a.lat, a.lon, b.lat, b.lon)
  }
  return total
}

/** Distance the helper reports at the last fix. */
function helperDistance(fixes: GpsFix[]): number {
  const track = trackFromFixes(fixes, { maxSpeedMs: TRUTH_MAX_SPEED_MS })
  return track.distanceM[track.distanceM.length - 1] ?? 0
}

/** A small run written with a namespace prefix on every element, or with none. */
function runGpx(prefix: string): string {
  const p = prefix === '' ? '' : `${prefix}:`
  const ns = prefix === '' ? 'xmlns' : `xmlns:${prefix}`
  const points = Array.from({ length: 120 }, (_, i) => {
    const lat = (51 + (3 * i) / 111_195).toFixed(9)
    const time = new Date(Date.UTC(2024, 4, 1, 7, 30) + i * 1000).toISOString()
    return `<${p}trkpt lat="${lat}" lon="-0.1"><${p}time>${time}</${p}time></${p}trkpt>`
  }).join('')
  return (
    `<${p}gpx ${ns}="http://www.topografix.com/GPX/1/1" version="1.1">` +
    `<${p}trk><${p}type>running</${p}type><${p}trkseg>${points}</${p}trkseg></${p}trk>` +
    `</${p}gpx>`
  )
}

describe('GPX corpus: robustness', () => {
  it.each(AS_SHIPPED)('refuses %s as shipped, with the documented reason', (name, reason) => {
    expect(parseActivityFile(corpusBytes(name), name)).toEqual({
      ok: false,
      fileName: name,
      reason,
    })
  })

  it.each(AS_SHIPPED.map(([name]) => name))('never throws on truncated or corrupted %s', (name) => {
    const bytes = corpusBytes(name)
    for (const copy of mutations(bytes, name.length)) {
      const result = parseActivityFile(copy, name)
      if (result.ok) {
        for (const a of result.activities) expect(isSaneActivity(a)).toBe(true)
      } else {
        expect(DOCUMENTED.some((pattern) => pattern.test(result.reason))).toBe(true)
      }
    }
  })

  it('gives every corpus file a sane activity or a documented reason once a type is set', () => {
    for (const name of AS_SHIPPED.map(([file]) => file)) {
      const result = parseActivityFile(
        new TextEncoder().encode(withType(corpusText(name), 'running')),
        name,
      )
      if (result.ok) {
        for (const a of result.activities) {
          expect(isSaneActivity(a)).toBe(true)
          expect(a.sport).toBe('run')
        }
      } else {
        expect(DOCUMENTED.some((pattern) => pattern.test(result.reason))).toBe(true)
      }
    }
  })

  it('refuses a typed copy of around-visnjan with every time removed as having no records', () => {
    const untimed = withType(corpusText('around-visnjan-with-car.gpx'), 'cycling').replace(
      /<time>[^<]*<\/time>/g,
      '',
    )
    const result = parseActivityFile(new TextEncoder().encode(untimed), 'untimed.gpx')
    expect(result).toEqual({ ok: false, fileName: 'untimed.gpx', reason: NO_RECORDS })
  })

  it('refuses a typed copy of cerknicko-without-times, which has only 5 widely spaced timed fixes, as too sparse', () => {
    const result = parseActivityFile(
      new TextEncoder().encode(withType(corpusText('cerknicko-without-times.gpx'), 'cycling')),
      'cerknicko-without-times.gpx',
    )
    expect(result).toEqual({ ok: false, fileName: 'cerknicko-without-times.gpx', reason: SPARSE })
  })

  it('refuses a typed Mojstrovka, whose trackpoints all share one 1901 time, as too short', () => {
    // Every point is stamped 1901-12-13T20:45:52, so the file has no duration to measure.
    const result = parseActivityFile(
      new TextEncoder().encode(withType(corpusText('Mojstrovka.gpx'), 'running')),
      'Mojstrovka.gpx',
    )
    expect(result).toEqual({ ok: false, fileName: 'Mojstrovka.gpx', reason: SHORT })
  })
})

describe('GPX corpus: ground truth against gpxpy', () => {
  it('reproduces gpxpy 1 degree of longitude at the equator, 111319.49 m (test_segment_length_2d)', () => {
    const oneDegree = haversineM(0, 0, 0, 1) * (6_378_137 / 6_371_008.8)
    expect(Math.abs(oneDegree - 111_319.49)).toBeLessThan(0.01)
  })

  it.each(TRACKS)('$file trk $track: every chord matches gpxpy length_2d', (row) => {
    const fixes = timedFixes(corpusText(row.file), row.track)
    expect(fixes.length).toBe(row.points)
    // gpxpy measures the same chords on its own radius, so only the radius is scaled here. The
    // tolerance is 0.01% of the length, but never below gpxpy's 0.01 m print resolution, which is
    // 0.03% of the 18.67 m track. A radius mismatch would be 0.11%.
    const reference = row.length2dM * RADIUS_RATIO
    expect(Math.abs(chordLength(fixes, true) - reference)).toBeLessThanOrEqual(
      Math.max(1e-4 * reference, 0.01),
    )
  })

  it.each(TRACKS)('$file trk $track: duration matches gpxpy get_duration exactly', (row) => {
    const fixes = timedFixes(corpusText(row.file), row.track)
    const first = fixes[0]!.t
    const last = fixes[fixes.length - 1]!.t
    expect((last - first) / 1000).toBe(row.durationS)
  })
})

describe('GPX corpus: distance helper against the gap-free chord', () => {
  // The helper smooths speed over a 20 s window and drops credit across gaps longer than 30 s.
  // Comparing it with the chord of the same fixes, minus the gap chords, isolates the smoothing.
  it.each(TRACKS)(
    '$file trk $track: helper within 2 points of its pinned ratio to the chord kept by the gap rule',
    (row) => {
      const fixes = timedFixes(corpusText(row.file), row.track)
      const ratio = helperDistance(fixes) / chordLength(fixes, false)
      expect(Math.abs(ratio - row.helperOverKept)).toBeLessThanOrEqual(0.02)
    },
  )

  it('a track logged about once a minute loses most of its distance to the gap rule', () => {
    // cerknicko-jezero trk 7: 21 fixes over 18 min, with 9 gaps longer than 30 s.
    const fixes = timedFixes(corpusText('cerknicko-jezero.gpx'), 7)
    const all = chordLength(fixes, true)
    const helper = helperDistance(fixes)
    expect(helper / all).toBeLessThan(0.5)
  })
})

describe('GPX corpus: product path with a type set', () => {
  it('around-visnjan as a ride: one activity, timed as gpxpy, distance equal to the helper', () => {
    const text = withType(corpusText('around-visnjan-with-car.gpx'), 'cycling')
    const result = parseActivityFile(new TextEncoder().encode(text), 'around-visnjan.gpx')
    if (!result.ok) throw new Error(result.reason)
    expect(result.activities).toHaveLength(1)
    const a = result.activities[0]!
    expect(a.n - 1).toBe(514)
    const fixes = timedFixes(text, 0)
    expect(a.distance[a.n - 1]).toBeCloseTo(helperDistance(fixes), 6)
  })

  it('cerknicko-jezero as rides: keeps the tracks that vouch for a minute, with their gpxpy durations', () => {
    const text = withType(corpusText('cerknicko-jezero.gpx'), 'cycling')
    const result = parseActivityFile(new TextEncoder().encode(text), 'cerknicko-jezero.gpx')
    if (!result.ok) throw new Error(result.reason)
    // Track 7 is logged about once a minute: its gaps vouch for 57 s, so it is refused as too short.
    expect(result.activities.map((a) => a.n - 1)).toEqual([2469, 155, 288])
  })

  it('an empty trkseg before the real one adds no records and changes no distance', () => {
    const text = withType(corpusText('around-visnjan-with-car.gpx'), 'cycling')
    const withEmpty = text.replace('<trkseg>', '<trkseg></trkseg><trkseg>')
    const reference = parseActivityFile(new TextEncoder().encode(text), 'plain.gpx')
    const result = parseActivityFile(new TextEncoder().encode(withEmpty), 'empty.gpx')
    if (!reference.ok || !result.ok) throw new Error('expected both to parse')
    const [a] = result.activities
    const [b] = reference.activities
    if (a === undefined || b === undefined) throw new Error('expected an activity')
    expect(a.n).toBe(b.n)
    expect(a.distance[a.n - 1]).toBe(b.distance[b.n - 1])
  })

  it('reads a heart rate extension added to every point of a real track', () => {
    const text = withType(corpusText('around-visnjan-with-car.gpx'), 'cycling').replace(
      /<\/trkpt>/g,
      '<extensions><gpxtpx:hr>150</gpxtpx:hr></extensions></trkpt>',
    )
    const result = parseActivityFile(new TextEncoder().encode(text), 'hr.gpx')
    if (!result.ok) throw new Error(result.reason)
    expect(result.activities[0]?.hasHeartRate).toBe(true)
    expect(result.activities[0]?.heartRate[3]).toBe(150)
  })
})

describe('GPX corpus: byte and syntax variants', () => {
  it('reads a BOM, CRLF line endings and prefixed names as the same activity', () => {
    const base = runGpx('')
    const reference = parseActivityFile(new TextEncoder().encode(base), 'run.gpx')
    if (!reference.ok) throw new Error(reference.reason)
    const variants = {
      bom: '﻿' + base,
      crlf: base.replace(/></g, '>\r\n<'),
      prefixed: runGpx('g'),
    }
    for (const [label, variant] of Object.entries(variants)) {
      const result = parseActivityFile(new TextEncoder().encode(variant), `${label}.gpx`)
      if (!result.ok) throw new Error(`${label}: ${result.reason}`)
      const [a] = result.activities
      expect(a?.n, label).toBe(reference.activities[0]!.n)
      expect(a?.distance[119], label).toBe(reference.activities[0]!.distance[119])
    }
  })

  it('reads a BOM on a real track the same as without one', () => {
    const plain = withType(corpusText('around-visnjan-with-car.gpx'), 'cycling')
    const reference = parseActivityFile(new TextEncoder().encode(plain), 'plain.gpx')
    const bom = parseActivityFile(new TextEncoder().encode('﻿' + plain), 'bom.gpx')
    if (!reference.ok || !bom.ok) throw new Error('expected both to parse')
    expect(bom.activities[0]?.distance[513]).toBe(reference.activities[0]?.distance[513])
  })
})
