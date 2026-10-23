import { SyncFailure } from '@rca/core/session'
import type { SyncIssueCode } from '@rca/core/session'
import { ApiRequestError } from '../api/client'

/** The cause shown to the user for a failed save or read. Unknown failures count as the server's. */
export function syncIssueFor(error: unknown): SyncIssueCode {
  if (error instanceof SyncFailure) return error.code
  if (!(error instanceof ApiRequestError)) return 'server'
  if (error.code === 'storage_budget_exhausted') return 'storage-budget'
  if (error.status === 0) return 'network'
  if (error.status === 401) return 'signed-out'
  if (error.status === 409 && error.code === 'account_changed') return 'account-changed'
  if (error.status === 403 && error.code === 'activity_quota') return 'activity-quota'
  if (error.status === 403 && error.code === 'storage_quota') return 'storage-quota'
  if (error.status === 429) return 'rate-limited'
  return 'server'
}
