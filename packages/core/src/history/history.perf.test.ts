import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../constants'
import { copiedLibrary } from '../test/libraryFixture'
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

describe('the history of a long library', () => {
  it('builds 2,000 activities over 13 years in under 100 ms, again in under 2 ms, and posts under 24 KB', () => {
    const start = Date.UTC(2021, 0, 4)
    const digests = copiedLibrary(2000).map((digest, i) =>
      Object.assign({}, digest, { startMs: start + Math.round(i * 2.4 * DAY_MS) }),
    )
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
})
