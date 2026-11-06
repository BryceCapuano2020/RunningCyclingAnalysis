import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../constants'
import { combine } from '../digest/combine'
import { plantedLibrary } from '../findings/test/plantedLibrary'
import { fitnessStatuses } from '../fitness/compute'
import { lookBackOf } from '../lookback/compute'
import { copiedLibrary } from '../test/libraryFixture'
import { fastestMs } from '../test/timing'
import type { ActivityDigest } from '../types'
import { historyOf } from './compute'
import type { HistoryInput } from './types'

/**
 * The History page's budget, for every part in parts.ts together: BUILD_BUDGET_MS to build, 2 ms again, and a posted size of
 * 23,100 bytes, which is the 19,267 that the parts post for this library with a fifth of headroom on top (10,043 of them
 * the fitness dots, about 7 bytes for each steady activity).
 *
 * The build was 100 ms (the CI runner took 75 to 94) until Balance over the years graded each year by its threshold (U3): a
 * year is now analysed as the hero analyses a window of that year alone (its own bike model, best curves and threshold
 * estimate), so an equal window grades to the same number, and that is 13 small analyses. The runner then took 142 ms to
 * build this library and 93 ms for the dots, both against 100. It is built once per change of the library and then kept
 * (about 0.2 ms again), so the budget is 170, about a fifth over the runner's figure; a pass per activity per year would
 * cost several times that and still fail it.
 */
const POSTED_BYTES_MAX = 23_100
const BUILD_BUDGET_MS = 170

// A maximum heart rate for each sport, so the zone time cuts every activity into zones, as a real library does.
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
  // As a session passes them: the library's judged ride gate (none) and its heart-rate references.
  gate: null,
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
  it(`builds 2,000 activities over 13 years in under ${BUILD_BUDGET_MS} ms, again in under 2 ms, and posts under 23.1 KB`, () => {
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
    const byPart = Object.entries(history)
      .map(([name, answer]) => `${name} ${JSON.stringify(answer).length}`)
      .join(', ')
    console.info(
      `2000 activities: ${first.toFixed(1)} ms, again ${again.toFixed(2)} ms, ${bytes} bytes (${byPart})`,
    )
    expect(history.years.length).toBeGreaterThanOrEqual(13)
    expect(first).toBeLessThan(BUILD_BUDGET_MS)
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
    expect(first).toBeLessThan(BUILD_BUDGET_MS)
    expect(again).toBeLessThan(2)
    // About 7 bytes a dot, so the part holds to 8 KB a thousand dots.
    expect(fitnessBytes).toBeLessThan(dots * 8)
  })
})
