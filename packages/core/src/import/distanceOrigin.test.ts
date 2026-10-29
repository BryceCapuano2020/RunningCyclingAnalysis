import { describe, expect, it } from 'vitest'
import { digestActivity } from '../digest/digestActivity'
import { parseFit } from '../fit/parse'
import { buildFit, secondly } from '../fit/fitTestFiles'
import { parseTcx } from '../tcx/parse'
import type { Activity } from '../types'
import type { ParseResult } from './result'

const START_MS = Date.UTC(2024, 4, 1, 7, 30, 0)
const DEVICE_START_M = 5000
const SECONDS = 300
const METRES_PER_SECOND = 3

function onlyActivity(result: ParseResult): Activity {
  if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`)
  expect(result.activities).toHaveLength(1)
  return result.activities[0]!
}

function activityXml(offsetS: number, startM: number): string {
  const points = Array.from({ length: SECONDS }, (_, s) => {
    const time = new Date(START_MS + (offsetS + s) * 1000).toISOString()
    const lat = 51.5 + s * 0.00003
    return (
      `<Trackpoint><Time>${time}</Time>` +
      `<Position><LatitudeDegrees>${lat}</LatitudeDegrees><LongitudeDegrees>-0.12</LongitudeDegrees></Position>` +
      `<DistanceMeters>${startM + s * METRES_PER_SECOND}</DistanceMeters></Trackpoint>`
    )
  })
  const start = new Date(START_MS + offsetS * 1000).toISOString()
  return `<Activity Sport="Running"><Id>${start}</Id><Lap StartTime="${start}"><Track>${points.join('')}</Track></Lap></Activity>`
}

function tcxDocument(activities: string[]): Uint8Array {
  const xml =
    '<?xml version="1.0"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">' +
    `<Activities>${activities.join('')}</Activities></TrainingCenterDatabase>`
  return new TextEncoder().encode(xml)
}

function tcxStartingAt(startM: number): Uint8Array {
  return tcxDocument([activityXml(0, startM)])
}

function fitStartingAt(startM: number): Uint8Array {
  const records = secondly(START_MS, SECONDS, { speed: METRES_PER_SECOND, gps: true })
  records.forEach((record, s) => (record.distance = startM + s * METRES_PER_SECOND))
  return buildFit({
    sessions: [{ sport: 'running', startMs: START_MS, durationS: SECONDS, records }],
  })
}

const MOVED_M = (SECONDS - 1) * METRES_PER_SECOND

describe('a file whose device distance does not start at zero', () => {
  it.each([
    ['TCX', () => parseTcx(tcxStartingAt(DEVICE_START_M), 'offset.tcx')],
    ['FIT', () => parseFit(fitStartingAt(DEVICE_START_M), 'offset.fit')],
  ])('counts a %s activity from its own start', (_name, parse) => {
    const activity = onlyActivity(parse())
    expect(activity.distance[0]).toBe(0)
    expect(activity.distance[activity.n - 1]).toBeCloseTo(MOVED_M, 6)
    expect(digestActivity(activity).distanceM).toBeCloseTo(MOVED_M, 6)
  })

  it('gives the same activity as the same file counted from zero', () => {
    const offset = onlyActivity(parseTcx(tcxStartingAt(DEVICE_START_M), 'offset.tcx'))
    const zero = onlyActivity(parseTcx(tcxStartingAt(0), 'offset.tcx'))
    expect(Array.from(offset.distance)).toEqual(Array.from(zero.distance))
    expect(digestActivity(offset).splits).toEqual(digestActivity(zero).splits)
  })
})

/** A FIT of one session at `speed` m/s whose distance first appears at `firstAtS`, `startM` metres in. */
function fitWithDistanceFrom(
  sport: 'running' | 'cycling',
  speed: number,
  startM: number,
  firstAtS = 0,
): Uint8Array {
  const records = secondly(START_MS, SECONDS, { speed, gps: true })
  records.forEach((record, s) => {
    if (s >= firstAtS) record.distance = startM + (s - firstAtS) * speed
  })
  return buildFit({ sessions: [{ sport, startMs: START_MS, durationS: SECONDS, records }] })
}

function firstDistanceOf(bytes: Uint8Array): number {
  return onlyActivity(parseFit(bytes, 'edge.fit')).distance[0]!
}

describe('how far a first distance may be from zero and still be a head start', () => {
  // The file's own fastest sample (4 m/s run, 9 m/s ride) allows 30 s of it: 120 m and 270 m.
  it.each([
    ['running', 4, 120],
    ['cycling', 9, 270],
  ] as const)(
    'keeps a %s head start just under the bound and drops one just over',
    (sport, speed, bound) => {
      expect(firstDistanceOf(fitWithDistanceFrom(sport, speed, 7))).toBe(7)
      expect(firstDistanceOf(fitWithDistanceFrom(sport, speed, bound - 1))).toBe(bound - 1)
      expect(firstDistanceOf(fitWithDistanceFrom(sport, speed, bound + 1))).toBe(0)
    },
  )

  it('drops a resumed file that starts at 800 m on a ride or 300 m on a run', () => {
    expect(firstDistanceOf(fitWithDistanceFrom('cycling', 8, 800))).toBe(0)
    expect(firstDistanceOf(fitWithDistanceFrom('running', 3, 300))).toBe(0)
  })

  it('allows the time before the first distance as well: 150 s without one, then 1050 m at 7 m/s', () => {
    const activity = onlyActivity(
      parseFit(fitWithDistanceFrom('cycling', 7, 1050, 150), 'late.fit'),
    )
    expect(activity.distance[0]).toBe(1050)
    expect(activity.distance[activity.n - 1]).toBe(1050 + 7 * (SECONDS - 1 - 150))
    // The same late start with a distance no ride could have covered by then is dropped.
    expect(firstDistanceOf(fitWithDistanceFrom('cycling', 7, 3000, 150))).toBe(0)
  })

  it('judges each unit of a TCX on its own: a small head start is kept, a far one is not', () => {
    const doc = tcxDocument([activityXml(0, 7), activityXml(3600, 5000)])
    const result = parseTcx(doc, 'two.tcx')
    if (!result.ok) throw new Error(result.reason)
    expect(result.activities.map((a) => a.distance[0])).toEqual([7, 0])
  })
})
