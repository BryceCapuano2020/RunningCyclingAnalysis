/** What a write sends the state job: whose results to compute. Nothing else travels in the Queue. */
export interface StateMessage {
  userId: string
}

/** A write's message waits this long, so a burst of writes (an import) is one compute, not hundreds. */
export const STATE_DELAY_SECONDS = 10
/** A failed compute is tried again after this long, up to the Queue's `max_retries`. */
export const STATE_RETRY_SECONDS = 30
