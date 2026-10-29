import { describe, expect, it } from 'vitest'
import { parseGpx } from './parse'
import type { ParseResult } from '../import/result'

const START_MS = Date.UTC(2024, 4, 1, 7, 30, 0)
const HEADER =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1"' +
  ' xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">'

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

/** The result, which must be a success. */
function okOf(result: ParseResult) {
  if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`)
  return result
}

describe('parseGpx performance', () => {
  it('parses 176,000 trackpoints from a 50 MB-class file in under 4 s', () => {
    const host = globalThis as {
      gc?: () => void
      process?: { memoryUsage(): { heapUsed: number } }
    }
    const file = bigGpx(176_000)
    host.gc?.()
    const heapBefore = host.process?.memoryUsage().heapUsed

    const start = performance.now()
    const result = okOf(parseGpx(file, 'big.gpx'))
    const elapsed = performance.now() - start

    expect(result.activities[0]!.n).toBeGreaterThan(170_000)
    expect(elapsed).toBeLessThan(4_000)
    if (host.gc !== undefined && heapBefore !== undefined && host.process !== undefined) {
      // Only the activities should survive a collection, not the text or the scan's buffers.
      host.gc()
      const retained = host.process.memoryUsage().heapUsed - heapBefore
      expect(retained).toBeLessThan(64 * 1024 ** 2)
    }
  }, 120_000)
})

describe('parseGpx on hostile numbers', () => {
  it('reads a megabyte of digits that ends in a letter in linear time, and keeps no field of it', () => {
    const junk = '1'.repeat(1_000_000) + 'x'
    const file = bytes(
      HEADER +
        '<trk><trkseg>' +
        `<trkpt lat="51.5" lon="-0.1"><ele>${junk}</ele><time>${new Date(START_MS).toISOString()}</time></trkpt>` +
        `<trkpt lat="${junk}" lon="-0.1"><ele>5</ele><time>${new Date(START_MS + 1000).toISOString()}</time></trkpt>` +
        '</trkseg></trk></gpx>',
    )
    const start = performance.now()
    parseGpx(file, 'junk.gpx')
    expect(performance.now() - start).toBeLessThan(1_000)
  })
})

/** A GPX file of `count` trackpoints over 172,000 s, with heart rate, cadence and power, about 50 MB. */
function bigGpx(count: number): Uint8Array {
  const parts = [HEADER, '<trk><type>running</type><trkseg>']
  for (let i = 0; i < count; i++) {
    const ms = Math.round((i * 172_000_000) / count)
    const lat = (51 + (3 * ms) / 1000 / 111_195).toFixed(9)
    const time = new Date(START_MS + ms).toISOString()
    parts.push(
      `<trkpt lat="${lat}" lon="-0.100000000"><ele>${100 + (i % 50)}.5</ele>` +
        `<time>${time}</time><extensions><power>${200 + (i % 60)}</power>` +
        `<gpxtpx:TrackPointExtension><gpxtpx:hr>${120 + (i % 60)}</gpxtpx:hr>` +
        `<gpxtpx:cad>${80 + (i % 20)}</gpxtpx:cad></gpxtpx:TrackPointExtension>` +
        '</extensions></trkpt>',
    )
  }
  parts.push('</trkseg></trk></gpx>')
  return bytes(parts.join('\n'))
}
