import { describe, expect, it } from 'vitest'
import { digestActivity } from '../digest/digestActivity'
import { buildFit } from '../fit/fitTestFiles'
import { parseActivityFile } from './index'

/*
 * One 2600 s run at 4 m/s from each importer, with seconds 1250 to 1309 unrecorded. The athlete
 * stands in the gap, so distance does not step across it. Only the unrecorded mask can keep a
 * window from spanning those seconds, so each importer's file must lead to the same answer.
 */

const T0 = Date.UTC(2026, 4, 1, 8, 0, 0)
const N = 2600
const GAP_START = 1250
const GAP_END = 1310
const isGap = (t: number) => t >= GAP_START && t < GAP_END
const iso = (t: number) => new Date(T0 + t * 1000).toISOString()
/** Seconds of motion before second t: the athlete stands still while the device is blind. */
const movingBefore = (t: number) =>
  t < GAP_START ? t : t < GAP_END ? GAP_START : t - (GAP_END - GAP_START)
const recorded = Array.from({ length: N }, (_, t) => t).filter((t) => !isGap(t))
/** Longitude that advances 4 m/s, so the position and the speed agree. */
const lonAt = (t: number) => ((4 * movingBefore(t)) / 70100).toFixed(7)

const session = {
  sport: 'running' as const,
  startMs: T0,
  durationS: N,
  records: recorded.map((t) => ({ tMs: T0 + t * 1000, speed: t === 0 ? 0 : 4, gps: true })),
}
const fit = buildFit({ sessions: [session] })
const fitTimed = buildFit({
  sessions: [session],
  timerEvents: [
    { tMs: T0 + GAP_START * 1000, eventType: 'stop' },
    { tMs: T0 + GAP_END * 1000, eventType: 'start' },
  ],
})
const gpx = `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1"><trk><type>running</type><trkseg>${recorded
  .map((t) => `<trkpt lat="51.0000000" lon="${lonAt(t)}"><time>${iso(t)}</time></trkpt>`)
  .join('')}</trkseg></trk></gpx>`
const tcx = `<?xml version="1.0" encoding="UTF-8"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities><Activity Sport="Running"><Id>${iso(0)}</Id><Lap StartTime="${iso(0)}"><TotalTimeSeconds>${N}</TotalTimeSeconds><DistanceMeters>10000</DistanceMeters><Intensity>Active</Intensity><TriggerMethod>Manual</TriggerMethod><Track>${recorded
  .map(
    (t) =>
      `<Trackpoint><Time>${iso(t)}</Time><Position><LatitudeDegrees>51</LatitudeDegrees><LongitudeDegrees>${lonAt(t)}</LongitudeDegrees></Position><DistanceMeters>${4 * movingBefore(t)}</DistanceMeters></Trackpoint>`,
  )
  .join('')}</Track></Lap></Activity></Activities></TrainingCenterDatabase>`

const enc = (text: string) => new TextEncoder().encode(text)

/** The digest of the one run in a file, asserting that the importer accepted it. */
function digestOf(bytes: Uint8Array, name: string) {
  const parsed = parseActivityFile(bytes, name)
  expect(parsed.ok, name).toBe(true)
  if (!parsed.ok) throw new Error(name)
  expect(parsed.activities.length, name).toBe(1)
  return digestActivity(parsed.activities[0]!)
}

/** The best time over one record distance, or undefined when no window covers it. */
function bestAt(digest: ReturnType<typeof digestOf>, distanceM: number): number | undefined {
  return digest.distanceBests?.find((b) => b.distanceM === distanceM)?.seconds
}

describe('distance bests across an untimed dropout, from each importer', () => {
  it.each([
    ['FIT with no timer events', fit, 'dropout.fit'],
    ['GPX with no timer events', enc(gpx), 'dropout.gpx'],
    ['TCX with no timer events', enc(tcx), 'dropout.tcx'],
  ])('%s: a 1 km best exists, and no 10 km best spans the gap', (_label, bytes, name) => {
    const digest = digestOf(bytes, name)
    expect(bestAt(digest, 1000)).toBeGreaterThan(0)
    expect(bestAt(digest, 10000)).toBeUndefined()
  })

  it('FIT with timer events: the timed pause counts as time, so a 10 km best exists', () => {
    // 2500 s of motion plus the 60 s pause, which is real time and is not unrecorded.
    const seconds = bestAt(digestOf(fitTimed, 'timed.fit'), 10000)
    expect(seconds).toBeGreaterThanOrEqual(2550)
    expect(seconds).toBeLessThanOrEqual(2570)
  })
})
