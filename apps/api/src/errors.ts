import type { ApiError } from '@rca/contract'

export type ErrorStatus = 400 | 401 | 403 | 404 | 408 | 409 | 413 | 422 | 429 | 500 | 502 | 503

/** An error the client should see: rendered as ApiError with this status and code. */
export class HttpError extends Error {
  readonly status: ErrorStatus
  readonly code: string

  constructor(status: ErrorStatus, code: string, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
  }
}

export function apiError(code: string, message: string): ApiError {
  return { error: { code, message } }
}
