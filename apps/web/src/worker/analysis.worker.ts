/// <reference lib="webworker" />
import type { ActivityRecord } from '@rca/contract'
import { periodChoiceOf } from '@rca/core/period'
import { AnalysisSession } from '@rca/core/session'
import { sampleDataset } from '@rca/core/synthetic'
import type { SyncIssueCode, SyncItem } from '@rca/core/session'
import type { SessionState } from '@rca/core/session'
import type { Activity } from '@rca/core/types'
import { ApiRequestError, deleteActivity } from '../api/client'
import { messageOf } from '../api/messageOf'
import { accountSaver } from './accountSave'
import { deviceActions, workoutKeyOf as activityKey } from './device'
import { exportAccount } from './exportAccount'
import { openDeviceLibrary } from './deviceLibrary'
import { originalActivity } from './originalActivity'
import { loadServer, rebuildStale, type LibraryContext } from './rebuild'
import type { ImportOutcome, WorkerRequest, WorkerResponse } from './protocol'
import { ImportReporter } from './importReporter'
import { RouteMemory, type RouteMemoryRequest } from './routes'
import { summarizeAdded } from './importSummary'
import { savedActivityOf } from './savedActivity'
import { syncIssueFor } from './syncIssue'
import { Workbench } from './workbench'
import type { ActivityTraceReply } from './workbench'
import type { TraceScope } from './workbenchStore'

const session = new AnalysisSession()
const post = (message: WorkerResponse) => self.postMessage(message)
/** Keys of saved activities whose original file is not in the library. Recomputed on each load. */
const missingOriginals = new Set<string>()
const savedRecords = new Map<string, ActivityRecord>()
const workbench = new Workbench()
/** The exact library scope this worker is currently allowed to answer details for. */
let activeScope: TraceScope | null = null

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

const device = deviceActions(session, openDeviceLibrary(), post, async (activityId) =>
  workbench.remove({ kind: 'device' }, activityId),
)
const libraryContext: LibraryContext = {
  session,
  device,
  savedRecords,
  missingOriginals,
  post,
  reportLibrary,
  reportUnreadable,
  captureTrace: async (activity: Activity, userId: string) => {
    await workbench.capture(activity, { kind: 'account', userId })
  },
}
const routes = new RouteMemory(savedRecords, (id) => device.route(id))
// The sample is shown in place of the library kept in this browser, never added to it.
let showingSample = false

/** Runs one import: each new activity is saved, and its file uploaded when files are kept. */
async function addFiles(
  request: Extract<WorkerRequest, { type: 'addFiles' }>,
): Promise<{ state: SessionState; outcome: ImportOutcome; saved?: number }> {
  const { sync } = request
  if (showingSample) workbench.clearMemory()
  // Recordings are kept where the activities are: with the account, or in this browser when the
  // visitor keeps their files here. Files analysed for one session only, as for a signed-in visitor
  // whose account is not known yet, leave their recordings in memory.
  const traceScope: TraceScope | null =
    sync !== null
      ? { kind: 'account', userId: sync.userId }
      : request.saveToDevice === true
        ? { kind: 'device' }
        : null
  activeScope = traceScope ?? { kind: 'device' }
  let stoppedBy: SyncIssueCode | null = null
  let outcome: ImportOutcome = {
    activities: 0,
    filesAdded: 0,
    rejected: 0,
    notActivities: 0,
    duplicates: [],
  }
  // Read from the zips' directories before any entry is, so every progress message can show a total.
  // An export's saved routes are not activities, so they are not in it.
  const reporter = new ImportReporter(post, await session.countFiles(request.files), sync !== null)
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
  // Workouts this browser refused to keep, counted once however many copies of one were refused, and
  // not at all when another copy of it was kept. The results still show; the page is told the count.
  const refused = new Set<string>()
  const keptKeys = new Set<string>()
  const keepOnDevice = async (item: SyncItem) => {
    const key = activityKey(item.digest)
    if (await device.save(item)) keptKeys.add(key)
    else refused.add(key)
  }
  const notKept = () => [...refused].filter((key) => !keptKeys.has(key)).length
  let state: SessionState
  try {
    state = await session.addFiles(
      request.files,
      request.settings,
      (count) => reporter.filesReadSoFar(count),
      save ?? (request.saveToDevice ? keepOnDevice : undefined),
      sync?.keepFiles === true,
      ({ added, ...completed }) => {
        outcome = { ...completed, ...summarizeAdded(added) }
      },
      async (activity) => {
        if (traceScope === null) workbench.captureMemory(activity, { kind: 'device' })
        else await workbench.capture(activity, traceScope)
      },
      async (replacedId) => {
        if (traceScope === null) workbench.dropMemory({ kind: 'device' }, replacedId)
        else await workbench.remove(traceScope, replacedId)
      },
    )
  } finally {
    // On a failure too: the page learns how many were saved before the error reply.
    reporter.end()
  }
  if (sync !== null) {
    post({ type: 'missingOriginals', count: missingOriginals.size })
    reportLibrary()
  } else if (request.saveToDevice) {
    await device.report()
    const count = notKept()
    if (count > 0) post({ type: 'deviceIssue', issue: 'notSaved', count })
  }
  if (stoppedBy !== null) post({ type: 'accountIssue', issue: stoppedBy })
  return { state, outcome, ...(sync ? { saved: reporter.savedCount } : {}) }
}

async function handle(request: Exclude<WorkerRequest, RouteMemoryRequest>): Promise<SessionState> {
  switch (request.type) {
    case 'addFiles':
      return (await addFiles(request)).state
    case 'loadSample':
      workbench.clearMemory()
      activeScope = { kind: 'device' }
      showingSample = true
      device.replaced()
      session.choosePeriod(periodChoiceOf(request.choice))
      return session.loadSample(request.settings)
    case 'loadServer':
      workbench.clearMemory()
      activeScope = { kind: 'account', userId: request.userId }
      showingSample = false
      return loadServer(
        libraryContext,
        request.settings,
        request.userId,
        periodChoiceOf(request.choice),
      )
    case 'rebuildStale':
      workbench.clearMemory()
      activeScope = { kind: 'account', userId: request.userId }
      return (await rebuildStale(libraryContext, request.settings, request.userId)).state
    case 'setSettings':
      return session.setSettings(request.settings)
    case 'setGradeTrend':
      return session.setGradeTrend(request.on, request.settings)
    case 'setRange':
      return session.setRange(periodChoiceOf(request.choice) ?? 'default', request.settings)
    case 'loadDevice':
      // A sample on screen, or a library already read, stays as it is: loading it again would
      // drop what was imported since.
      if (showingSample || device.inSession()) {
        await device.report()
        return session.setSettings(request.settings)
      }
      workbench.clearMemory()
      activeScope = { kind: 'device' }
      session.choosePeriod(periodChoiceOf(request.choice))
      return device.load(request.settings)
    case 'clear':
      showingSample = false
      workbench.clearMemory()
      routes.clear()
      if (request.forgetDevice) {
        // The page is told once: forget() has already told it when the library would not clear.
        const forgotten = await device.forget()
        if (!(await workbench.clearScope({ kind: 'device' })) && forgotten)
          post({ type: 'deviceIssue', issue: 'notForgotten' })
      } else device.replaced()
      return session.clear()
    case 'deleteDeviceActivity':
      workbench.clearMemory()
      return device.remove(request.id, request.settings)
    case 'exportData':
      // Answered by exportAccount with the export file, not with a session state.
      throw new Error('An export is not a session request')
    case 'activitySplits':
      // Answered with a splits reply, not with a session state.
      throw new Error('A splits request is not a session request')
    case 'activityTrace':
      throw new Error('An activity trace is not a session request')
    case 'deleteActivity': {
      if (activeScope?.kind !== 'account' || activeScope.userId !== request.userId)
        throw new Error('Reload your library before deleting this activity.')
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
      const traceCleared = await workbench.remove(
        { kind: 'account', userId: request.userId },
        record.digest.id,
      )
      const deviceTraceCleared = await workbench.remove({ kind: 'device' }, record.digest.id)
      // The copy kept in this browser goes too, so the activity cannot return after a sign-out. The
      // account copy is already gone, so a copy that cannot be removed here does not fail the delete;
      // the page is told, once, since it could return after a sign-out.
      const keptDropped = await device.dropKept(activityKey(record.digest)).then(
        () => true,
        () => false,
      )
      if (!traceCleared || !deviceTraceCleared || !keptDropped)
        post({ type: 'deviceIssue', issue: 'notForgotten' })
      reportLibrary()
      post({ type: 'missingOriginals', count: missingOriginals.size })
      return session.removeActivity(record.digest.sport, record.digest.startMs, request.settings)
    }
  }
}

async function activityTraceReply(
  request: Extract<WorkerRequest, { type: 'activityTrace' }>,
): Promise<ActivityTraceReply> {
  const scope =
    activeScope !== null &&
    (request.userId === undefined
      ? activeScope.kind === 'device'
      : activeScope.kind === 'account' && activeScope.userId === request.userId)
      ? activeScope
      : null
  if (scope === null) return { kind: 'failed' }
  const cached = await workbench.get(scope, request.id)
  if (cached !== null) return { kind: 'trace', trace: cached }
  if (request.userId === undefined) {
    if (!showingSample) return { kind: 'missing' }
    const activity = sampleDataset().activities.find((candidate) => candidate.id === request.id)
    if (activity === undefined) return { kind: 'missing' }
    workbench.captureMemory(activity, scope)
    const trace = await workbench.get(scope, request.id)
    return trace === null ? { kind: 'missing' } : { kind: 'trace', trace }
  }
  const record = [...savedRecords.values()].find((candidate) => candidate.digest.id === request.id)
  if (record === undefined || !record.hasFile) return { kind: 'missing' }
  if (request.fromOriginal !== true) return { kind: 'original' }
  try {
    const { activity } = await originalActivity(record, request.userId, request.id)
    if (activity === undefined) return { kind: 'missing' }
    const trace = await workbench.capture(activity, scope)
    return trace === null ? { kind: 'missing' } : { kind: 'trace', trace }
  } catch {
    return { kind: 'failed' }
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
        if (event.data.type === 'forgetRoutes') {
          workbench.clearMemory()
          activeScope = null
        }
        post(await routes.reply(event.data))
      } else if (event.data.type === 'activityTrace') {
        post({ type: 'activityTrace', reply: await activityTraceReply(event.data) })
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
