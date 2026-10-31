import type { ActivityRecord } from '@rca/contract'
import { digestActivity } from '@rca/core/digest'
import { revisionStatus } from '@rca/core/digest/revisions'
import type { AnalysisSession, PeriodChoice, SessionState } from '@rca/core/session'
import type { AthleteSettings } from '@rca/core/types'
import type { Activity } from '@rca/core/types'
import { createActivity, listActivities } from '../api/client'
import { workoutKeyOf, type DeviceActions } from './device'
import { originalActivity } from './originalActivity'
import type { WorkerResponse } from './protocol'
import { RATE_LIMIT_WINDOW_MS, waitNoting } from './rateLimitRetry'
import { runUpdate, updateCandidates } from './updater'
import type { UpdateResult, UpdateSteps } from './updater'
import { asWriter } from './updaterLock'
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
  /**
   * Takes the stamp of the library as it stands (which library, and its epoch), and answers whether it
   * still does. A long job asks after every await and discards its result when it no longer holds.
   */
  stamp: () => () => boolean
  /** Requests that change the library and are waiting behind the one being handled. */
  waitingToChange: () => number
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
  ctx.post({ type: 'missingOriginals', count: ctx.missingOriginals.size })
  ctx.device.replaced()
  // The first analysis is of the period the page shows, so the page need not ask for it afterwards.
  ctx.session.choosePeriod(choice)
  return ctx.session.loadDigests(
    records.map((record) => record.digest),
    settings,
    { keepUnsaved: true },
  )
}

/** What an update has to report when another tab holds the writer lock: nothing was tried. */
const NOT_THE_WRITER: UpdateResult = {
  rebuilt: 0,
  unmatched: [],
  failed: 0,
  limited: 0,
  limitKind: null,
  stopped: 'elsewhere',
}

/**
 * Rebuild stale digests only from their exact stored original file, retaining partial successes. The
 * engine (updater.ts) does the stepping; this supplies what it does in the world, and the listing that
 * follows. Only the tab that holds the account's writer lock updates.
 */
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
  // Stale activities no update can try: no original is kept, or an earlier rebuild found it unmatched.
  const needFiles = records.filter(
    (record) =>
      revisionStatus(record.digest.modelRevision) === 'stale' &&
      (!record.hasFile || ctx.unmatchedOriginals.has(record.id)),
  ).length
  const positions = new Map(records.map((record, index) => [record.id, index]))
  const steps: UpdateSteps = {
    original: (record) => originalActivity(record, userId),
    digest: digestActivity,
    // Replaces this exact activity, so a copy deleted in another tab is not written back.
    replace: async (digest, record, fileHash) =>
      (await createActivity(digest, record.fileName, fileHash, userId, record.id)).record,
    keep: async (saved, activity) => {
      const position = positions.get(saved.id)
      if (position !== undefined) records[position] = saved
      ctx.session.replaceDigest(workoutKeyOf(saved.digest), saved.digest)
      await ctx.captureTrace?.(activity, userId)
    },
    stampHolds: ctx.stamp(),
    waiting: ctx.waitingToChange,
    sleep: waitNoting,
    note: noteWork,
  }
  const candidates = updateCandidates(records, ctx.unmatchedOriginals)
  const ran = await asWriter(userId, () => runUpdate(candidates, steps))
  const update = ran.writer ? ran.value : NOT_THE_WRITER
  // The library this ran for was replaced meanwhile, so nothing it learned is put back over the new one.
  if (update.stopped === 'discarded') {
    return {
      state: ctx.session.setSettings(settings),
      rebuilt: update.rebuilt,
      missing: 0,
      failed: update.failed,
      limited: 0,
      limitKind: null,
      limitResetsAtMs: null,
      stopped: update.stopped,
    }
  }
  const { rebuilt, limited, limitKind, unmatched } = update
  let { failed } = update
  const missing = needFiles + unmatched.length
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
  return {
    state,
    rebuilt,
    missing,
    failed,
    limited,
    limitKind,
    limitResetsAtMs,
    ...(update.stopped === null ? {} : { stopped: update.stopped }),
  }
}
