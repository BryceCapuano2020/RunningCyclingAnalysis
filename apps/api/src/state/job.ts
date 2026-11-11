import type { Bindings } from '../env.ts'
import type { Deps } from '../deps.ts'
import { SERVER_STATE_MAX_ACTIVITIES } from './flag.ts'
import { withComputeLock } from './lock.ts'
import { STATE_MIN_INTERVAL_SECONDS } from './message.ts'
import { clearPending } from './pending.ts'
import { computeAndStore } from './refresh.ts'
import { isCurrent, jobRow, revisionOrder, type JobRow } from './row.ts'

/** What one run of an account's job did. */
export type JobOutcome =
  | 'gone' // no account, or one being deleted
  | 'current' // the stored snapshot already covers the inputs, under this build, for today
  | 'newer' // the stored snapshot is a later Worker's: this one computes nothing and leaves it
  | 'too_large' // more activities than the server computes for; the browser does
  | 'deferred' // computed moments ago; the caller sends one delayed message instead
  | 'busy' // this isolate is computing for a read; the caller retries the message after a delay, never acks it
  | 'moved' // a write landed while reading; its own job follows
  | 'unchanged' // computed, the same figures: the order columns move and nothing is written
  | 'written' // a new snapshot object, and the old one deleted

/** Whether the account has inputs no compute covered, and a library the server computes for. */
const dirty = (row: JobRow, now: number, maxActivities: number) =>
  !isCurrent(row, now) && row.activity_count <= maxActivities

/** When the account's last compute began, a failed one included. */
const lastStart = (row: JobRow) =>
  Math.max(row.computed_at ?? -Infinity, row.attempted_at ?? -Infinity)

/**
 * Computes one account's snapshot if its inputs have moved since the last compute (or its day has), and stores it only
 * if the figures changed. The same `AnalysisSession.loadDigests` path the browser runs, on the digests D1 holds. Throws
 * on a failure the Queue should retry (R2 budget, a D1 error). The caller has a message for the account in hand: the job
 * clears the account's pending marker (pending.ts) unless it defers.
 */
export async function runStateJob(
  env: Bindings,
  deps: Deps,
  userId: string,
  /** The library size the job computes for: the limit, unless a measurement raises it. */
  { maxActivities = SERVER_STATE_MAX_ACTIVITIES }: { maxActivities?: number } = {},
): Promise<JobOutcome> {
  if (env.FILES === undefined) throw new Error('state job: no file storage bound')
  // Coalescing first, before the marker is touched: the last compute began too recently for another (a burst of writes,
  // an import, a retry waiting out a failure), so the caller sends one delayed message if no other is on its way. A failed
  // compute counts as recent too, so a burst of messages after a failure waits rather than computing once per message.
  const first = await jobRow(env.DB, userId)
  if (first === null) return 'gone'
  if (
    dirty(first, deps.now(), maxActivities) &&
    deps.now() - lastStart(first) < STATE_MIN_INTERVAL_SECONDS * 1000
  ) {
    return 'deferred'
  }
  // The message has arrived: a write from here sends its own, and one the marker held back is in the row read next.
  await clearPending(env.DB, userId)
  const before = await jobRow(env.DB, userId)
  if (before === null) return 'gone'
  if (isCurrent(before, deps.now())) return 'current'
  if (before.activity_count > maxActivities) return 'too_large'
  // A later Worker's snapshot stays for it; a read of ours computes in the request and keeps nothing.
  if (revisionOrder(before) === 'newer') return 'newer'
  const run = await withComputeLock(() => computeAndStore(env, deps, userId, before, true))
  if (!run.ran) return 'busy'
  // `store` is set, so the compute never answers 'unstored'.
  return run.value.kind === 'unstored' ? 'written' : run.value.kind
}
