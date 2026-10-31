import type { AnalysisSession } from '@rca/core/session'
import { CheckInKeeper } from './checkinKeeper'
import { accountScope } from './checkinStore'
import type { CheckinScope } from './checkinStore'
import type { WorkerRequest, WorkerResponse } from './protocol'
import type { WorkerView } from './workerView'

/** The requests whose state can change what "since your last import" says, or which library it is about. */
const CHANGING: ReadonlySet<WorkerRequest['type']> = new Set<WorkerRequest['type']>([
  'addFiles',
  'rebuildStale',
  'loadServer',
  'loadDevice',
  'loadSample',
  'keepProvisional',
  'adoptDevice',
  'forgetDeviceLibrary',
  'clear',
  'deleteActivity',
  'deleteDeviceActivity',
  'setSettings',
  'setRange',
])

/** What the last import that kept files added, and where: for a partial one the athlete later accepts. */
export interface LastImport {
  scope: CheckinScope | null
  added: number
}

type CheckInRequest = Extract<WorkerRequest, { type: 'markSeen' | 'acceptPartialImport' }>

/**
 * The worker's side of "since your last import": the baseline of each scope, which library the check-in is about,
 * and what the page is told with a state. The import run settles the baseline itself (importRun.ts).
 */
export function checkInWorker(session: AnalysisSession, view: WorkerView) {
  const keeper = new CheckInKeeper()
  /** The library on screen is now `scope` (null for the sample and for files kept nowhere), read from the store afresh. */
  const switchTo = (scope: CheckinScope | null): void => {
    view.checkinScope = scope
    if (scope !== null) keeper.forget(scope)
  }
  return {
    keeper,
    /** A request that changes which library is on screen says which one the check-in is about. */
    onRequest(request: WorkerRequest): void {
      switch (request.type) {
        case 'loadSample':
          keeper.dropProvisional()
          switchTo(null)
          break
        case 'loadServer':
          keeper.dropProvisional()
          switchTo(accountScope(request.userId))
          break
        case 'loadDevice':
          // A sample on screen stays the library on screen; loading the kept one again changes nothing else.
          if (!view.showingSample) {
            keeper.dropProvisional()
            switchTo('device')
          }
          break
        case 'clear':
          view.checkinScope = null
          keeper.forgetAll()
          break
      }
    },
    /** The files analysed with no scope are kept in this browser: the snapshot taken before them is committed there. */
    async keepProvisional(scope: CheckinScope): Promise<void> {
      switchTo(scope)
      await keeper.adopt(scope)
    },
    /** A rebuild finished: a baseline from before it is of the old model. */
    async afterRebuild(rebuilt: number): Promise<void> {
      if (rebuilt > 0) await keeper.rebuilt(view.checkinScope)
    },
    /** The state message with "since your last import" for the library on screen, when the request can change it and it says something. */
    async attach<T extends Extract<WorkerResponse, { type: 'state' | 'rebuildComplete' }>>(
      message: T,
      requestType: WorkerRequest['type'],
    ): Promise<T> {
      if (!CHANGING.has(requestType)) return message
      const shown = await keeper.view(view.checkinScope, () =>
        session.checkInSnapshot(message.state, Date.now()),
      )
      return shown.checkIn === null && !shown.seen ? message : { ...message, checkIn: shown }
    },
    /** Whether the request is about a row of the check-in, which has its own reply. */
    answers: (request: WorkerRequest): request is CheckInRequest =>
      request.type === 'markSeen' || request.type === 'acceptPartialImport',
    async answer(
      request: CheckInRequest,
      last: LastImport | null,
    ): Promise<Extract<WorkerResponse, { type: 'checkInSaved' }>> {
      if (request.type === 'markSeen') {
        return {
          type: 'checkInSaved',
          seen: await keeper.markSeen(view.checkinScope, request.row, request.event),
        }
      }
      // "Use what I have": taken now, from the snapshot the import began with; the count is the import's, or one after a reload.
      await keeper.settle(view.checkinScope, {
        manifest: 'accepted-partial',
        added: last !== null && last.scope === view.checkinScope ? last.added : 1,
      })
      return { type: 'checkInSaved', seen: false }
    },
  }
}

export type CheckInWorker = ReturnType<typeof checkInWorker>
