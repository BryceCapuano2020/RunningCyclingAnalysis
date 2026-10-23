import { describe, expect, it } from 'vitest'
import { parseTcx } from './parse'

const START_MS = Date.UTC(2024, 4, 1, 7, 30, 0)
const NOW_MS = Date.UTC(2026, 9, 22)

function isoAt(second: number): string {
  return new Date(START_MS + second * 1000).toISOString()
}

/** A trackpoint with a time, a position, a distance and a heart rate. */
function point(second: number): string {
  return (
    `<Trackpoint><Time>${isoAt(second)}</Time>` +
    '<Position><LatitudeDegrees>51.5</LatitudeDegrees>' +
    '<LongitudeDegrees>-0.12</LongitudeDegrees></Position>' +
    `<DistanceMeters>${second * 3.5}</DistanceMeters>` +
    '<HeartRateBpm><Value>140</Value></HeartRateBpm></Trackpoint>'
  )
}

/** A one-lap running document around `points`, in the shape the unit tests use. */
function documentOf(points: string[]): Uint8Array {
  const lap =
    `<Lap StartTime="${isoAt(0)}"><TotalTimeSeconds>0</TotalTimeSeconds>` +
    `<Track>${points.join('')}</Track></Lap>`
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">' +
    `<Activities><Activity Sport="Running"><Id>${isoAt(0)}</Id>${lap}</Activity>` +
    '</Activities></TrainingCenterDatabase>\n'
  return new TextEncoder().encode(xml)
}

describe('parseTcx performance', () => {
  it('scans 176k trackpoints in under 4 s', () => {
    // One point a second for 176k seconds. That spans more than 48 hours, so the pipeline refuses
    // the file after the whole scan. The timing covers the scan and the record build.
    const points: string[] = []
    for (let s = 0; s < 176_000; s++) points.push(point(s))
    const bytes = documentOf(points)
    const began = performance.now()
    const result = parseTcx(bytes, 'big.tcx', undefined, { nowMs: NOW_MS })
    const elapsed = performance.now() - began
    if (result.ok) throw new Error('expected a failure')
    expect(result.reason).toBe('Activity is longer than 48 hours')
    expect(elapsed).toBeLessThan(4_000)
  }, 120_000)
})
