/** What a write sends the state job: whose results to compute. Nothing else travels in the Queue. */
export interface StateMessage {
  userId: string
}

/** A write's message waits this long, so a burst of writes (an import) is one compute, not hundreds. */
export const STATE_DELAY_SECONDS = 10
/** A failed compute is tried again after this long, up to the Queue's `max_retries`. */
export const STATE_RETRY_SECONDS = 30
/**
 * A job that finds the account's last compute younger than this does not compute: it sends one delayed message
 * instead, so an import of thousands of files computes about once per this long, not once per file.
 */
export const STATE_MIN_INTERVAL_SECONDS = 30
