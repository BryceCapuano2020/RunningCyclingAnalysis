import type { ActivityRecord } from '@rca/contract'
import { digestActivity } from '@rca/core/digest'
import { revisionStatus } from '@rca/core/digest/revisions'
import { haltsImport } from '@rca/core/session'
import type { AnalysisSession, PeriodChoice, SessionState } from '@rca/core/session'
import type { AthleteSettings } from '@rca/core/types'
import type { Activity } from '@rca/core/types'
import { createActivity, listActivities } from '../api/client'
import { workoutKeyOf, type DeviceActions } from './device'
import { shownCount } from './hiddenCopies'
import { originalActivity } from './originalActivity'
import type { WorkerResponse } from './protocol'
import { RATE_LIMIT_WINDOW_MS } from './rateLimitRetry'
import { syncIssueFor } from './syncIssue'
import { noteWork } from './workerWire'

/** The first instant of the next UTC day, when the per-user daily limit resets. */
function nextUtcMidnightMs(nowMs: number): number {
  const now = new Date(nowMs)
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
}

/**
 * What loading or rebuilding the account's library changes: the session, the library kept in this
 * browser, the saved records and the originals still missing, and what the page is told.
 */
export interface LibraryContext {
  session: AnalysisSession
  device: Pick<DeviceActions, 'replaced'>
  savedRecords: Map<string, ActivityRecord>
  missingOriginals: Set<string>
  /** Ids of saved records whose stored original a rebuild could not match, so it cannot update them. */
  unmatchedOriginals: Set<string>
  post: (message: WorkerResponse) => void
  reportLibrary: () => void
  reportUnreadable: (count: number) => void
  /** Captures evidence only after its digest rebuild succeeded. */
  captureTrace?: (activity: Activity, userId: string) => void | Promise<void>
}

/** Fetches the account's digests here, so a large library never crosses the main thread. */
export async function loadServer(
  ctx: LibraryContext,
  settings: AthleteSettings,
  userId: string,
  choice?: PeriodChoice,
): Promise<SessionState> {
  let unreadable = 0
  const records = await listActivities(
    undefined,
    userId,
    (count) => {
      unreadable += count
    },
    undefined,
    noteWork,
  )
  ctx.savedRecords.clear()
  for (const record of records) ctx.savedRecords.set(record.id, record)
  ctx.reportLibrary()
  ctx.reportUnreadable(unreadable)
  ctx.missingOriginals.clear()
  ctx.unmatchedOriginals.clear()
  for (const record of records) {
    if (!record.hasFile) ctx.missingOriginals.add(workoutKeyOf(record.digest))
  }
  ctx.post({
    type: 'missingOriginals',
    count: shownCount(ctx.missingOriginals, ctx.savedRecords.values()),
  })
  ctx.device.replaced()
  // The first analysis is of the period the page shows, so the page need not ask for it afterwards.
  ctx.session.choosePeriod(choice)
  return ctx.session.loadDigests(
    records.map((record) => record.digest),
    settings,
    { keepUnsaved: true },
  )
}

/** Rebuild stale digests only from their exact stored original file, retaining partial successes. */
export async function rebuildStale(ctx: LibraryContext, settings: AthleteSettings, userId: string) {
  let unreadable = 0
  const records = await listActivities(
    undefined,
    userId,
    (count) => {
      unreadable += count
    },
    undefined,
    noteWork,
  )
  const stale = records.filter((record) => revisionStatus(record.digest.modelRevision) === 'stale')
  let rebuilt = 0
  let missing = 0
  let failed = 0
  let limited = 0
  let limitKind: 'daily' | 'rate' | null = null
  let limitReached = false
  // Records whose stored original did not match them. They keep `hasFile`, but need the file again.
  const unmatched: ActivityRecord[] = []
  for (const record of stale) {
    noteWork()
    if (!record.hasFile) {
      missing++
      continue
    }
    // Once a download limit is reached, further downloads would be refused the same way.
    if (limitReached) {
      limited++
      continue
    }
    try {
      const { fileHash, activity } = await originalActivity(record, userId)
      if (!activity) {
        missing++
        unmatched.push(record)
        continue
      }
      // Replaces this exact activity, so a copy deleted in another tab is not written back.
      const { record: upgraded } = await createActivity(
        digestActivity(activity),
        record.fileName,
        fileHash,
        userId,
        record.id,
      )
      const recordIndex = records.findIndex((candidate) => candidate.id === record.id)
      if (recordIndex >= 0) records[recordIndex] = upgraded
      await ctx.captureTrace?.(activity, userId)
      rebuilt++
    } catch (error) {
      const issue = syncIssueFor(error)
      // A sign-out or account change would fail every remaining activity the same way.
      if (haltsImport(issue)) throw error
      if (error instanceof Error && 'status' in error && error.status === 404) {
        missing++
        unmatched.push(record)
      } else if (issue === 'activity-conflict') {
        // The stored original no longer matches a different saved copy, so it cannot be matched.
        missing++
        unmatched.push(record)
      } else if (issue === 'daily-limit' || issue === 'rate-limited') {
        limitReached = true
        limited++
        // A daily limit outranks a rate limit if both are seen.
        if (issue === 'daily-limit') limitKind = 'daily'
        else if (limitKind === null) limitKind = 'rate'
      } else failed++
    }
  }
  let refreshed
  try {
    // The refreshed listing is the library now shown, so its unreadable count replaces the first.
    let refreshedUnreadable = 0
    refreshed = await listActivities(
      undefined,
      userId,
      (count) => {
        refreshedUnreadable += count
      },
      undefined,
      noteWork,
    )
    unreadable = refreshedUnreadable
  } catch {
    // Rebuild successes remain usable even if the final refresh is interrupted.
    failed++
    refreshed = records
  }
  ctx.device.replaced()
  const state = ctx.session.loadDigests(
    refreshed.map((record) => record.digest),
    settings,
    { keepUnsaved: true },
  )
  ctx.savedRecords.clear()
  for (const record of refreshed) ctx.savedRecords.set(record.id, record)
  // Rebuilding them again would find the same mismatch, so Update now leaves them out; adding
  // their files again still updates them. One deleted in another tab is no longer listed.
  for (const record of unmatched) {
    if (ctx.savedRecords.has(record.id)) ctx.unmatchedOriginals.add(record.id)
  }
  ctx.reportLibrary()
  ctx.reportUnreadable(unreadable)
  // The 429 sends Retry-After: 60, the limiter's window, so a rate limit clears in that long.
  const limitResetsAtMs =
    limitKind === 'daily'
      ? nextUtcMidnightMs(Date.now())
      : limitKind === 'rate'
        ? Date.now() + RATE_LIMIT_WINDOW_MS
        : null
  return { state, rebuilt, missing, failed, limited, limitKind, limitResetsAtMs }
}
