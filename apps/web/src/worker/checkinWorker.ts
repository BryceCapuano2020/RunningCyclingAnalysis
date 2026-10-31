import type { AnalysisSession, SessionState } from '@rca/core/session'
import { CheckInKeeper } from './checkinKeeper'
import type { CheckInView } from './checkinKeeper'
import type { CheckinScope } from './checkinStore'
import type { WorkerRequest } from './protocol'
import type { WorkerView } from './workerView'

/** The requests whose state can change what "since your last import" says, or which library it is about. */
const CHANGING: ReadonlySet<WorkerRequest['type']> = new Set<WorkerRequest['type']>([
  'loadServer',
  'loadDevice',
  'loadSample',
  'keepProvisional',
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

/**
 * The worker's side of "since your last import": the baseline of each scope, which library the check-in is about,
 * and what the page is told with a state. The import run settles the baseline itself (importRun.ts).
 */
export function checkInWorker(session: AnalysisSession, view: WorkerView) {
  const keeper = new CheckInKeeper()
  return {
    keeper,
    /** Whether a request's state is sent with the check-in. */
    changes: (type: WorkerRequest['type']) => CHANGING.has(type),
    /** The check-in to go with `state`; nothing when it says nothing. */
    async of(state: SessionState): Promise<{ checkIn?: CheckInView }> {
      const shown = await keeper.view(view.checkinScope, () =>
        session.checkInSnapshot(state, Date.now()),
      )
      return shown.checkIn === null && !shown.seen ? {} : { checkIn: shown }
    },
    /** The library on screen is now `scope` (null for the sample and for files kept nowhere), read from the store afresh. */
    use(scope: CheckinScope | null): void {
      view.checkinScope = scope
      if (scope !== null) keeper.forget(scope)
    },
    /** The files analysed with no scope are kept under `scope`: the snapshot taken before them is committed there. */
    async keepProvisional(scope: CheckinScope): Promise<void> {
      this.use(scope)
      await keeper.adopt(scope)
    },
    /** Everything is emptied: nothing is held. */
    clear(): void {
      view.checkinScope = null
      keeper.forgetAll()
    },
    async markSeen(request: Extract<WorkerRequest, { type: 'markSeen' }>): Promise<boolean> {
      return keeper.markSeen(view.checkinScope, request.row, request.event)
    },
    /** "Use what I have": taken now, from the snapshot the import began with; the count is the import's, or one after a reload. */
    async acceptPartial(last: LastImport | null): Promise<void> {
      await keeper.settle(view.checkinScope, {
        manifest: 'accepted-partial',
        added: last !== null && last.scope === view.checkinScope ? last.added : 1,
      })
    },
  }
}

export type CheckInWorker = ReturnType<typeof checkInWorker>
