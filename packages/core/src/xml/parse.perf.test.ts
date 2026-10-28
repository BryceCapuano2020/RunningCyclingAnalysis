import { describe, expect, it } from 'vitest'
import { fastestMs } from '../test/timing'
import { DEFAULT_XML_LIMITS, parseXml } from './parse'

/** The GPX namespace declarations a real Garmin export carries. */
const GPX_OPEN =
  '<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1" ' +
  'xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">'

/** A GPX-like document with `points` trackpoints, about 150 bytes each. */
function gpxLike(points: number): string {
  const parts: string[] = ['<?xml version="1.0" encoding="UTF-8"?>\n', GPX_OPEN, '<trk><trkseg>']
  for (let i = 0; i < points; i++) {
    const hr = 120 + (i % 60)
    parts.push(
      `<trkpt lat="51.${i % 1000}" lon="-0.1${i % 100}"><ele>${100 + (i % 50)}.5</ele>` +
        `<time>2025-05-01T07:${String(i % 60).padStart(2, '0')}:00Z</time>` +
        `<extensions><gpxtpx:hr>${hr}</gpxtpx:hr></extensions></trkpt>\n`,
    )
  }
  parts.push('</trkseg></trk></gpx>\n')
  return parts.join('')
}

describe('parseXml performance', () => {
  it('parses 200,000 trackpoints in under 3 s and scales linearly', () => {
    const small = gpxLike(50_000)
    const big = gpxLike(200_000)
    // gpx > trk > trkseg holds the trackpoints.
    const doc = parseXml(big, DEFAULT_XML_LIMITS)
    expect(doc.children[0]!.children[0]!.children).toHaveLength(200_000)

    // Each size is timed as the fastest of several warm parses. A single parse of each let a garbage
    // collection or a scheduler pause on a shared CI runner land in one side of the ratio: it reached
    // 6.1 there, while 20 fresh local runs spread from 2.9 to 4.3. Timed this way the same 20 runs
    // spread from 3.5 to 4.1. The parse above warms the big document's path.
    parseXml(small, DEFAULT_XML_LIMITS)
    const smallMs = fastestMs(() => parseXml(small, DEFAULT_XML_LIMITS), 5)
    const bigMs = fastestMs(() => parseXml(big, DEFAULT_XML_LIMITS), 3)

    expect(bigMs).toBeLessThan(3_000)
    // Linear work gives about 4 for four times the input. Quadratic work gives about 16.
    expect(bigMs / smallMs).toBeLessThan(6)
  }, 120_000)
})
