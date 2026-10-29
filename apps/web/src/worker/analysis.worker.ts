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
import { deviceKeeper } from './deviceKeeper'
import { exportAccount } from './exportAccount'
import { openDeviceLibrary } from './deviceLibrary'
import { originalActivity } from './originalActivity'
import { outdatedWithOriginal } from './outdatedOriginals'
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
/** Ids of saved records whose original a rebuild could not match to the record. Cleared on a library load. */
const unmatchedOriginals = new Set<string>()
const workbench = new Workbench()
/** The activities provisional imports analysed, by workout, with no file bytes. See keepProvisional. */
const provisionalItems = new Map<string, SyncItem>()
/** The exact library scope this worker is currently allowed to answer details for. */
let activeScope: TraceScope | null = null

/** The outdated saved activities Update now can rebuild, for the replies that carry the state. */
const rebuildable = (): { outdatedWithOriginal?: number } => {
  const count = outdatedWithOriginal(session, savedRecords, unmatchedOriginals)
  return count > 0 ? { outdatedWithOriginal: count } : {}
}

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
  unmatchedOriginals,
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
  // What storage turned away in an earlier import says nothing about room now.
  workbench.forgetOutranked()
  // Signing in again lifts the block that signing out put on the account's recordings.
  if (traceScope?.kind === 'account') await workbench.reopenScope(traceScope)
  let stoppedBy: SyncIssueCode | null = null
  // Activities the import already held and gave a recording back, which the summary says. A
  // candidate is one whose recording was missing; it counts once it is in storage.
  const restored = new Set<string>()
  const restoreCandidates = new Set<string>()
  const addedIds = new Set<string>()
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
  const keeper = deviceKeeper(device, post)
  // While the account is unknown, the activities are held for the device without their files, to be
  // kept as they are if nobody turns out to be signed in.
  const holdForDevice = async (item: SyncItem) => {
    provisionalItems.set(activityKey(item.digest), { ...item, bytes: new Uint8Array() })
  }
  let state: SessionState
  try {
    state = await session.addFiles(
      request.files,
      request.settings,
      (count) => reporter.filesReadSoFar(count),
      save ??
        (request.provisional ? holdForDevice : request.saveToDevice ? keeper.keep : undefined),
      sync?.keepFiles === true,
      ({ added, ...completed }) => {
        for (const digest of added) addedIds.add(digest.id)
        outcome = { ...completed, ...summarizeAdded(added) }
      },
      async (activity, { held }) => {
        if (traceScope === null) {
          // Held for the device if the account turns out to be nobody's (see keepProvisional).
          if (request.provisional) workbench.captureDeferred(activity, { kind: 'device' })
          else workbench.captureMemory(activity, { kind: 'device' })
          return
        }
        // Only a workout the library already held can have its recording restored.
        const had = held && (await workbench.holds(traceScope, activity.id))
        // Stored when the import ends, newest first, so the ones the cache cannot hold are not written.
        const kept = workbench.captureDeferred(activity, traceScope)
        if (held && !had && kept !== null) restoreCandidates.add(activity.id)
      },
      async (replacedId) => {
        restored.delete(replacedId)
        restoreCandidates.delete(replacedId)
        if (traceScope === null) workbench.dropMemory({ kind: 'device' }, replacedId)
        else await workbench.remove(traceScope, replacedId)
      },
    )
  } finally {
    // On a failure too: what was read is stored, and the page learns how many were saved.
    // A provisional import's recordings wait for keepProvisional, or for the account.
    const stored = traceScope === null ? new Set<string>() : await workbench.storeDeferred()
    // Counted once it is in storage: a recording held in memory alone is gone after a reload.
    for (const id of restoreCandidates) if (stored.has(id)) restored.add(id)
    reporter.end()
    // On a failure too, so the page does not keep the count from before the import.
    if (sync !== null) post({ type: 'missingOriginals', count: missingOriginals.size })
  }
  const detailRestored = [...restored].filter((id) => !addedIds.has(id)).length
  if (detailRestored > 0) outcome = { ...outcome, detailRestored }
  if (sync !== null) {
    reportLibrary()
  } else if (request.saveToDevice) {
    await device.report()
    keeper.report()
  }
  if (stoppedBy !== null) post({ type: 'accountIssue', issue: stoppedBy })
  return { state, outcome, ...(sync ? { saved: reporter.savedCount } : {}) }
}

async function handle(request: Exclude<WorkerRequest, RouteMemoryRequest>): Promise<SessionState> {
  switch (request.type) {
    case 'addFiles':
      return (await addFiles(request)).state
    case 'keepProvisional': {
      const keeper = deviceKeeper(device, post)
      const held = [...provisionalItems.values()]
      provisionalItems.clear()
      for (const item of held) await keeper.keep(item)
      await workbench.storeDeferred()
      await device.report()
      keeper.report()
      return session.setSettings(request.settings)
    }
    case 'loadSample':
      provisionalItems.clear()
      workbench.clearMemory()
      activeScope = { kind: 'device' }
      showingSample = true
      device.replaced()
      session.choosePeriod(periodChoiceOf(request.choice))
      return session.loadSample(request.settings)
    case 'loadServer':
      provisionalItems.clear()
      workbench.clearMemory()
      activeScope = { kind: 'account', userId: request.userId }
      await workbench.reopenScope(activeScope)
      showingSample = false
      return loadServer(
        libraryContext,
        request.settings,
        request.userId,
        periodChoiceOf(request.choice),
      )
    case 'rebuildStale':
      // Answered by rebuildComplete, from onmessage; the scope was set by the library load before it.
      throw new Error('A rebuild is not a session request')
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
      provisionalItems.clear()
      workbench.clearMemory()
      activeScope = { kind: 'device' }
      session.choosePeriod(periodChoiceOf(request.choice))
      return device.load(request.settings)
    case 'clear':
      provisionalItems.clear()
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
        post({
          type: 'state',
          ...(await addFiles(event.data)),
          ...rebuildable(),
        })
      } else if (event.data.type === 'rebuildStale') {
        post({
          type: 'rebuildComplete',
          ...(await rebuildStale(libraryContext, event.data.settings, event.data.userId)),
          ...rebuildable(),
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
        post({
          type: 'state',
          state: await handle(event.data),
          ...rebuildable(),
        })
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
