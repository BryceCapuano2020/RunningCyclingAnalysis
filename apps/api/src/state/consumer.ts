import { MAX_ACTIVITIES_PER_USER } from '@rca/contract'
import type { Bindings } from '../env.ts'
import type { Deps } from '../deps.ts'
import { isReadOnly } from '../readOnly.ts'
import { runStateJob, type JobOutcome } from './job.ts'
import {
  STATE_LOCK_RETRY_SECONDS,
  STATE_MIN_INTERVAL_SECONDS,
  STATE_RETRY_SECONDS,
  type StateMessage,
} from './message.ts'
import { markPending } from './pending.ts'

/** What a batch did, for the log line: counts only, never an id or a figure. */
export interface BatchReport {
  accounts: number
  outcomes: Partial<Record<JobOutcome | 'failed', number>>
}

/**
 * The Queue consumer. A batch is grouped by account, and the accounts run one after another, not together: a library's
 * digests are the memory the job needs, and the isolate has 128 MB. Each account's messages are answered together:
 * acknowledged when its job ran or had nothing to do, or was deferred (one later message is sent in its place). When the job failed, one message is retried and the rest acknowledged, so a failing account is tried once
 * per retry however many messages named it, up to the Queue's own retry limit. An account whose messages are lost or
 * exhausted stays dirty until its next write or the daily re-send (resend.ts), whichever comes first. In the operator's read-only mode every message waits.
 */
export async function handleStateBatch(
  batch: MessageBatch<StateMessage>,
  env: Bindings,
  deps: Deps,
): Promise<BatchReport> {
  const report: BatchReport = { accounts: 0, outcomes: {} }
  const count = (outcome: JobOutcome | 'failed') => {
    report.outcomes[outcome] = (report.outcomes[outcome] ?? 0) + 1
  }
  if (isReadOnly(env)) {
    batch.retryAll({ delaySeconds: STATE_RETRY_SECONDS })
    return report
  }
  const byAccount = new Map<string, Message<StateMessage>[]>()
  for (const message of batch.messages) {
    const list = byAccount.get(message.body.userId) ?? []
    list.push(message)
    byAccount.set(message.body.userId, list)
  }
  for (const [userId, messages] of byAccount) {
    report.accounts += 1
    try {
      const outcome = await runStateJob(env, deps, userId)
      count(outcome)
      if (outcome === 'deferred' || outcome === 'busy') {
        // One message for the whole account, however many are in this batch, sent whatever the marker says: the live
        // marker may be this message's own (its write set it), and this message is spent, so a claim that waited on it
        // would leave the account dirty with nothing on its way. Busy (another compute, in this isolate or another, holds
        // the account) is the same: a retry would count toward the Queue's limit and could end in the dead-letter queue, a
        // fresh message does not. The write is computed once the delay has passed.
        const delay = outcome === 'busy' ? STATE_LOCK_RETRY_SECONDS : STATE_MIN_INTERVAL_SECONDS
        if (env.STATE_QUEUE === undefined) throw new Error('state job: no queue bound')
        await markPending(env.DB, userId, deps.now(), delay)
        await env.STATE_QUEUE.send({ userId }, { delaySeconds: delay })
      }
      // A write that landed mid-read sent its own message; this one is spent either way.
      for (const message of messages) message.ack()
    } catch (error) {
      count('failed')
      console.error(
        JSON.stringify({
          event: 'state_job_failed',
          errorClass: error instanceof Error ? error.constructor.name : typeof error,
          // A size bucket, no figure: tells an account too large for the isolate (it fails every try, daily) from a transient error.
          activities: await activityBucket(env.DB, userId),
        }),
      )
      // One message carries the retry and the rest are spent: the retry reads the account as it is then, every write
      // these named included. Writes in the meantime send nothing; if the marker cannot be set they send as before.
      const [carrier, ...spent] = messages
      carrier?.retry({ delaySeconds: STATE_RETRY_SECONDS })
      for (const message of spent) message.ack()
      await markPending(env.DB, userId, deps.now(), STATE_RETRY_SECONDS).catch(() => undefined)
    }
  }
  return report
}

/** The size class of an account's library, for the failure log: the account limit is 4,000. */
async function activityBucket(db: D1Database, userId: string): Promise<string> {
  try {
    const row = await db
      .prepare('SELECT activity_count AS n FROM users WHERE id = ?')
      .bind(userId)
      .first<{ n: number }>()
    if (row === null) return 'unknown'
    if (row.n > MAX_ACTIVITIES_PER_USER) return 'over_quota'
    return row.n >= 3000 ? '3000_to_quota' : row.n >= 1000 ? '1000_to_2999' : 'under_1000'
  } catch {
    return 'unknown'
  }
}
