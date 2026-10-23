import { describe, expect, it } from 'vitest'
import { buildFit, secondly } from './fitTestFiles'
import { parseFit } from './parse'

const START_MS = Date.UTC(2024, 4, 1, 7, 30, 0)

describe('parseFit performance', () => {
  it('matches thousands of records to sessions without a quadratic scan', () => {
    const count = 2800
    const sessions = Array.from({ length: count }, (_, k) => {
      const startMs = START_MS + k * 120_000
      return {
        sport: 'cycling' as const,
        startMs,
        durationS: 60,
        records: secondly(startMs, 60, { speed: 8 }),
      }
    })
    const bytes = buildFit({ sessions })
    const began = performance.now()
    const result = parseFit(bytes, 'many-sessions.fit')
    const elapsed = performance.now() - began
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.activities.length).toBe(count)
    expect(elapsed).toBeLessThan(2000)
  })
})
