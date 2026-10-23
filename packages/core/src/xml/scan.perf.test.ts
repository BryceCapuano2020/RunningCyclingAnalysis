import { describe, expect, it } from 'vitest'
import { scanXml } from './parse'

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

const forceGc = (globalThis as { gc?: () => void }).gc
const processInfo = (
  globalThis as unknown as {
    process: { memoryUsage(): { heapUsed: number } }
  }
).process

describe('scanXml memory', () => {
  // The perf config passes --expose-gc. Without it the heap readings include garbage, so the
  // assertion is skipped rather than made flaky.
  it.skipIf(forceGc === undefined)(
    'keeps heap growth under twice the source size on 200,000 trackpoints',
    () => {
      const collect = (): void => forceGc?.()
      const text = gpxLike(200_000)
      let before = 0
      let peak = 0
      let trackpoints = 0
      scanXml(text, {
        open(_local, _name, _attrs, depth) {
          if (depth === 1) {
            collect()
            before = processInfo.memoryUsage().heapUsed
          }
        },
        close(local, _name, depth) {
          // gpx > trk > trkseg > trkpt: the trackpoints sit at depth 4.
          if (local !== 'trkpt' || depth !== 4) return
          trackpoints++
          if (trackpoints % 10_000 === 0) {
            collect()
            peak = Math.max(peak, processInfo.memoryUsage().heapUsed)
          }
        },
      })
      collect()
      peak = Math.max(peak, processInfo.memoryUsage().heapUsed)

      expect(trackpoints).toBe(200_000)
      expect(peak - before).toBeLessThan(2 * text.length)
    },
    120_000,
  )
})

describe('scanXml performance', () => {
  it('scans 200,000 trackpoints in under 3 s', () => {
    const big = gpxLike(200_000)
    let trackpoints = 0
    const countTrackpoints = {
      close(local: string) {
        if (local === 'trkpt') trackpoints++
      },
    }
    const start = performance.now()
    scanXml(big, countTrackpoints)
    const ms = performance.now() - start

    expect(trackpoints).toBe(200_000)
    expect(ms).toBeLessThan(3_000)
  }, 120_000)
})
