import { SyncFailure } from '@rca/core/session'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError } from '../api/client'
import { RATE_LIMIT_WINDOW_MS, retryAfterRateLimit } from './rateLimitRetry'

const limited = (retryAfterMs?: number) =>
  new ApiRequestError(429, 'rate_limited', 'Slow down', retryAfterMs)

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('retryAfterRateLimit', () => {
  it('returns the result of a save that works, without waiting', async () => {
    const attempt = vi.fn().mockResolvedValue('saved')
    await expect(retryAfterRateLimit(attempt)).resolves.toBe('saved')
    expect(attempt).toHaveBeenCalledOnce()
  })

  it('waits for the server Retry-After, then tries the same save once more', async () => {
    const attempt = vi.fn().mockRejectedValueOnce(limited(60_000)).mockResolvedValueOnce('saved')
    const result = retryAfterRateLimit(attempt)

    await vi.advanceTimersByTimeAsync(59_999)
    expect(attempt).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1)
    await expect(result).resolves.toBe('saved')
    expect(attempt).toHaveBeenCalledTimes(2)
  })

  it('says it is about to wait, before it does, and says nothing when it does not', async () => {
    const events: string[] = []
    const attempt = vi.fn(async () => {
      events.push(`attempt ${attempt.mock.calls.length}`)
      if (attempt.mock.calls.length === 1) throw limited(5_000)
    })
    const result = retryAfterRateLimit(attempt, () => events.push('waiting'))

    await vi.advanceTimersByTimeAsync(0)
    expect(events).toEqual(['attempt 1', 'waiting'])
    await vi.advanceTimersByTimeAsync(5_000)
    await result
    expect(events).toEqual(['attempt 1', 'waiting', 'attempt 2'])

    const quiet = vi.fn()
    await retryAfterRateLimit(async () => 'saved', quiet)
    await expect(
      retryAfterRateLimit(async () => {
        throw limited(2 * RATE_LIMIT_WINDOW_MS + 1)
      }, quiet),
    ).rejects.toMatchObject({ status: 429 })
    expect(quiet).not.toHaveBeenCalled()
  })

  it('waits as long as the server asked, whatever the usual window', async () => {
    const attempt = vi.fn().mockRejectedValueOnce(limited(7_000)).mockResolvedValueOnce('saved')
    const result = retryAfterRateLimit(attempt)

    await vi.advanceTimersByTimeAsync(7_000)
    await expect(result).resolves.toBe('saved')
  })

  it('waits for the rate limit window when the server did not say how long', async () => {
    const attempt = vi.fn().mockRejectedValueOnce(limited()).mockResolvedValueOnce('saved')
    const result = retryAfterRateLimit(attempt)

    await vi.advanceTimersByTimeAsync(RATE_LIMIT_WINDOW_MS - 1)
    expect(attempt).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1)
    await expect(result).resolves.toBe('saved')
  })

  it('gives up after one retry, with the failure the retry ended with', async () => {
    const attempt = vi.fn().mockRejectedValueOnce(limited(1_000)).mockRejectedValueOnce(limited(2))
    const result = retryAfterRateLimit(attempt)
    const rejection = expect(result).rejects.toMatchObject({ retryAfterMs: 2 })

    await vi.advanceTimersByTimeAsync(10_000)
    await rejection
    expect(attempt).toHaveBeenCalledTimes(2)
  })

  it('does not wait out a Retry-After longer than two rate limit windows', async () => {
    const attempt = vi.fn().mockRejectedValue(limited(2 * RATE_LIMIT_WINDOW_MS + 1))
    await expect(retryAfterRateLimit(attempt)).rejects.toMatchObject({ status: 429 })
    expect(attempt).toHaveBeenCalledOnce()
  })

  it.each([
    ['a daily limit', new ApiRequestError(429, 'daily_limit', 'Tomorrow', 3_600_000)],
    ['a full library', new ApiRequestError(403, 'activity_quota', 'Full')],
    ['a server error', new ApiRequestError(500, 'internal_error', 'Oops')],
    ['a lost connection', new ApiRequestError(0, 'network_error', 'Offline')],
    ['an upload that is too large', new SyncFailure('file-too-large', 'Too big')],
  ])('does not retry %s', async (_label, error) => {
    const attempt = vi.fn().mockRejectedValue(error)
    await expect(retryAfterRateLimit(attempt)).rejects.toBe(error)
    expect(attempt).toHaveBeenCalledOnce()
  })
})
