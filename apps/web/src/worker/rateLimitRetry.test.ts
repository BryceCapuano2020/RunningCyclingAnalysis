import { SyncFailure } from '@rca/core/session'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError } from '../api/client'
import { RATE_LIMIT_WINDOW_MS, retryAfterUploadSlot, SaveStop } from './rateLimitRetry'

const limited = (retryAfterMs?: number) =>
  new ApiRequestError(429, 'rate_limited', 'Slow down', retryAfterMs)

/** One save, with nothing else sharing its stop. */
const retryAfterRateLimit = <T>(attempt: () => Promise<T>, onWait?: () => void) =>
  new SaveStop(() => undefined).run(attempt, onWait)

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('a save that meets a rate limit', () => {
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

describe('saves that share a stop', () => {
  it('has one save wait out a rate limit and try again, while the others wait for how that try ends', async () => {
    const stop = new SaveStop(() => undefined)
    const onWait = vi.fn()
    const sends: boolean[] = []
    const attempt = async (leading: boolean) => {
      sends.push(leading)
      if (sends.length <= 3) throw limited(1_000)
      return 'saved'
    }
    const results = [1, 2, 3].map(() => stop.run(attempt, onWait))

    await vi.advanceTimersByTimeAsync(1_000)
    await expect(Promise.all(results)).resolves.toEqual(['saved', 'saved', 'saved'])
    // Three first tries, the leader's, then the two that waited for it. One wait was announced.
    expect(sends).toEqual([false, false, false, true, false, false])
    expect(onWait).toHaveBeenCalledOnce()
  })

  it('fails the saves that waited, and the ones that come after, with the cause that stopped them, sending nothing', async () => {
    const onStopped = vi.fn()
    const stop = new SaveStop(onStopped)
    const attempt = vi.fn(async (_leading: boolean): Promise<string> => {
      throw limited(1_000)
    })
    const results = [1, 2, 3].map(() => stop.run(attempt).catch((error: unknown) => error))

    await vi.advanceTimersByTimeAsync(1_000)
    const failures = await Promise.all(results)
    // Three first tries and the leader's second; the two followers did not try again.
    expect(attempt).toHaveBeenCalledTimes(4)
    expect(failures[0]).toMatchObject({ status: 429 })
    expect(failures[1]).toMatchObject({ code: 'rate-limited' })
    expect(failures[2]).toMatchObject({ code: 'rate-limited' })
    expect(onStopped).toHaveBeenCalledOnce()
    expect(onStopped).toHaveBeenCalledWith('rate-limited')

    await expect(stop.run(attempt)).rejects.toMatchObject({ code: 'rate-limited' })
    await expect(stop.ready()).rejects.toMatchObject({ code: 'rate-limited' })
    expect(attempt).toHaveBeenCalledTimes(4)
  })

  it("does not send the leader's second try when another save stopped the saves during its wait", async () => {
    const stop = new SaveStop(() => undefined)
    const attempt = vi.fn(async (_leading: boolean): Promise<string> => {
      throw limited(1_000)
    })
    const result = stop.run(attempt).catch((error: unknown) => error)

    await vi.advanceTimersByTimeAsync(500)
    stop.noteFailure('activity-quota')
    await vi.advanceTimersByTimeAsync(500)

    await expect(result).resolves.toMatchObject({ code: 'activity-quota' })
    expect(attempt).toHaveBeenCalledOnce()
  })

  it('fails a waiting save at once when the saves have already stopped, without waiting behind a limit', async () => {
    const stop = new SaveStop(() => undefined)
    const leader = stop
      .run(async () => {
        throw limited(60_000)
      })
      .catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(0)

    stop.noteFailure('signed-out')
    // The leader is still in its wait; a save asking now is told the cause without waiting for it.
    let outcome: unknown = 'pending'
    stop.ready().then(
      () => (outcome = 'ready'),
      (error: unknown) => (outcome = error),
    )
    await vi.advanceTimersByTimeAsync(0)
    expect(outcome).toMatchObject({ code: 'signed-out' })

    await vi.advanceTimersByTimeAsync(60_000)
    await leader
  })

  it('reports only the first failure that stops saving, and ignores one that does not', () => {
    const onStopped = vi.fn()
    const stop = new SaveStop(onStopped)

    stop.noteFailure('server')
    stop.noteFailure('activity-conflict')
    expect(onStopped).not.toHaveBeenCalled()
    stop.noteFailure('activity-quota')
    stop.noteFailure('rate-limited')

    expect(onStopped).toHaveBeenCalledOnce()
    expect(onStopped).toHaveBeenCalledWith('activity-quota')
    expect(() => stop.check()).toThrow(expect.objectContaining({ code: 'activity-quota' }))
  })
})

describe("an upload that finds the account's upload slots full", () => {
  const full = (retryAfterMs?: number) =>
    new ApiRequestError(429, 'upload_in_progress', 'Finish your other uploads', retryAfterMs)

  it('waits for the server Retry-After and tries once more', async () => {
    const attempt = vi.fn().mockRejectedValueOnce(full(5_000)).mockResolvedValueOnce('saved')
    const result = retryAfterUploadSlot(attempt)

    await vi.advanceTimersByTimeAsync(4_999)
    expect(attempt).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1)
    await expect(result).resolves.toBe('saved')
  })

  it('waits five seconds when the server did not say, and gives up after one more try', async () => {
    const attempt = vi.fn().mockRejectedValue(full())
    const result = retryAfterUploadSlot(attempt)
    const rejection = expect(result).rejects.toMatchObject({ code: 'upload_in_progress' })

    await vi.advanceTimersByTimeAsync(4_999)
    expect(attempt).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1)
    await rejection
    expect(attempt).toHaveBeenCalledTimes(2)
  })

  it('does not retry another failure', async () => {
    const error = new ApiRequestError(500, 'internal_error', 'Oops')
    const attempt = vi.fn().mockRejectedValue(error)
    await expect(retryAfterUploadSlot(attempt)).rejects.toBe(error)
    expect(attempt).toHaveBeenCalledOnce()
  })
})
