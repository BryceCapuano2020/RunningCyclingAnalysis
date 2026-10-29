import { describe, expect, it } from 'vitest'
import { reduceSeries, smoothedStream } from './timeSeriesModel'

/**
 * A six-hour ride at 1 Hz, five channels, is reduced at every step of a brush drag, so one step must stay
 * well inside a frame. The running sums are made once per trace; a step only reads the window.
 */
const SECONDS = 6 * 3600
const BUDGET_MS = 30

function ride(): ReturnType<typeof smoothedStream>[] {
  return Array.from({ length: 5 }, (_, channel) =>
    smoothedStream(
      Float32Array.from({ length: SECONDS }, (_, i) =>
        i % 997 === channel ? Number.NaN : 100 + 50 * Math.sin(i / 600 + channel) + (i % 13),
      ),
    ),
  )
}

/** The fastest of five timed runs, ms, so neither the cold first call nor a stray pause counts. */
function fastestMs(run: () => void): number {
  let fastest = Infinity
  for (let i = 0; i < 5; i++) {
    const start = performance.now()
    run()
    fastest = Math.min(fastest, performance.now() - start)
  }
  return fastest
}

describe('reduceSeries performance', () => {
  const streams = ride()

  it(`reduces five channels over the whole ride in under ${BUDGET_MS} ms`, () => {
    let columns = 0
    const ms = fastestMs(() => {
      columns = streams.map((stream) => reduceSeries(stream, 0, SECONDS, 700)).at(-1)!.x.length
    })
    expect(columns).toBe(700)
    expect(ms).toBeLessThan(BUDGET_MS)
  })

  it(`reduces a half-hour window of the ride in under ${BUDGET_MS} ms`, () => {
    const ms = fastestMs(() => {
      for (const stream of streams) reduceSeries(stream, 9000, 10_800, 700)
    })
    expect(ms).toBeLessThan(BUDGET_MS)
  })
})
