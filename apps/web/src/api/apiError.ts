/** A failed request. Status 0 means the server could not be reached at all. */
export class ApiRequestError extends Error {
  readonly status: number
  readonly code: string
  /** How long the server asked to wait before trying again (its Retry-After), in milliseconds. */
  readonly retryAfterMs: number | undefined

  constructor(status: number, code: string, message: string, retryAfterMs?: number) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.code = code
    this.retryAfterMs = retryAfterMs
  }
}
