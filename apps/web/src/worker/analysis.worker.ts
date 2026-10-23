/// <reference lib="webworker" />
import { MAX_FILE_BYTES } from '@rca/contract'
import type { ActivityRecord } from '@rca/contract'
import { parseActivityFile } from '@rca/core/import'
import { digestActivity, MODEL_REVISION } from '@rca/core/digest'
import { AnalysisSession, haltsImport, SyncFailure } from '@rca/core/session'
import type { SyncIssueCode } from '@rca/core/session'
import type { SessionState, SyncItem } from '@rca/core/session'
import type { ActivityDigest, AthleteSettings } from '@rca/core/types'
import {
  ApiRequestError,
  createActivity,
  deleteActivity,
  downloadActivityFile,
  listActivities,
  uploadFile,
} from '../api/client'
import { exportActivitiesJson, exportFooterJson, exportHeaderJson } from '../export/accountExport'
import type { ImportOutcome, WorkerRequest, WorkerResponse } from './protocol'
import { syncIssueFor } from './syncIssue'

const session = new AnalysisSession()
const post = (message: WorkerResponse) => self.postMessage(message)
/** Keys of saved activities whose original file is not in the library. Recomputed on each load. */
const missingOriginals = new Set<string>()
const savedRecords = new Map<string, ActivityRecord>()

/** Newest first; records that start together are ordered by id so the list is stable. */
function reportLibrary() {
  const records = [...savedRecords.values()].sort(
    (a, b) => b.digest.startMs - a.digest.startMs || a.id.localeCompare(b.id),
  )
  post({
    type: 'libraryActivities',
    activities: records.map(({ id, digest }) => ({
      id,
      name: digest.name,
      startMs: digest.startMs,
      sport: digest.sport,
    })),
  })
}

/** The edge rate limiter's window. */
const RATE_LIMIT_WINDOW_MS = 60_000

/** The first instant of the next UTC day, when the per-user daily limit resets. */
function nextUtcMidnightMs(nowMs: number): number {
  const now = new Date(nowMs)
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
}

/** The same key the session uses: one workout per sport and start second. */
function activityKey(digest: Pick<ActivityDigest, 'sport' | 'startMs'>): string {
  return `${digest.sport}-${Math.round(digest.startMs / 1000)}`
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Runs one import: each new activity is saved, and its file uploaded when files are kept. */
async function addFiles(
  request: Extract<WorkerRequest, { type: 'addFiles' }>,
): Promise<{ state: SessionState; outcome: ImportOutcome }> {
  const { sync } = request
  let filesRead = 0
  // Activities saved to the library, counting the digest alone when files are not kept.
  let uploaded = 0
  let storageBudgetExhausted = false
  let haltedBy: SyncIssueCode | null = null
  let outcome: ImportOutcome = { activities: 0, rejected: 0, duplicates: [] }
  const report = () =>
    post({
      type: 'progress',
      filesRead,
      ...(sync ? { uploaded } : {}),
    })

  const save = async (item: SyncItem): Promise<void> => {
    try {
      const key = activityKey(item.digest)
      const { record } = await createActivity(
        item.digest,
        item.fileName,
        item.fileHash,
        sync?.userId,
      )
      savedRecords.set(record.id, record)
      if (record.hasFile) missingOriginals.delete(key)
      else missingOriginals.add(key)
      if (sync?.keepFiles && !record.hasFile) {
        // The limit is inclusive: a file of exactly MAX_FILE_BYTES is kept.
        if (item.bytes.byteLength > MAX_FILE_BYTES) {
          throw new SyncFailure(
            'file-too-large',
            'Original exceeds the upload limit; digest saved without its file',
          )
        }
        if (storageBudgetExhausted) {
          throw new SyncFailure('storage-budget', 'Original-file storage allowance is exhausted')
        }
        try {
          const stored = await uploadFile(record.id, item.bytes, sync.userId)
          savedRecords.set(record.id, stored)
        } catch (error) {
          if (error instanceof ApiRequestError && error.code === 'storage_budget_exhausted') {
            storageBudgetExhausted = true
          }
          throw error
        }
        missingOriginals.delete(key)
      }
      uploaded++
      report()
    } catch (error) {
      const failure =
        error instanceof SyncFailure
          ? error
          : new SyncFailure(syncIssueFor(error), messageOf(error))
      if (haltsImport(failure.code)) haltedBy ??= failure.code
      throw failure
    }
  }

  const state = await session.addFiles(
    request.files,
    request.settings,
    (count) => {
      filesRead = count
      report()
    },
    sync === null ? undefined : save,
    sync?.keepFiles === true,
    (completed) => {
      outcome = completed
    },
  )
  if (sync !== null) {
    post({ type: 'missingOriginals', count: missingOriginals.size })
    reportLibrary()
  }
  if (haltedBy !== null) post({ type: 'accountIssue', issue: haltedBy })
  return { state, outcome }
}

async function handle(request: WorkerRequest): Promise<SessionState> {
  switch (request.type) {
    case 'addFiles':
      return (await addFiles(request)).state
    case 'loadSample':
      return session.loadSample(request.settings)
    case 'loadServer':
      return loadServer(request.settings, request.userId)
    case 'rebuildStale':
      return (await rebuildStale(request.settings, request.userId)).state
    case 'setSettings':
      return session.setSettings(request.settings)
    case 'setRange':
      return session.setRange(request.rangeDays, request.settings)
    case 'clear':
      return session.clear()
    case 'exportData':
      // Answered by exportAccount with the export file, not with a session state.
      throw new Error('An export is not a session request')
    case 'deleteActivity': {
      const record = savedRecords.get(request.id)
      if (!record) throw new Error('Reload your library before deleting this activity.')
      try {
        await deleteActivity(request.id, request.userId)
      } catch (error) {
        // Another tab may already have deleted this exact record.
        if (!(error instanceof ApiRequestError && error.status === 404)) throw error
      }
      savedRecords.delete(record.id)
      missingOriginals.delete(activityKey(record.digest))
      reportLibrary()
      post({ type: 'missingOriginals', count: missingOriginals.size })
      return session.removeActivity(record.digest.sport, record.digest.startMs, request.settings)
    }
  }
}

/** Posts the unreadable count of a library load, when it is above zero. */
function reportUnreadable(count: number) {
  if (count > 0) post({ type: 'libraryUnreadable', count })
}

/** Fetches the account's digests here, so a large library never crosses the main thread. */
async function loadServer(settings: AthleteSettings, userId: string): Promise<SessionState> {
  let unreadable = 0
  const records = await listActivities(undefined, userId, (count) => {
    unreadable += count
  })
  savedRecords.clear()
  for (const record of records) savedRecords.set(record.id, record)
  reportLibrary()
  reportUnreadable(unreadable)
  missingOriginals.clear()
  for (const record of records) {
    if (!record.hasFile) missingOriginals.add(activityKey(record.digest))
  }
  post({ type: 'missingOriginals', count: missingOriginals.size })
  return session.loadDigests(
    records.map((record) => record.digest),
    settings,
  )
}

/**
 * Lists the account's library and writes its export as it goes. Each page is written to the file
 * as soon as it arrives, so the library is never held as one text. The file is a Blob, so only its
 * parts, not one large string, cross back to the page. The listing costs one read.
 */
async function exportAccount(
  request: Extract<WorkerRequest, { type: 'exportData' }>,
): Promise<Blob> {
  const parts: BlobPart[] = [
    exportHeaderJson({ now: new Date(), account: request.account, profile: request.profile }),
  ]
  let unreadable = 0
  let firstPage = true
  await listActivities(
    undefined,
    request.userId,
    (count) => {
      unreadable += count
    },
    (items) => {
      const text = exportActivitiesJson(items)
      if (text === '') return
      if (!firstPage) parts.push(',')
      firstPage = false
      parts.push(new Blob([text]))
    },
  )
  parts.push(exportFooterJson(unreadable))
  return new Blob(parts, { type: 'application/json' })
}

async function hashHex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Rebuild stale digests only from their exact stored original file, retaining partial successes. */
async function rebuildStale(settings: AthleteSettings, userId: string) {
  let unreadable = 0
  const records = await listActivities(undefined, userId, (count) => {
    unreadable += count
  })
  const stale = records.filter((record) => record.digest.modelRevision < MODEL_REVISION)
  let rebuilt = 0
  let missing = 0
  let failed = 0
  let limited = 0
  let limitKind: 'daily' | 'rate' | null = null
  let limitReached = false
  for (const record of stale) {
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
      const bytes = await downloadActivityFile(record.id, userId)
      const parsed = parseActivityFile(bytes, record.fileName)
      if (!parsed.ok) {
        missing++
        continue
      }
      const activity = parsed.activities.find(
        (candidate) =>
          candidate.sport === record.digest.sport &&
          Math.round(candidate.startMs / 1000) === Math.round(record.digest.startMs / 1000),
      )
      if (!activity) {
        missing++
        continue
      }
      const fileHash = await hashHex(bytes)
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
      rebuilt++
    } catch (error) {
      const issue = syncIssueFor(error)
      // A sign-out or account change would fail every remaining activity the same way.
      if (haltsImport(issue)) throw error
      if (error instanceof Error && 'status' in error && error.status === 404) missing++
      // The stored original no longer matches a different saved copy, so it cannot be matched.
      else if (issue === 'activity-conflict') missing++
      else if (issue === 'daily-limit' || issue === 'rate-limited') {
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
    refreshed = await listActivities(undefined, userId, (count) => {
      refreshedUnreadable += count
    })
    unreadable = refreshedUnreadable
  } catch {
    // Rebuild successes remain usable even if the final refresh is interrupted.
    failed++
    refreshed = records
  }
  const state = session.loadDigests(
    refreshed.map((record) => record.digest),
    settings,
  )
  savedRecords.clear()
  for (const record of refreshed) savedRecords.set(record.id, record)
  reportLibrary()
  reportUnreadable(unreadable)
  // The error has no Retry-After, so a rate limit is assumed to clear with its 60 s window.
  const limitResetsAtMs =
    limitKind === 'daily'
      ? nextUtcMidnightMs(Date.now())
      : limitKind === 'rate'
        ? Date.now() + RATE_LIMIT_WINDOW_MS
        : null
  return { state, rebuilt, missing, failed, limited, limitKind, limitResetsAtMs }
}

// Requests are handled strictly in order so a settings change cannot overtake a file import.
let queue: Promise<void> = Promise.resolve()
self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  queue = queue.then(async () => {
    try {
      if (event.data.type === 'addFiles') {
        post({ type: 'state', ...(await addFiles(event.data)) })
      } else if (event.data.type === 'rebuildStale') {
        post({
          type: 'rebuildComplete',
          ...(await rebuildStale(event.data.settings, event.data.userId)),
        })
      } else if (event.data.type === 'exportData') {
        post({ type: 'exportReady', file: await exportAccount(event.data) })
      } else {
        post({ type: 'state', state: await handle(event.data) })
      }
    } catch (error) {
      post({
        type: 'error',
        message: messageOf(error),
        ...(error instanceof ApiRequestError ? { issue: syncIssueFor(error) } : {}),
      })
    }
  })
}
