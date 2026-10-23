/// <reference lib="webworker" />
import { MAX_FILE_BYTES } from '@rca/contract'
import { parseFit } from '@rca/core/fit'
import { digestActivity, MODEL_REVISION } from '@rca/core/digest'
import { AnalysisSession, haltsImport, SyncFailure } from '@rca/core/session'
import type { SyncIssueCode } from '@rca/core/session'
import type { SessionState, SyncItem } from '@rca/core/session'
import type { ActivityDigest, AthleteSettings } from '@rca/core/types'
import {
  ApiRequestError,
  createActivity,
  downloadActivityFile,
  listActivities,
  uploadFile,
} from '../api/client'
import type { WorkerRequest, WorkerResponse } from './protocol'
import { syncIssueFor } from './syncIssue'

const session = new AnalysisSession()
const post = (message: WorkerResponse) => self.postMessage(message)
/** Keys of saved activities whose original file is not in the library. Recomputed on each load. */
const missingOriginals = new Set<string>()

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
): Promise<SessionState> {
  const { sync } = request
  let filesRead = 0
  // Activities saved to the library, counting the digest alone when files are not kept.
  let uploaded = 0
  let storageBudgetExhausted = false
  let haltedBy: SyncIssueCode | null = null
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
      if (record.hasFile) missingOriginals.delete(key)
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
          await uploadFile(record.id, item.bytes, sync.userId)
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
  )
  if (sync !== null) post({ type: 'missingOriginals', count: missingOriginals.size })
  if (haltedBy !== null) post({ type: 'accountIssue', issue: haltedBy })
  return state
}

async function handle(request: WorkerRequest): Promise<SessionState> {
  switch (request.type) {
    case 'addFiles':
      return addFiles(request)
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
  }
}

/** Fetches the account's digests here, so a large library never crosses the main thread. */
async function loadServer(settings: AthleteSettings, userId: string): Promise<SessionState> {
  const records = await listActivities(undefined, userId)
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

async function hashHex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Rebuild stale digests only from their exact stored original file, retaining partial successes. */
async function rebuildStale(settings: AthleteSettings, userId: string) {
  const records = await listActivities(undefined, userId)
  const stale = records.filter((record) => record.digest.modelRevision < MODEL_REVISION)
  let rebuilt = 0
  let missing = 0
  let failed = 0
  for (const record of stale) {
    if (!record.hasFile) {
      missing++
      continue
    }
    try {
      const bytes = await downloadActivityFile(record.id, userId)
      const parsed = parseFit(bytes, record.fileName)
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
      const { record: upgraded } = await createActivity(
        digestActivity(activity),
        record.fileName,
        fileHash,
        userId,
      )
      const recordIndex = records.findIndex((candidate) => candidate.id === record.id)
      if (recordIndex >= 0) records[recordIndex] = upgraded
      rebuilt++
    } catch (error) {
      // A sign-out or account change would fail every remaining activity the same way.
      if (haltsImport(syncIssueFor(error))) throw error
      if (error instanceof Error && 'status' in error && error.status === 404) missing++
      else failed++
    }
  }
  let refreshed
  try {
    refreshed = await listActivities(undefined, userId)
  } catch {
    // Rebuild successes remain usable even if the final refresh is interrupted.
    failed++
    refreshed = records
  }
  const state = session.loadDigests(
    refreshed.map((record) => record.digest),
    settings,
  )
  return { state, rebuilt, missing, failed }
}

// Requests are handled strictly in order so a settings change cannot overtake a file import.
let queue: Promise<void> = Promise.resolve()
self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  queue = queue.then(async () => {
    try {
      if (event.data.type === 'rebuildStale') {
        post({
          type: 'rebuildComplete',
          ...(await rebuildStale(event.data.settings, event.data.userId)),
        })
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
