/// <reference lib="webworker" />
import type { ActivityRecord } from '@rca/contract'
import { periodChoiceOf } from '@rca/core/period'
import type { SyncItem } from '@rca/core/session'
import type { SessionState } from '@rca/core/session'
import type { Activity } from '@rca/core/types'
import { ApiRequestError } from '../api/client'
import { messageOf } from '../api/messageOf'
import { deviceActions } from './device'
import { adoptDeviceRequest, forgetDeviceLibraryRequest, offerDevice } from './adoptionRequests'
import type { AdoptionRequestContext } from './adoptionRequests'
import { newSession } from './newSession'
import { keepProvisional } from './keepProvisional'
import { FailedOriginals } from './failedOriginals'
import { SendingKeys } from './sendingKeys'
import { startResume } from './startResume'
import type { ResumeParts } from './startResume'
import { ResumeHolder } from './resumeHolder'
import { exportAccount } from './exportAccount'
import { deleteSavedGroup } from './deleteGroup'
import type { DeleteGroupContext } from './deleteGroup'
import { hiddenRecordIds } from './hiddenCopies'
import { reportLibraryActivities } from './libraryReport'
import { openDeviceLibrary } from './deviceLibrary'
import { outdatedWithOriginal } from './outdatedOriginals'
import { labelWorker } from './labelWorker'
import { renameRequest, type RenameContext } from './renameRequest'
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
import { forgetHeldKeys } from './heldIndex'
import { runImport } from './importRun'
import type { ImportRunContext } from './importRun'
import { newWorkerView } from './workerView'
import { accountReplies } from './accountReply'
import { RouteMemory, type RouteMemoryRequest } from './routes'
import { DETAIL_CHANGING, DETAIL_RESCOPING, detailReporter } from './detailCoverage'
import { deviceClock } from './sampleClock'
import { activityTraceReply } from './traceReply'
import { checkInWorker } from './checkinWorker'
import { NO_CHECKIN } from './checkinKeeper'
import { libraryVersionNow } from './accountState'
import { clearLibrary } from './clearLibrary'
import type { ClearContext } from './clearLibrary'
import { syncIssueFor } from './syncIssue'
import { Workbench } from './workbench'

const session = newSession()
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

const reportLibrary = () => reportLibraryActivities(savedRecords, post)

const deviceLibrary = openDeviceLibrary()
const device = deviceActions(
  session,
  deviceLibrary,
  post,
  async (activityId) => workbench.remove({ kind: 'device' }, activityId),
  () => workbench.watchDevice(),
)
const view = newWorkerView()
const { inAccount, factsOf, stateWith } = accountReplies(session, view)
const checkIns = checkInWorker(session, view)
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
  endResume: () => resume.end(),
  restartResume: (userId) => resume.restart(() => startResume(resumeParts, userId)),
}
const routes = new RouteMemory(savedRecords, (id) => device.route(id))
// A request that makes headway (an answer, a chunk of a download) counts as work, so a slow link is not a stall.
observeRequests(noteWork)
const sending = new SendingKeys()
const failedOriginals = new FailedOriginals()
const labels = labelWorker({ session, deviceLibrary, device, savedRecords, view, reportLibrary })
const importContext: ImportRunContext = {
  checkIns: checkIns.keeper,
  lastImport: null,
  sending,
  failedOriginals,
  labelUndo: labels.labelUndo,
  deviceLabels: labels.deviceLabels,
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
const resume = new ResumeHolder()
const resumeParts: ResumeParts = {
  session,
  deviceLibrary,
  savedRecords,
  missingOriginals,
  failedOriginals,
  sending,
  workbench,
}
const adoptionContext: AdoptionRequestContext = {
  session,
  deviceLibrary,
  savedRecords,
  sending,
  workbench,
  view,
  libraryContext,
  post,
  resume: () => resume.get(),
  resumeEnded: () => resume.clear(),
}
const renameContext: RenameContext = {
  session,
  deviceLibrary,
  device,
  savedRecords,
  view,
  reportLibrary,
}

const deleteContext: DeleteGroupContext = {
  session,
  savedRecords,
  unmatchedOriginals,
  missingOriginals,
  failedOriginals,
  routes,
  workbench,
  device,
  post,
  reportLibrary,
}

const clearContext: ClearContext = {
  view,
  labelUndo: labels.labelUndo,
  resume,
  failedOriginals,
  provisionalItems,
  workbench,
  routes,
  device,
  session,
  post,
}

/** The library version the last `loadServer` read before its list. */
let listedVersion: number | undefined

async function handle(
  request: Exclude<WorkerRequest, RouteMemoryRequest>,
): Promise<SessionState | null> {
  checkIns.onRequest(request)
  switch (request.type) {
    case 'addFiles':
      return (await runImport(importContext, request)).state
    case 'keepProvisional':
      return keepProvisional(
        { session, device, workbench, checkIns, post, provisionalItems },
        request.settings,
      )
    case 'loadSample':
      view.libraryEpoch++
      provisionalItems.clear()
      workbench.clearMemory()
      view.activeScope = { kind: 'device' }
      view.accountIndex = false
      view.showingSample = true
      view.sampleClock = deviceClock()
      device.replaced()
      session.choosePeriod(periodChoiceOf(request.choice))
      return session.loadSample(request.settings, view.sampleClock)
    case 'loadServer':
      view.libraryEpoch++
      labels.labelUndo.clear()
      provisionalItems.clear()
      workbench.clearMemory()
      view.activeScope = { kind: 'account', userId: request.userId }
      view.accountIndex = true
      await workbench.reopenScope(view.activeScope)
      view.showingSample = false
      // A resume belongs to the library it began under.
      resume.cancel()
      listedVersion = await libraryVersionNow()
      await loadServer(libraryContext, request.userId)
      resume.start(() => startResume(resumeParts, request.userId))
      void offerDevice(adoptionContext, request.userId)
      return null
    case 'resumeSaves':
      // The connection is back, or the athlete asked: what the outbox holds goes now, without reading the library again.
      if (view.activeScope?.kind === 'account' && view.activeScope.userId === request.userId) {
        await resume.end()
        await resume.start(() => startResume(resumeParts, request.userId, true)).finished
      }
      return stateWith(request.settings)
    case 'undoLabels':
      // Answered with the state and how many labels are left, from onmessage.
      throw new Error('An undo is not a session request')
    case 'adoptDevice':
      return adoptDeviceRequest(adoptionContext, request)
    case 'forgetDeviceLibrary':
      return forgetDeviceLibraryRequest(adoptionContext, request)
    case 'rebuildStale':
      // Answered by rebuildComplete, from onmessage; the scope was set by the library load before it.
      throw new Error('A rebuild is not a session request')
    case 'setSettings':
      return stateWith(request.settings)
    case 'setRange':
      return inAccount()
        ? null
        : session.setRange(periodChoiceOf(request.choice) ?? 'default', request.settings)
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
      view.accountIndex = false
      session.choosePeriod(periodChoiceOf(request.choice))
      return device.load(request.settings)
    case 'clear':
      return clearLibrary(clearContext, request.forgetDevice === true)
    case 'deleteDeviceActivity':
      workbench.clearMemory()
      await forgetHeldKeys('device', [request.id])
      return device.remove(request.id, request.settings)
    case 'renameActivity':
      return renameRequest(renameContext, request)
    case 'exportData':
      // Answered by exportAccount with the export file, not with a session state.
      throw new Error('An export is not a session request')
    case 'activitySplits':
      // Answered with a splits reply, not with a session state.
      throw new Error('A splits request is not a session request')
    case 'activityTrace':
      throw new Error('An activity trace is not a session request')
    case 'markSeen':
    case 'acceptPartialImport':
      // Answered with checkInSaved, not with a session state.
      throw new Error('A check-in request is not a session request')
    case 'deleteActivity': {
      if (view.activeScope?.kind !== 'account' || view.activeScope.userId !== request.userId)
        throw new Error('Reload your library before deleting this activity.')
      const record = savedRecords.get(request.id)
      if (!record) throw new Error('Reload your library before deleting this activity.')
      await deleteSavedGroup(deleteContext, record, request.userId)
      return null
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
  const requestId = (event.data as Partial<WireRequest>).requestId
  noteArrival(event.data.type)
  queue = queue.then(async () => {
    noteStart(event.data.type)
    const endRequest = beginRequest(requestId, (message) => self.postMessage(message))
    try {
      if (event.data.type === 'addFiles') {
        const imported = await runImport(importContext, event.data)
        await reportDetail()
        post(await checkIns.attach({ type: 'state', ...imported, ...rebuildable() }, 'addFiles'))
      } else if (event.data.type === 'rebuildStale') {
        const rebuilt = await rebuildStale(libraryContext, event.data.userId)
        await checkIns.afterRebuild(rebuilt.rebuilt)
        await reportDetail()
        // An account's reply has no state, so there is no check-in to attach here (see checkinWorker.ts).
        post({ type: 'rebuildComplete', ...rebuilt, ...factsOf(rebuilt.state), ...rebuildable() })
      } else if (event.data.type === 'undoLabels') {
        post(await labels.reply(event.data, rebuildable()))
      } else if (checkIns.answers(event.data)) {
        post(await checkIns.answer(event.data, importContext.lastImport))
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
        const reply = await activityTraceReply(importContext, event.data)
        // Reading a trace back from an original stores it, which may push an older one out. The page
        // hears of that before the reply: nothing the worker says after its reply is attributed.
        if (event.data.fromOriginal === true) await reportDetail()
        post({ type: 'activityTrace', reply })
      } else {
        const state = await handle(event.data)
        const { type } = event.data
        if (DETAIL_CHANGING.has(type)) await reportDetail(DETAIL_RESCOPING.has(type))
        // A library read starts from no check-in: the last one was of another library.
        const read =
          type === 'loadServer'
            ? {
                checkIn: NO_CHECKIN,
                ...(listedVersion === undefined ? {} : { libraryVersion: listedVersion }),
              }
            : {}
        post(
          await checkIns.attach(
            { type: 'state', state, ...factsOf(state), ...read, ...rebuildable() },
            type,
          ),
        )
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
