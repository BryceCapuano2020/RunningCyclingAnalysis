/** What a write sends the state job: whose results to compute. Nothing else travels in the Queue. */
export interface StateMessage {
  userId: string
}

/** A write's message waits this long, so a short burst of writes (a few saves) is one compute. */
export const STATE_DELAY_SECONDS = 10
/** A failed compute is tried again after this long, up to the Queue's `max_retries`. */
export const STATE_RETRY_SECONDS = 30
/**
 * A job that finds the account's last compute began less than this long ago does not compute: it sends one message
 * delayed this long instead. So an account computes at most once per this long, and about once a minute through a long
 * import (a deferred message waits this long again): a 2,000-file import is tens of computes, not one per file.
 */
export const STATE_MIN_INTERVAL_SECONDS = 30
/** A message that finds the isolate computing for a read is tried again after this long, and never acknowledged. */
export const STATE_LOCK_RETRY_SECONDS = 5
/**
 * A read that computes in the request claims the account in D1 first (`claimCompute`): while a compute began less than
 * this long ago, in any isolate, every other read serves what is stored. Longer than a compute runs (10 s of CPU is the
 * Worker's bound), far shorter than the queue's own interval, whose `attempted_at` it shares.
 */
export const STATE_CLAIM_SECONDS = 10
