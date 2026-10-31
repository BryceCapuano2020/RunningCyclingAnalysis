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

/**
 * The refusal for an account being deleted, from a sign-in, upload or create. One message, so every
 * route that refuses a deleting account answers the same way.
 */
export function accountDeleting(): HttpError {
  return new HttpError(409, 'account_deleting', 'This account is being deleted. Try again later.')
}

/** A verified Google account that may not create an account here: it is not on the sign-up list. */
export function notOnList(): HttpError {
  return new HttpError(
    403,
    'not_on_list',
    'This Google account is not on the list of people who can create an account yet.',
  )
}

/** One Google identity has created as many accounts today as the cap allows. */
export function signupLimit(retryAfter: number): HttpError {
  return new HttpError(
    429,
    'signup_limit',
    'This Google account has created several accounts today. Try again after midnight UTC.',
    { retryAfter },
  )
}
