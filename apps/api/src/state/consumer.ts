import type { Bindings } from '../env.ts'
import type { Deps } from '../deps.ts'
import { isReadOnly } from '../readOnly.ts'
import { serverStateFor } from './flag.ts'
import { runStateJob, type JobOutcome } from './job.ts'
import { STATE_RETRY_SECONDS, type StateMessage } from './message.ts'

/** What a batch did, for the log line: counts only, never an id or a figure. */
export interface BatchReport {
  accounts: number
  outcomes: Partial<Record<JobOutcome | 'failed' | 'not_listed', number>>
}

/**
 * The Queue consumer. A batch is grouped by account (a burst of writes is one message per write), and the accounts run one
 * after another, not together: a library's digests are the memory the job needs, and the isolate has 128 MB. Each
 * account's messages are answered together: acknowledged when its job ran or had nothing to do, retried when it failed,
 * and left to the Queue's own retry limit (after which the hourly pass picks the account up). A message for an account off the allowlist
 * is dropped, and in the operator's read-only mode every message waits.
 */
export async function handleStateBatch(
  batch: MessageBatch<StateMessage>,
  env: Bindings,
  deps: Deps,
): Promise<BatchReport> {
  const report: BatchReport = { accounts: 0, outcomes: {} }
  const count = (outcome: JobOutcome | 'failed' | 'not_listed') => {
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
    // A message for an account off the list (the list changed after it was sent) is dropped without a read.
    if (!serverStateFor(env, userId)) {
      count('not_listed')
      for (const message of messages) message.ack()
      continue
    }
    try {
      const outcome = await runStateJob(env, deps, userId)
      count(outcome)
      // A write that landed mid-read sent its own message; this one is spent either way.
      for (const message of messages) message.ack()
    } catch (error) {
      count('failed')
      console.error(
        JSON.stringify({
          event: 'state_job_failed',
          errorClass: error instanceof Error ? error.constructor.name : typeof error,
        }),
      )
      for (const message of messages) message.retry({ delaySeconds: STATE_RETRY_SECONDS })
    }
  }
  return report
}
