import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../constants'
import { combine } from '../digest/combine'
import { copiedLibrary } from '../test/libraryFixture'
import { fastestMs } from '../test/timing'
import { trainingWeeks } from './calendar'
import { historyOf } from './compute'
import type { HistoryInput } from './types'

/** The History page's budget, for every part in parts.ts together: 100 ms to build, 2 ms again, 24 KB posted. */
// A maximum heart rate for each sport, so the intensity part cuts every activity into zones, as a real library does.
const INPUT: HistoryInput = {
  settings: {
    massKg: 70,
    bikeMassKg: 9,
    measurements: [
      { kind: 'maxHeartRate', sport: 'run', value: 190, from: '2020-01-01' },
      { kind: 'maxHeartRate', sport: 'ride', value: 185, from: '2020-01-01' },
    ],
  },
  setAside: new Set(),
  heartRateSetAside: new Set(),
  estimates: null,
  nowMs: Date.UTC(2034, 0, 1),
  // As a session passes them: the library's judged ride gate (none), its calibration and its heart-rate references.
  gate: null,
  calibration: { kappa: 1.1, lnKappaSe: 0.1 },
  effortReference: {
    referenceHr: { run: 185, ride: 180 },
    reading: { run: 'trusted', ride: 'trusted' },
    source: { run: 'data', ride: 'data' },
    from: { run: null, ride: null },
  },
}

describe('the history of a long library', () => {
  it('builds 2,000 activities over 13 years in under 100 ms, again in under 2 ms, and posts under 24 KB', () => {
    const start = Date.UTC(2021, 0, 4)
    const digests = copiedLibrary(2000).map((digest, i) =>
      Object.assign({}, digest, { startMs: start + Math.round(i * 2.4 * DAY_MS) }),
    )
    // In the app the analysis of the chosen period has run in this worker before the history is built, so the code both
    // read (best curves, gates, running equivalents) is warm. A short period of the library stands for it.
    combine(digests.slice(0, 150), INPUT.settings)
    const t0 = performance.now()
    const history = historyOf(digests, INPUT)
    const first = performance.now() - t0
    const again = fastestMs(() => void historyOf(digests, INPUT))
    const bytes = JSON.stringify(history).length
    const calendarBytes = JSON.stringify(history.calendar).length
    console.info(
      `2000 activities: ${first.toFixed(1)} ms, again ${again.toFixed(2)} ms, ${bytes} bytes (${calendarBytes} the calendar)`,
    )
    expect(history.years.length).toBeGreaterThanOrEqual(13)
    expect(trainingWeeks(history.calendar).length).toBeGreaterThanOrEqual(13 * 52)
    expect(history.yearCurves.ride.years.length).toBeGreaterThanOrEqual(13)
    // Thirteen years of weeks of two sports, every week trained: a quarter of the page's whole budget at most.
    expect(calendarBytes).toBeLessThan(6000)
    expect(first).toBeLessThan(100)
    expect(again).toBeLessThan(2)
    expect(bytes).toBeLessThan(24_000)
  })
})
