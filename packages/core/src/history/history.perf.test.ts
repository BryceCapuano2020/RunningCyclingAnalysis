import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../constants'
import { combine } from '../digest/combine'
import { plantedLibrary } from '../findings/test/plantedLibrary'
import { fitnessStatuses } from '../fitness/compute'
import { lookBackOf } from '../lookback/compute'
import { copiedLibrary } from '../test/libraryFixture'
import { fastestMs } from '../test/timing'
import type { ActivityDigest } from '../types'
import { trainingWeeks } from './calendar'
import { historyOf } from './compute'
import type { HistoryInput } from './types'

/**
 * The History page's budget, for every part in parts.ts together: 100 ms to build, 2 ms again, and a posted size of
 * 47,900 bytes, which is the 39,885 that the parts post for this library with a fifth of headroom on top (10,043 of them
 * the fitness dots, about 7 bytes for each steady activity).
 */
const POSTED_BYTES_MAX = 47_900

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

/** The session reads the card and the look-back before the History page asks, so the page's own cost is what is timed. */
function readLikeTheSession(digests: ActivityDigest[], input: HistoryInput): void {
  fitnessStatuses(digests, input.setAside)
  lookBackOf(digests, input.settings, input.setAside, input.gate)
}

describe('the history of a long library', () => {
  it('builds 2,000 activities over 13 years in under 100 ms, again in under 2 ms, and posts under 47.9 KB', () => {
    const start = Date.UTC(2021, 0, 4)
    const digests = copiedLibrary(2000).map((digest, i) =>
      Object.assign({}, digest, { startMs: start + Math.round(i * 2.4 * DAY_MS) }),
    )
    // In the app the analysis of the chosen period has run in this worker before the history is built, so the code both
    // read (best curves, gates, running equivalents) is warm. A short period of the library stands for it.
    combine(digests.slice(0, 150), INPUT.settings)
    readLikeTheSession(digests, INPUT)
    const t0 = performance.now()
    const history = historyOf(digests, INPUT)
    const first = performance.now() - t0
    const again = fastestMs(() => void historyOf(digests, INPUT))
    const bytes = JSON.stringify(history).length
    const calendarBytes = JSON.stringify(history.calendar).length
    const byPart = Object.entries(history)
      .map(([name, answer]) => `${name} ${JSON.stringify(answer).length}`)
      .join(', ')
    console.info(
      `2000 activities: ${first.toFixed(1)} ms, again ${again.toFixed(2)} ms, ${bytes} bytes (${byPart})`,
    )
    expect(history.years.length).toBeGreaterThanOrEqual(13)
    expect(trainingWeeks(history.calendar).length).toBeGreaterThanOrEqual(13 * 52)
    expect(history.yearCurves.ride.years.length).toBeGreaterThanOrEqual(13)
    // Thirteen years of weeks of two sports, every week trained, at three characters a week and sport.
    expect(calendarBytes).toBeLessThan(6000)
    expect(first).toBeLessThan(100)
    expect(again).toBeLessThan(2)
    expect(bytes).toBeLessThan(POSTED_BYTES_MAX)
  })

  it('draws a dot for every steady activity of 2,000 within the same budget, once the card and the look-back have read them', () => {
    // About 2,000 activities of two sports over 250 weeks, nearly all steady: the dearest case for the fitness dots.
    const library = plantedLibrary({
      seed: 9,
      weeks: 250,
      perWeek: 8,
      sports: ['run', 'ride'],
      noise: 0.03,
      noiseModel: { autocorrelation: 0.9, heavyTails: true },
      effects: [
        { type: 'efficiency-shift', atWeek: 120, size: -0.1 },
        { type: 'efficiency-shift', atWeek: 180, size: 0.11 },
      ],
    })
    readLikeTheSession(library.digests, INPUT)
    const t0 = performance.now()
    const history = historyOf(library.digests, INPUT)
    const first = performance.now() - t0
    const again = fastestMs(() => void historyOf(library.digests, INPUT))
    const dots = history.fitness.run.levels.length + history.fitness.ride.levels.length
    const fitnessBytes = JSON.stringify(history.fitness).length
    console.info(
      `${dots} dots: ${first.toFixed(1)} ms, again ${again.toFixed(2)} ms, ${fitnessBytes} bytes`,
    )
    expect(dots).toBeGreaterThan(1500)
    expect(first).toBeLessThan(100)
    expect(again).toBeLessThan(2)
    // About 7 bytes a dot, so the part holds to 8 KB a thousand dots.
    expect(fitnessBytes).toBeLessThan(dots * 8)
  })
})
