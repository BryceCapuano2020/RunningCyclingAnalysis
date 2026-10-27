import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PROGRESS_INTERVAL_MS, throttled } from './progressThrottle'

let clock = 0

function setup() {
  const sent: number[] = []
  const progress = throttled<number>(
    (value) => sent.push(value),
    () => clock,
  )
  return { sent, progress }
}

beforeEach(() => {
  clock = 0
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('throttled', () => {
  it('sends the first value at once', () => {
    const { sent, progress } = setup()
    progress.report(1)
    expect(sent).toEqual([1])
  })

  it('sends about four a second: values inside the interval wait, and only the latest goes', async () => {
    const { sent, progress } = setup()
    progress.report(1)
    for (const value of [2, 3, 4]) {
      clock += 50
      progress.report(value)
    }
    expect(sent).toEqual([1])

    clock = PROGRESS_INTERVAL_MS
    await vi.advanceTimersByTimeAsync(PROGRESS_INTERVAL_MS)
    expect(sent).toEqual([1, 4])
  })

  it('sends a value that arrives after the interval at once', () => {
    const { sent, progress } = setup()
    progress.report(1)
    clock = PROGRESS_INTERVAL_MS
    progress.report(2)
    expect(sent).toEqual([1, 2])
  })

  it('sends the latest value when the interval has passed with no more coming', async () => {
    const { sent, progress } = setup()
    progress.report(1)
    clock += 10
    progress.report(2)
    clock += PROGRESS_INTERVAL_MS
    await vi.advanceTimersByTimeAsync(PROGRESS_INTERVAL_MS)
    expect(sent).toEqual([1, 2])
    await vi.advanceTimersByTimeAsync(5_000)
    expect(sent).toEqual([1, 2])
  })

  it('flushes the latest value now, exactly once', async () => {
    const { sent, progress } = setup()
    progress.report(1)
    progress.report(2)
    progress.report(3)
    progress.flush()
    expect(sent).toEqual([1, 3])
    progress.flush()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(sent).toEqual([1, 3])
  })

  it('sends a value now when asked, without waiting for the interval', () => {
    const { sent, progress } = setup()
    progress.report(1)
    progress.report(2)
    progress.report(3, true)
    expect(sent).toEqual([1, 3])
  })
})
