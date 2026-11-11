import { ANALYSIS_REVISION } from '@rca/core/stateSnapshot'
import type { Bindings } from '../env.ts'
import { SERVER_STATE_MAX_ACTIVITIES, serverStateAccounts } from './flag.ts'
import { STATE_DELAY_SECONDS } from './message.ts'
import { claimPending } from './pending.ts'

/** The most accounts one maintenance run looks at, within D1's bound-parameter limit. */
export const MAX_RESEND_ACCOUNTS = 50

/**
 * The daily stand-in for the hourly refresh (S6 in the design, not built): sends one message for each account on the
 * allowlist whose inputs moved past its last compute, or whose last compute was made under another analysis revision (a
 * deploy that changed how a figure is worked out), while no message is on its way, so a message the Queue lost or
 * sent to the dead-letter queue leaves an account dirty for a day at most, not until its next write. Only the ids the list
 * names: `*` (everyone, local and e2e only) re-sends nothing. A library the server does not compute for, or an account
 * being deleted, is left alone. Returns how many messages it sent.
 */
export async function resendDirty(env: Bindings, now: number): Promise<number> {
  const queue = env.STATE_QUEUE
  if (queue === undefined) return 0
  const ids = [...serverStateAccounts(env)].filter((id) => id !== '*').slice(0, MAX_RESEND_ACCOUNTS)
  if (ids.length === 0) return 0
  const dirty = await env.DB.prepare(
    `SELECT u.id FROM users u LEFT JOIN state_jobs j ON j.user_id = u.id
     WHERE u.id IN (${ids.map(() => '?').join(', ')}) AND u.deleting_at IS NULL AND u.activity_count <= ?
       AND (coalesce(j.snapshot_version, 0) < u.library_version OR coalesce(j.snapshot_lift_revision, 0) < u.lift_revision OR coalesce(j.analysis_revision, 0) <> ?)
       AND coalesce(j.pending_until, 0) <= ?`,
  )
    .bind(...ids, SERVER_STATE_MAX_ACTIVITIES, ANALYSIS_REVISION, now)
    .all<{ id: string }>()
  let sent = 0
  for (const { id } of dirty.results) {
    if (!(await claimPending(env.DB, id, now, STATE_DELAY_SECONDS))) continue
    await queue.send({ userId: id }, { delaySeconds: STATE_DELAY_SECONDS })
    sent += 1
  }
  return sent
}
