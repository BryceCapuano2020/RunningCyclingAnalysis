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

function tcxStartingAt(startM: number): Uint8Array {
  const points = Array.from({ length: SECONDS }, (_, s) => {
    const time = new Date(START_MS + s * 1000).toISOString()
    const lat = 51.5 + s * 0.00003
    return (
      `<Trackpoint><Time>${time}</Time>` +
      `<Position><LatitudeDegrees>${lat}</LatitudeDegrees><LongitudeDegrees>-0.12</LongitudeDegrees></Position>` +
      `<DistanceMeters>${startM + s * METRES_PER_SECOND}</DistanceMeters></Trackpoint>`
    )
  })
  const xml =
    '<?xml version="1.0"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">' +
    `<Activities><Activity Sport="Running"><Id>${new Date(START_MS).toISOString()}</Id>` +
    `<Lap StartTime="${new Date(START_MS).toISOString()}"><Track>${points.join('')}</Track></Lap>` +
    '</Activity></Activities></TrainingCenterDatabase>'
  return new TextEncoder().encode(xml)
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
