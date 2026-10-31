import type { ActivityRecord } from '@rca/contract'
import type { AnalysisSession, SessionState, SyncIssueCode, SyncItem } from '@rca/core/session'
import { accountSaver } from './accountSave'
import { workoutKeyOf as activityKey } from './device'
import type { DeviceActions } from './device'
import { accountScope } from './checkinStore'
import type { CheckinScope } from './checkinStore'
import { deviceKeeper } from './deviceKeeper'
import { shownCount } from './hiddenCopies'
import { openOutbox } from './outbox'
import type { SendingKeys } from './sendingKeys'
import { openHeldIndex } from './heldIndex'
import type { HeldIndexHandle } from './heldIndex'
import { ImportReporter } from './importReporter'
import type { ImportOutcome, WorkerRequest, WorkerResponse } from './protocol'
import type { RouteMemory } from './routes'
import { summarizeAdded } from './importSummary'
import { skipAllowance } from './skipAllowance'
import type { Workbench } from './workbench'
import type { TraceScope } from './workbenchStore'
import type { WorkerView } from './workerView'
import { applyListLabels, reloadSession } from './applyListLabels'
import { ATHLETE_LABELS_ENABLED } from './labelsConfig'
import { noteWork } from './workerWire'

/** What an import reads and changes in the worker. */
export interface ImportRunContext {
  /** The workouts being sent to the account, shared with the outbox resume. */
  sending: SendingKeys
  session: AnalysisSession
  post: (message: WorkerResponse) => void
  missingOriginals: Set<string>
  savedRecords: Map<string, ActivityRecord>
  workbench: Workbench
  /** The activities provisional imports analysed, by workout, with no file bytes. See keepProvisional. */
  provisionalItems: Map<string, SyncItem>
  device: DeviceActions
  routes: RouteMemory
  view: WorkerView
  /** Posts the account's saved activities, newest first. */
  reportLibrary: () => void
}

/** Runs one import: each new activity is saved, and its file uploaded when files are kept. */
export async function runImport(
  ctx: ImportRunContext,
  request: Extract<WorkerRequest, { type: 'addFiles' }>,
): Promise<{ state: SessionState; outcome?: ImportOutcome; saved?: number }> {
  const { session, post, missingOriginals, savedRecords, workbench, provisionalItems } = ctx
  const { device, routes, view, reportLibrary } = ctx
  const { sync } = request
  if (view.showingSample) workbench.clearMemory()
  // Recordings are kept where the activities are: with the account, or in this browser when the
  // visitor keeps their files here. Files analysed for one session only, as for a signed-in visitor
  // whose account is not known yet, leave their recordings in memory.
  const traceScope: TraceScope | null =
    sync !== null
      ? { kind: 'account', userId: sync.userId }
      : request.saveToDevice === true
        ? { kind: 'device' }
        : null
  view.activeScope = traceScope ?? { kind: 'device' }
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
  const fileCount = await session.countFiles(request.files)
  const reporter = new ImportReporter(post, fileCount, sync !== null)
  reporter.begin()
  // Files already read here are not read again: the index belongs to the library an import adds to, and a session
  // whose files are not kept anywhere (a provisional import, analysis alone) has none.
  const heldScope: CheckinScope | null =
    sync !== null
      ? accountScope(sync.userId)
      : request.saveToDevice === true && !request.provisional
        ? 'device'
        : null
  const heldIndex: HeldIndexHandle | null =
    heldScope === null
      ? null
      : await openHeldIndex({
          scope: heldScope,
          fileCount,
          allows: await skipAllowance({
            session,
            workbench,
            traceScope,
            missingOriginals: sync?.keepFiles === true ? missingOriginals : null,
          }),
        })
  const save =
    sync === null
      ? undefined
      : accountSaver({
          sync,
          savedRecords,
          missingOriginals,
          routes,
          onSaved: () => {
            noteWork()
            reporter.activitySaved()
          },
          onPaused: () => reporter.savesPaused(),
          outbox: openOutbox(sync.userId),
          sending: ctx.sending,
          hiddenIds: () => session.hiddenIds(),
          onStopped: (code) => {
            stoppedBy ??= code
          },
        })

  // Files saved here join the library kept in this browser, unless the session already holds it. When that
  // library cannot be read the files are analysed on their own and the page is told: nothing is lost, and
  // nothing kept is written over, since each save first reads what is kept under its workout (a strict read).
  if (sync === null && request.saveToDevice && !device.inSession()) {
    await device.load(request.settings).catch(() => post({ type: 'deviceIssue', issue: 'notRead' }))
  }
  view.showingSample = false
  const keeper = deviceKeeper(device, post)
  // While the account is unknown, the activities are held for the device without their files, to be
  // kept as they are if nobody turns out to be signed in.
  const holdForDevice = async (item: SyncItem) => {
    provisionalItems.set(activityKey(item.digest), { ...item, bytes: new Uint8Array() })
  }
  let state: SessionState
  // The type the export's list gave each file, which labels the workouts the account already holds.
  let listedTypes: ReadonlyMap<string, string> | undefined
  let emptied = false
  try {
    state = await session.addFiles(
      request.files,
      request.settings,
      (count) => {
        noteWork()
        reporter.filesReadSoFar(count)
      },
      save ??
        (request.provisional ? holdForDevice : request.saveToDevice ? keeper.keep : undefined),
      sync?.keepFiles === true,
      ({ added, upgraded, listedTypes: types, ...completed }) => {
        listedTypes = types
        for (const digest of [...added, ...upgraded]) addedIds.add(digest.id)
        // Counts only: the digests stay in the worker.
        const updated = summarizeAdded(upgraded)
        outcome = {
          ...completed,
          ...summarizeAdded(added),
          ...(upgraded.length === 0
            ? {}
            : { updatedRuns: updated.runs ?? 0, updatedRides: updated.rides ?? 0 }),
        }
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
      heldIndex?.files,
    )
  } finally {
    // First, so a failure below cannot skip it: the page does not keep the count from before.
    if (sync !== null)
      post({ type: 'missingOriginals', count: shownCount(missingOriginals, savedRecords.values()) })
    // On a failure too: what was read is stored, and the page learns how many were saved.
    // A provisional import's recordings wait for keepProvisional, or for the account.
    // Not when the kept library was emptied meanwhile: the recordings would outlive their activities.
    const intoDevice = sync === null && request.saveToDevice === true
    emptied =
      intoDevice && (keeper.replaced || workbench.libraryReplaced || !(await device.current()))
    if (emptied) workbench.dropDeferred()
    const stored = traceScope === null ? new Set<string>() : await workbench.storeDeferred()
    // Storage refuses a recording of a cleared scope in its own transaction: the clear can land after the check above.
    if (intoDevice && workbench.libraryReplaced) emptied = true
    // Counted once it is in storage: a recording held in memory alone is gone after a reload.
    for (const id of restoreCandidates) if (stored.has(id)) restored.add(id)
    reporter.end()
    // What was read is learned even when the import failed part way; a refused write only costs a parse next time.
    await heldIndex?.flush()
  }
  if (emptied) {
    // The results this import added are gone from the library kept in this browser, so they are not shown:
    // the page is told, and starts from what is kept now.
    post({ type: 'deviceIssue', issue: 'replaced' })
    device.replaced()
    workbench.clearMemory()
    return { state: session.clear() }
  }
  const detailRestored = [...restored].filter((id) => !addedIds.has(id)).length
  if (detailRestored > 0) outcome = { ...outcome, detailRestored }
  if (sync !== null && ATHLETE_LABELS_ENABLED && listedTypes !== undefined) {
    const labelled = await applyListLabels(savedRecords, listedTypes, sync.userId, (fresh) => {
      savedRecords.clear()
      for (const record of fresh) savedRecords.set(record.id, record)
    })
    if (labelled.length > 0) {
      state = reloadSession(session, request.settings, [...savedRecords.values()])
      outcome = { ...outcome, labelled: labelled.length }
    }
  }
  if (sync !== null) {
    reportLibrary()
  } else if (request.saveToDevice) {
    await device.report()
    keeper.report()
  }
  if (stoppedBy !== null) post({ type: 'accountIssue', issue: stoppedBy })
  return { state, outcome, ...(sync ? { saved: reporter.savedCount } : {}) }
}
