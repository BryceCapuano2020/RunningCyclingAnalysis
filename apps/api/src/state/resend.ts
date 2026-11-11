import type { Bindings } from '../env.ts'
import { SERVER_STATE_MAX_ACTIVITIES } from './flag.ts'
import { STATE_DELAY_SECONDS } from './message.ts'
import { claimPending } from './pending.ts'
import { RESULT_REVISION } from './resultRevision.ts'

/** The most accounts one maintenance run sends for: the ones whose last compute began longest ago come first. Each costs a D1 claim and a queue send. */
export const MAX_RESEND_ACCOUNTS = 20

/** What a re-send has sent so far, so a run stopped by its operation budget still reports it. */
export interface ResendTally {
  sent: number
}

/**
 * The daily stand-in for the hourly refresh (S6 in the design, not built): sends one message for each account whose inputs
 * moved past its last compute, or whose stored snapshot was made under a lower result revision (a deploy that changed how
 * a figure is worked out, the snapshot's shape or the lift estimator), while no message is on its way, so a message the
 * Queue lost or sent to the dead-letter queue leaves an account dirty for a day at most, not until its next write. A
 * higher stored revision is a later Worker's and is left alone, as is a library the server does not compute for and an
account being deleted. At most `max` accounts, the least that the caller's operation budget allows
 * (`tally.sent` counts them as they go). Returns how many messages it sent.
 */
export async function resendDirty(
  env: Bindings,
  now: number,
  max = MAX_RESEND_ACCOUNTS,
  tally: ResendTally = { sent: 0 },
): Promise<number> {
  const queue = env.STATE_QUEUE
  const limit = Math.min(max, MAX_RESEND_ACCOUNTS)
  if (queue === undefined || limit <= 0) return 0
  const dirty = await env.DB.prepare(
    `SELECT u.id FROM users u LEFT JOIN state_jobs j ON j.user_id = u.id
     WHERE u.deleting_at IS NULL AND u.activity_count <= ?1 AND coalesce(j.analysis_revision, 0) <= ?2
       AND (coalesce(j.snapshot_version, 0) < u.library_version OR coalesce(j.snapshot_lift_revision, 0) < u.lift_revision OR coalesce(j.analysis_revision, 0) < ?2)
       AND coalesce(j.pending_until, 0) <= ?3
     ORDER BY coalesce(j.attempted_at, 0), u.id LIMIT ?4`,
  )
    .bind(SERVER_STATE_MAX_ACTIVITIES, RESULT_REVISION, now, limit)
    .all<{ id: string }>()
  for (const { id } of dirty.results) {
    if (!(await claimPending(env.DB, id, now, STATE_DELAY_SECONDS))) continue
    await queue.send({ userId: id }, { delaySeconds: STATE_DELAY_SECONDS })
    tally.sent += 1
  }
  return tally.sent
}
