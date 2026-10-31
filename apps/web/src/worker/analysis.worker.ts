/// <reference lib="webworker" />
import type { ActivityRecord } from '@rca/contract'
import { periodChoiceOf } from '@rca/core/period'
import { AnalysisSession } from '@rca/core/session'
import type { SyncItem } from '@rca/core/session'
import type { SessionState } from '@rca/core/session'
import type { Activity } from '@rca/core/types'
import { ApiRequestError } from '../api/client'
import { messageOf } from '../api/messageOf'
import { deviceActions } from './device'
import { followUpAdopted } from './adoption'
import {
  adoptDeviceRequest,
  forgetDeviceLibraryRequest,
  keptTraceDropper,
  offerDevice,
} from './adoptionRequests'
import type { AdoptionRequestContext } from './adoptionRequests'
import { deviceZone } from './viewerZone'
import { deviceKeeper } from './deviceKeeper'
import { clearOutbox, openOutbox } from './outbox'
import { SendingKeys } from './sendingKeys'
import { resumeOutbox } from './outboxResume'
import { resumeAsWriter } from './writerResume'
import type { Writing } from './writerResume'
import { exportAccount } from './exportAccount'
import { deleteSavedGroup } from './deleteGroup'
import type { DeleteGroupContext } from './deleteGroup'
import { hiddenRecordIds, visibleRecords } from './hiddenCopies'
import { openDeviceLibrary } from './deviceLibrary'
import { originalActivity } from './originalActivity'
import { outdatedWithOriginal } from './outdatedOriginals'
import { loadServer, rebuildStale, type LibraryContext } from './rebuild'
import type { WireRequest, WorkerRequest, WorkerResponse } from './protocol'
import { observeRequests } from '../api/requestActivity'
import {
  beginRequest,
  noteArrival,
  noteStart,
  noteWork,
  stamped,
  waitingToChangeLibrary,
} from './workerWire'
import { clearCheckinScope } from './checkinStore'
import { forgetHeldKeys } from './heldIndex'
import { runImport } from './importRun'
import type { ImportRunContext } from './importRun'
import { newWorkerView } from './workerView'
import { RouteMemory, type RouteMemoryRequest } from './routes'
import { DETAIL_CHANGING, DETAIL_RESCOPING, detailReporter } from './detailCoverage'
import { deviceClock, sampleActivityById } from './sampleClock'
import { savedActivityOf } from './savedActivity'
import { syncIssueFor } from './syncIssue'
import { Workbench } from './workbench'
import type { ActivityTraceReply } from './workbench'

const session = new AnalysisSession()
// Where a file recorded no local day, days and weeks are cut in the device's zone.
session.setZone(deviceZone)
const post = (message: WorkerResponse) => self.postMessage(stamped(message))
/** Keys of saved activities whose original file is not in the library. Recomputed on each load. */
const missingOriginals = new Set<string>()
const savedRecords = new Map<string, ActivityRecord>()
/** Ids of saved records whose original a rebuild could not match to the record. Cleared on a library load. */
const unmatchedOriginals = new Set<string>()
const workbench = new Workbench()
/** The activities provisional imports analysed, by workout, with no file bytes. See keepProvisional. */
const provisionalItems = new Map<string, SyncItem>()

/** The outdated saved activities Update now can rebuild, for the replies that carry the state. */
const rebuildable = (): { outdatedWithOriginal?: number } => {
  const count = outdatedWithOriginal(session, savedRecords, unmatchedOriginals)
  return count > 0 ? { outdatedWithOriginal: count } : {}
}

/** Newest first; records that start together are ordered by id so the list is stable. */
function reportLibrary() {
  const records = visibleRecords(savedRecords.values()).sort(
    (a, b) => b.digest.startMs - a.digest.startMs || a.id.localeCompare(b.id),
  )
  post({
    type: 'libraryActivities',
    activities: records.map(({ id, digest }) => savedActivityOf(id, digest)),
  })
}

const deviceLibrary = openDeviceLibrary()
const device = deviceActions(
  session,
  deviceLibrary,
  post,
  async (activityId) => workbench.remove({ kind: 'device' }, activityId),
  () => workbench.watchDevice(),
)
const view = newWorkerView()
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
  stamp: () => {
    const { libraryEpoch, activeScope } = view
    // A load or a clear moves the epoch, and a load for another user replaces the scope.
    return () => view.libraryEpoch === libraryEpoch && view.activeScope === activeScope
  },
  waitingToChange: waitingToChangeLibrary,
}
const routes = new RouteMemory(savedRecords, (id) => device.route(id))
// A request that makes headway (an answer, a chunk of a download) counts as work, so a slow link is not a stall.
observeRequests(noteWork)
const sending = new SendingKeys()
const importContext: ImportRunContext = {
  sending,
  session,
  post,
  missingOriginals,
  savedRecords,
  workbench,
  provisionalItems,
  device,
  routes,
  view,
  reportLibrary,
}
const reportDetail = detailReporter(workbench, post, () =>
  view.showingSample ? null : view.activeScope,
)

/** The activities an earlier visit began to save and did not are finished, apart from the requests that follow. */
let resume: Writing | null = null
const adoptionContext: AdoptionRequestContext = {
  session,
  deviceLibrary,
  savedRecords,
  sending,
  workbench,
  view,
  libraryContext,
  post,
  resume: () => resume,
  resumeEnded: () => {
    resume = null
  },
}
function finishLoad(state: SessionState, userId: string): SessionState {
  // In the tab that holds the account's writer lock only: with two tabs open, one sends.
  resume = resumeAsWriter(userId, () =>
    resumeOutbox({
      userId,
      outbox: openOutbox(userId),
      savedRecords,
      sending,
      // Apart from any request: stamped with one, the page would drop it as late.
      post: (message) => self.postMessage(message),
      // Saves of kept activities that an Add began and a stop or a reload cut short finish here: the kept copy goes too.
      settled: (row, outcome) =>
        followUpAdopted(
          { library: deviceLibrary, savedRecords, adopted: keptTraceDropper(workbench) },
          row,
          outcome,
        ),
    }),
  )
  void offerDevice(adoptionContext, userId)
  return state
}

/** The kept library was emptied under an import: the page is told, and starts from what is kept now. */
function stopEmptied(): SessionState {
  post({ type: 'deviceIssue', issue: 'replaced' })
  device.replaced()
  workbench.clearMemory()
  return session.clear()
}

const deleteContext: DeleteGroupContext = {
  session,
  savedRecords,
  unmatchedOriginals,
  missingOriginals,
  routes,
  workbench,
  device,
  post,
  reportLibrary,
}

async function handle(request: Exclude<WorkerRequest, RouteMemoryRequest>): Promise<SessionState> {
  switch (request.type) {
    case 'addFiles':
      return (await runImport(importContext, request)).state
    case 'keepProvisional': {
      const keeper = deviceKeeper(device, post)
      const held = [...provisionalItems.values()]
      provisionalItems.clear()
      for (const item of held) await keeper.keep(item)
      // Not when the kept library was emptied meanwhile: the recordings would outlive their activities.
      const emptied = keeper.replaced || workbench.libraryReplaced || !(await device.current())
      if (emptied) workbench.dropDeferred()
      await workbench.storeDeferred()
      if (emptied || workbench.libraryReplaced) return stopEmptied()
      await device.report()
      keeper.report()
      return session.setSettings(request.settings)
    }
    case 'loadSample':
      view.libraryEpoch++
      provisionalItems.clear()
      workbench.clearMemory()
      view.activeScope = { kind: 'device' }
      view.showingSample = true
      view.sampleClock = deviceClock()
      device.replaced()
      session.choosePeriod(periodChoiceOf(request.choice))
      return session.loadSample(request.settings, view.sampleClock)
    case 'loadServer':
      view.libraryEpoch++
      provisionalItems.clear()
      workbench.clearMemory()
      view.activeScope = { kind: 'account', userId: request.userId }
      await workbench.reopenScope(view.activeScope)
      view.showingSample = false
      // A resume belongs to the library it began under.
      resume?.cancel()
      resume = null
      return finishLoad(
        await loadServer(
          libraryContext,
          request.settings,
          request.userId,
          periodChoiceOf(request.choice),
        ),
        request.userId,
      )
    case 'adoptDevice':
      return adoptDeviceRequest(adoptionContext, request)
    case 'forgetDeviceLibrary':
      return forgetDeviceLibraryRequest(adoptionContext, request)
    case 'rebuildStale':
      // Answered by rebuildComplete, from onmessage; the scope was set by the library load before it.
      throw new Error('A rebuild is not a session request')
    case 'setSettings':
      return session.setSettings(request.settings)
    case 'setRange':
      return session.setRange(periodChoiceOf(request.choice) ?? 'default', request.settings)
    case 'loadDevice':
      // Results shown here that could not be kept are not given up for a reload: they stay as they are.
      if (request.reload === true && !device.hasUnkept()) device.replaced()
      // A sample on screen, or a library already read, stays as it is: loading it again would
      // drop what was imported since.
      if (view.showingSample || device.inSession()) {
        await device.report()
        return session.setSettings(request.settings)
      }
      view.libraryEpoch++
      provisionalItems.clear()
      workbench.clearMemory()
      view.activeScope = { kind: 'device' }
      session.choosePeriod(periodChoiceOf(request.choice))
      return device.load(request.settings)
    case 'clear':
      view.libraryEpoch++
      resume?.cancel()
      resume = null
      provisionalItems.clear()
      view.showingSample = false
      workbench.clearMemory()
      routes.clear()
      if (request.forgetDevice) {
        // The page is told once: forget() has already told it when the library would not clear.
        const forgotten = await device.forget()
        // The index of files read goes with the library it describes.
        await clearCheckinScope('device')
        const tracesCleared = await workbench.clearScope({ kind: 'device' })
        // Every waiting save goes too, an expired session's included: nothing kept here stays, and a visitor who is
        // signed out has no account on screen to ask about them.
        const outboxCleared = await clearOutbox()
        if ((!tracesCleared || !outboxCleared) && forgotten)
          post({ type: 'deviceIssue', issue: 'notForgotten' })
      } else device.replaced()
      return session.clear()
    case 'deleteDeviceActivity':
      workbench.clearMemory()
      await forgetHeldKeys('device', [request.id])
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
      if (view.activeScope?.kind !== 'account' || view.activeScope.userId !== request.userId)
        throw new Error('Reload your library before deleting this activity.')
      const record = savedRecords.get(request.id)
      if (!record) throw new Error('Reload your library before deleting this activity.')
      return deleteSavedGroup(deleteContext, record, request.userId, request.settings)
    }
  }
}

async function activityTraceReply(
  request: Extract<WorkerRequest, { type: 'activityTrace' }>,
): Promise<ActivityTraceReply> {
  const scope =
    view.activeScope !== null &&
    (request.userId === undefined
      ? view.activeScope.kind === 'device'
      : view.activeScope.kind === 'account' && view.activeScope.userId === request.userId)
      ? view.activeScope
      : null
  if (scope === null) return { kind: 'failed' }
  const cached = await workbench.get(scope, request.id)
  if (cached !== null) return { kind: 'trace', trace: cached }
  if (request.userId === undefined) {
    if (!view.showingSample) return { kind: 'missing' }
    const activity = sampleActivityById(view.sampleClock, request.id)
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
  const requestId = (event.data as Partial<WireRequest>).requestId
  noteArrival(event.data.type)
  queue = queue.then(async () => {
    noteStart(event.data.type)
    const endRequest = beginRequest(requestId, (message) => self.postMessage(message))
    try {
      if (event.data.type === 'addFiles') {
        const imported = await runImport(importContext, event.data)
        await reportDetail()
        post({ type: 'state', ...imported, ...rebuildable() })
      } else if (event.data.type === 'rebuildStale') {
        const rebuilt = await rebuildStale(libraryContext, event.data.settings, event.data.userId)
        await reportDetail()
        post({ type: 'rebuildComplete', ...rebuilt, ...rebuildable() })
      } else if (event.data.type === 'exportData') {
        post({
          type: 'exportReady',
          file: await exportAccount(event.data, hiddenRecordIds(savedRecords.values())),
        })
      } else if (event.data.type === 'activitySplits') {
        post({ type: 'splits', id: event.data.id, splits: session.splitsOf(event.data.id) })
      } else if (event.data.type === 'routeShape' || event.data.type === 'forgetRoutes') {
        if (event.data.type === 'forgetRoutes') {
          workbench.clearMemory()
          view.activeScope = null
        }
        post(await routes.reply(event.data))
      } else if (event.data.type === 'activityTrace') {
        const reply = await activityTraceReply(event.data)
        // Reading a trace back from an original stores it, which may push an older one out. The page
        // hears of that before the reply: nothing the worker says after its reply is attributed.
        if (event.data.fromOriginal === true) await reportDetail()
        post({ type: 'activityTrace', reply })
      } else {
        const state = await handle(event.data)
        const { type } = event.data
        if (DETAIL_CHANGING.has(type)) await reportDetail(DETAIL_RESCOPING.has(type))
        post({ type: 'state', state, ...rebuildable() })
      }
    } catch (error) {
      post({
        type: 'error',
        message: messageOf(error),
        ...(error instanceof ApiRequestError ? { issue: syncIssueFor(error) } : {}),
      })
    } finally {
      endRequest()
    }
  })
}
