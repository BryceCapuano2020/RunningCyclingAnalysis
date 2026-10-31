import { describe, expect, it } from 'vitest'
import { parseGpx } from '../gpx/parse'
import { parseTcx } from '../tcx/parse'
import type { ParseResult } from '../import/result'
import type { Activity } from '../types'
import { digestActivityAt } from './digestActivity'
import { movingMask } from './masks'
import { readDigest } from './readDigest'
import { parseDigest, serializeDigest } from './serialize'
import { temperatureSummary } from './temperature'
import { syntheticActivity } from './test/syntheticActivity'

const SEVEN = 7

/** A run of `n` seconds with temperature `at(i)` each second, with `edit` applied. */
function run(n: number, at: (i: number) => number, edit: (a: Activity) => void = () => {}) {
  const a = syntheticActivity({ n })
  a.temperature = Float32Array.from({ length: n }, (_, i) => at(i))
  edit(a)
  return a
}

const summary = (a: Activity) => temperatureSummary(a, movingMask(a))

describe('the temperature summary', () => {
  it('T1: takes the median of minute means, so a 3-minute sun spike does not move it', () => {
    // 60 minutes at a ramp from 14 to 18 degrees, with 3 minutes of 35 in the middle.
    const a = run(3600, (i) => (i >= 1800 && i < 1980 ? 35 : 14 + (4 * i) / 3600))
    const s = summary(a)!
    expect(s.coverage).toBe(1)
    expect(s.c).toBeGreaterThan(15.5)
    expect(s.c).toBeLessThan(17)
    expect(s.c * 2).toBe(Math.round(s.c * 2))
  })

  it('T2: is absent when under half the eligible seconds carry a reading', () => {
    const sparse = run(3600, (i) => (i % 10 < 4 ? 15 : NaN))
    expect(summary(sparse)).toBeUndefined()
    const half = run(3600, (i) => (i % 2 === 0 ? 15 : NaN))
    expect(summary(half)).toEqual({ c: 15, coverage: 0.5 })
  })

  it('T3: is absent for a file with no temperature', () => {
    const a = syntheticActivity({ n: 3600 })
    expect(summary(a)).toBeUndefined()
    expect(digestActivityAt(a, SEVEN)).not.toHaveProperty('temperature')
  })

  it('T4: is absent for a run with under 10 minutes after the warm-up', () => {
    expect(summary(run(18 * 60, () => 15))).toBeUndefined()
    expect(summary(run(20 * 60, () => 15))).toEqual({ c: 15, coverage: 1 })
    expect(summary(run(20 * 60 - 1, () => 15))).toBeUndefined()
  })

  it('T5: ignores the sentinel and readings out of range', () => {
    const a = run(
      3600,
      (i) => [127, -40, 60, NaN, Infinity][i % 5] ?? 0,
      () => {},
    )
    expect(summary(a)).toBeUndefined()
    const mixed = run(3600, (i) => (i % 4 === 0 ? 127 : i % 4 === 1 ? -40 : 14))
    expect(summary(mixed)).toEqual({ c: 14, coverage: 0.5 })
    // The edges of the range are readings.
    expect(summary(run(1800, () => -30))!.c).toBe(-30)
    expect(summary(run(1800, () => 55))!.c).toBe(55)
  })

  it('T6: counts moving seconds only, and not the first 600', () => {
    const a = run(
      3600,
      (i) => (i < 600 ? 40 : i < 2000 ? 12 : 20),
      (x) => x.paused.fill(1, 2000, 3000),
    )
    // The 40 of the warm-up and the readings while paused do not count: 1400 s at 12, 600 s at 20.
    expect(summary(a)).toEqual({ c: 12, coverage: 1 })
  })

  it('drops a minute with under 30 readings', () => {
    // Minutes of 20 with 29 readings (dropped) are all that is warm; the rest read 10.
    const a = run(1800, (i) => {
      const minute = Math.floor((i - 600) / 60)
      if (i < 600) return 10
      return minute % 2 === 0 && i % 60 < 29 ? 20 : minute % 2 === 0 ? NaN : 10
    })
    expect(summary(a)!.c).toBe(10)
  })

  it('rounds to half a degree and the coverage to a twentieth', () => {
    expect(summary(run(1800, () => 14.3))!.c).toBe(14.5)
    expect(summary(run(1800, () => -0.2))!.c).toBe(0)
    expect(Object.is(summary(run(1800, () => -0.2))!.c, -0)).toBe(false)
    const s = summary(run(2000, (i) => (i % 100 < 87 ? 14 : NaN)))!
    expect(s.coverage).toBe(0.85)
  })
})

describe('the temperature field of a digest', () => {
  it('is written only from revision 7, and no other byte of the digest differs', () => {
    const a = run(3600, () => 17)
    const before = digestActivityAt(a, 6)
    const after = digestActivityAt(a, SEVEN)
    expect(before).not.toHaveProperty('temperature')
    expect(after.temperature).toEqual({ c: 17, coverage: 1 })
    expect({ ...after, temperature: undefined, modelRevision: 6 }).toEqual({
      ...before,
      temperature: undefined,
    })
  })

  it('T7: survives parseDigest and the stored and device readers', () => {
    const digest = digestActivityAt(
      run(3600, () => 21.5),
      SEVEN,
    )
    expect(parseDigest(serializeDigest(digest)).temperature).toEqual({ c: 21.5, coverage: 1 })
    const wire = JSON.parse(serializeDigest(digest)) as Record<string, unknown>
    for (const view of ['stored', 'device', 'create'] as const) {
      expect(readDigest(wire, view).temperature, view).toEqual({ c: 21.5, coverage: 1 })
    }
  })
})

/** The first activity of a parse that must have succeeded. */
function first(result: ParseResult): Activity {
  if (!result.ok) throw new Error(result.reason)
  return result.activities[0]!
}

const START = Date.UTC(2024, 4, 1, 7, 30, 0)
const iso = (s: number) => new Date(START + s * 1000).toISOString().replace('.000Z', 'Z')
/** The reading at second s of the document fixtures: 12 degrees for 20 minutes, 18 for the next 20. */
const reading = (s: number) => (s < 1200 ? 12 : 18)
const SECONDS = 2400
const bytes = (text: string) => new TextEncoder().encode(text)

function gpxDocument(): Uint8Array {
  const points = Array.from(
    { length: SECONDS },
    (_, s) =>
      `<trkpt lat="${(51.5 + s * 0.00003).toFixed(6)}" lon="-0.120000"><ele>${(10 + s * 0.05).toFixed(2)}</ele>` +
      `<time>${iso(s)}</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:atemp>${reading(s)}` +
      `</gpxtpx:atemp></gpxtpx:TrackPointExtension></extensions></trkpt>`,
  )
  return bytes(
    '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="test" ' +
      'xmlns="http://www.topografix.com/GPX/1/1" ' +
      'xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">' +
      `<trk><type>running</type><trkseg>${points.join('')}</trkseg></trk></gpx>`,
  )
}

function tcxDocument(): Uint8Array {
  const points = Array.from(
    { length: SECONDS },
    (_, s) =>
      `<Trackpoint><Time>${iso(s)}</Time><Position><LatitudeDegrees>${(51.5 + s * 0.00003).toFixed(6)}` +
      `</LatitudeDegrees><LongitudeDegrees>-0.12</LongitudeDegrees></Position>` +
      `<AltitudeMeters>${(10 + s * 0.05).toFixed(2)}</AltitudeMeters><DistanceMeters>${s * 3}</DistanceMeters>` +
      `<Extensions><ns3:TPX><ns3:Temp>${reading(s)}</ns3:Temp></ns3:TPX></Extensions></Trackpoint>`,
  )
  return bytes(
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" ' +
      'xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2"><Activities>' +
      `<Activity Sport="Running"><Id>${iso(0)}</Id><Lap StartTime="${iso(0)}">` +
      `<TotalTimeSeconds>${SECONDS}</TotalTimeSeconds><Intensity>Active</Intensity>` +
      `<TriggerMethod>Manual</TriggerMethod><Track>${points.join('')}</Track></Lap></Activity>` +
      '</Activities></TrainingCenterDatabase>\n',
  )
}

describe('the same field from every file format', () => {
  it('T8: a GPX and a TCX file with the same readings give the same summary', () => {
    const fromGpx = summary(first(parseGpx(gpxDocument(), 'a.gpx')))
    const fromTcx = summary(first(parseTcx(tcxDocument(), 'a.tcx')))
    // 1800 s eligible: 600 s at 12 (minutes 0 to 9 of eligibility) and 1200 s at 18, so the median minute is 18.
    expect(fromGpx).toEqual({ c: 18, coverage: 1 })
    expect(fromTcx).toEqual(fromGpx)
  })
})
