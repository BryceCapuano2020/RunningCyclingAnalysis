import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../constants'
import { plantedLibrary } from '../findings/test/plantedLibrary'
import { fitnessStatuses } from '../fitness/compute'
import { lookBackOf } from '../lookback/compute'
import { copiedLibrary } from '../test/libraryFixture'
import type { ActivityDigest } from '../types'
import { fastestMs } from '../test/timing'
import { historyOf } from './compute'
import type { HistoryInput } from './types'

/** The History page's budget, for every part in parts.ts together: 100 ms to build, 2 ms again, 24 KB posted. */
const INPUT: HistoryInput = {
  settings: { massKg: 70, bikeMassKg: 9 },
  setAside: new Set(),
  nowMs: Date.UTC(2034, 0, 1),
  gate: undefined,
}

/** The session reads the card and the look-back before the History page asks, so the page's own cost is what is timed. */
function readLikeTheSession(digests: ActivityDigest[], input: HistoryInput): void {
  fitnessStatuses(digests, input.setAside, { nowMs: input.nowMs })
  lookBackOf(digests, input.settings, input.setAside, input.nowMs)
}

describe('the history of a long library', () => {
  it('builds 2,000 activities over 13 years in under 100 ms, again in under 2 ms, and posts under 24 KB', () => {
    const start = Date.UTC(2021, 0, 4)
    const digests = copiedLibrary(2000).map((digest, i) =>
      Object.assign({}, digest, { startMs: start + Math.round(i * 2.4 * DAY_MS) }),
    )
    readLikeTheSession(digests, INPUT)
    const t0 = performance.now()
    const history = historyOf(digests, INPUT)
    const first = performance.now() - t0
    const again = fastestMs(() => void historyOf(digests, INPUT))
    const bytes = JSON.stringify(history).length
    console.info(
      `2000 activities: ${first.toFixed(1)} ms, again ${again.toFixed(2)} ms, ${bytes} bytes`,
    )
    expect(history.years.length).toBeGreaterThanOrEqual(13)
    expect(first).toBeLessThan(100)
    expect(again).toBeLessThan(2)
    expect(bytes).toBeLessThan(24_000)
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
    const input: HistoryInput = { ...INPUT, nowMs: library.lastMs }
    readLikeTheSession(library.digests, input)
    const t0 = performance.now()
    const history = historyOf(library.digests, input)
    const first = performance.now() - t0
    const again = fastestMs(() => void historyOf(library.digests, input))
    const bytes = JSON.stringify(history).length
    const dots = history.fitness.run.levels.length + history.fitness.ride.levels.length
    console.info(
      `${dots} dots: ${first.toFixed(1)} ms, again ${again.toFixed(2)} ms, ${bytes} bytes`,
    )
    expect(dots).toBeGreaterThan(1500)
    expect(first).toBeLessThan(100)
    expect(again).toBeLessThan(2)
    expect(bytes).toBeLessThan(24_000)
  })
})
