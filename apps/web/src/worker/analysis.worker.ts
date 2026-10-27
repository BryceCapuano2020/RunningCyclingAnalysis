/// <reference lib="webworker" />
import type { ActivityRecord } from '@rca/contract'
import { countActivityFiles } from '@rca/core/fit'
import { AnalysisSession } from '@rca/core/session'
import type { SyncIssueCode } from '@rca/core/session'
import type { SessionState } from '@rca/core/session'
import { ApiRequestError, deleteActivity } from '../api/client'
import { messageOf } from '../api/messageOf'
import { accountSaver } from './accountSave'
import { deviceActions, workoutKeyOf as activityKey } from './device'
import { exportAccount } from './exportAccount'
import { openDeviceLibrary } from './deviceLibrary'
import { loadServer, rebuildStale, type LibraryContext } from './rebuild'
import type { ImportOutcome, WorkerRequest, WorkerResponse } from './protocol'
import { ImportReporter } from './importReporter'
import { RouteMemory, type RouteMemoryRequest } from './routes'
import { summarizeAdded } from './importSummary'
import { savedActivityOf } from './savedActivity'
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
    activities: records.map(({ id, digest }) => savedActivityOf(id, digest)),
  })
}

const device = deviceActions(session, openDeviceLibrary(), post)
const libraryContext: LibraryContext = {
  session,
  device,
  savedRecords,
  missingOriginals,
  post,
  reportLibrary,
  reportUnreadable,
}
const routes = new RouteMemory(savedRecords, (id) => device.route(id))
// The sample is shown in place of the library kept in this browser, never added to it.
let showingSample = false

/** Runs one import: each new activity is saved, and its file uploaded when files are kept. */
async function addFiles(
  request: Extract<WorkerRequest, { type: 'addFiles' }>,
): Promise<{ state: SessionState; outcome: ImportOutcome }> {
  const { sync } = request
  let stoppedBy: SyncIssueCode | null = null
  let outcome: ImportOutcome = { activities: 0, rejected: 0, duplicates: [] }
  // Read from the zips' directories before any entry is, so every progress message can show a total.
  const reporter = new ImportReporter(post, await countActivityFiles(request.files), sync !== null)
  reporter.begin()
  const save =
    sync === null
      ? undefined
      : accountSaver({
          sync,
          savedRecords,
          missingOriginals,
          routes,
          onSaved: () => reporter.activitySaved(),
          onPaused: () => reporter.savesPaused(),
          onStopped: (code) => {
            stoppedBy ??= code
          },
        })

  // Files saved here join the library kept in this browser, unless the session already holds it.
  if (sync === null && request.saveToDevice && !device.inSession())
    await device.load(request.settings)
  showingSample = false
  let state: SessionState
  try {
    state = await session.addFiles(
      request.files,
      request.settings,
      (count) => reporter.filesReadSoFar(count),
      save ?? (request.saveToDevice ? device.save : undefined),
      sync?.keepFiles === true,
      ({ added, ...completed }) => {
        outcome = { ...completed, ...summarizeAdded(added) }
      },
    )
    reporter.end()
  } finally {
    reporter.abandon()
  }
  if (sync !== null) {
    post({ type: 'missingOriginals', count: missingOriginals.size })
    reportLibrary()
  } else if (request.saveToDevice) {
    await device.report()
  }
  if (stoppedBy !== null) post({ type: 'accountIssue', issue: stoppedBy })
  return { state, outcome }
}

async function handle(request: Exclude<WorkerRequest, RouteMemoryRequest>): Promise<SessionState> {
  switch (request.type) {
    case 'addFiles':
      return (await addFiles(request)).state
    case 'loadSample':
      showingSample = true
      device.replaced()
      session.choosePeriod(request.choice)
      return session.loadSample(request.settings)
    case 'loadServer':
      showingSample = false
      return loadServer(libraryContext, request.settings, request.userId, request.choice)
    case 'rebuildStale':
      return (await rebuildStale(libraryContext, request.settings, request.userId)).state
    case 'setSettings':
      return session.setSettings(request.settings)
    case 'setGradeTrend':
      return session.setGradeTrend(request.on, request.settings)
    case 'setRange':
      return session.setRange(request.choice, request.settings)
    case 'loadDevice':
      // A sample on screen, or a library already read, stays as it is: loading it again would
      // drop what was imported since.
      if (showingSample || device.inSession()) {
        await device.report()
        return session.setSettings(request.settings)
      }
      session.choosePeriod(request.choice)
      return device.load(request.settings)
    case 'clear':
      showingSample = false
      routes.clear()
      if (request.forgetDevice) await device.forget()
      else device.replaced()
      return session.clear()
    case 'deleteDeviceActivity':
      return device.remove(request.id, request.settings)
    case 'exportData':
      // Answered by exportAccount with the export file, not with a session state.
      throw new Error('An export is not a session request')
    case 'activitySplits':
      // Answered with a splits reply, not with a session state.
      throw new Error('A splits request is not a session request')
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
      routes.forget(record.id)
      missingOriginals.delete(activityKey(record.digest))
      // The copy kept in this browser goes too, so the activity cannot return after a sign-out. The
      // account copy is already gone, so a copy that cannot be removed here does not fail the delete.
      await device.dropKept(activityKey(record.digest)).catch(() => undefined)
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
          ...(await rebuildStale(libraryContext, event.data.settings, event.data.userId)),
        })
      } else if (event.data.type === 'exportData') {
        post({ type: 'exportReady', file: await exportAccount(event.data) })
      } else if (event.data.type === 'activitySplits') {
        post({ type: 'splits', id: event.data.id, splits: session.splitsOf(event.data.id) })
      } else if (event.data.type === 'routeShape' || event.data.type === 'forgetRoutes') {
        post(await routes.reply(event.data))
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
