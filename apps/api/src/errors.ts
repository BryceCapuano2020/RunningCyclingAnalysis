import type { ApiError } from '@rca/contract'

export type ErrorStatus =
  400 | 401 | 403 | 404 | 405 | 408 | 409 | 413 | 422 | 429 | 500 | 502 | 503

/** An error the client should see: rendered as ApiError with this status and code. */
export class HttpError extends Error {
  readonly status: ErrorStatus
  readonly code: string
  /** Seconds before a retry can succeed; sent as the Retry-After header when set. */
  readonly retryAfter: number | undefined

  constructor(
    status: ErrorStatus,
    code: string,
    message: string,
    options: { retryAfter?: number } = {},
  ) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
    this.retryAfter = options.retryAfter
  }
}

export function apiError(code: string, message: string): ApiError {
  return { error: { code, message } }
}
