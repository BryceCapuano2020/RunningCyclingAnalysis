import { ApiRequestError } from '../api/client'
import { syncIssueFor } from './syncIssue'

/** The edge rate limiter's window, and the Retry-After its 429 carries. */
export const RATE_LIMIT_WINDOW_MS = 60_000

/** The longest an import waits for a rate limit. A longer Retry-After stops the import instead. */
const MAX_WAIT_MS = 2 * RATE_LIMIT_WINDOW_MS

/**
 * Runs one save. When the server answers 429, it waits for the Retry-After that came with it and
 * tries the same save once more: a create is idempotent, so the second try cannot duplicate it. A
 * second refusal, or any other failure, is thrown as it is.
 */
export async function retryAfterRateLimit<T>(attempt: () => Promise<T>): Promise<T> {
  try {
    return await attempt()
  } catch (error) {
    if (syncIssueFor(error) !== 'rate-limited') throw error
    const waitMs =
      (error instanceof ApiRequestError ? error.retryAfterMs : undefined) ?? RATE_LIMIT_WINDOW_MS
    if (waitMs > MAX_WAIT_MS) throw error
    await new Promise((resolve) => setTimeout(resolve, waitMs))
    return attempt()
  }
}
