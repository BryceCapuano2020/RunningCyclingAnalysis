/** How a request differs from the defaults: a shorter deadline, or no second try. */
export interface RequestOptions {
  /** Replaces the request's deadline. */
  timeoutMs?: number
  /** False turns off the second try a read makes at once; the caller retries on its own schedule. */
  retry?: boolean
  /**
   * Makes the immediate second try only for a failure that came sooner than this (a refused connection
   * or an error page). A request that ran out its deadline is not tried again, so a hung server costs
   * one deadline and not two.
   */
  retryWithinMs?: number
}
