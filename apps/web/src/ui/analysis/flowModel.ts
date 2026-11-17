import { MODEL_REVISION } from '@rca/core/digest/modelRevision'
import { LIFT_REVISION } from '@rca/core/lift'
import { check, formatTrace, type Action, type Model } from '@rca/core/modelCheck'
import { waitsForFile } from '@rca/core/saveFailure'
import { settlesOnListing } from '@rca/core/sessionIndex'
import {
  ANALYSIS_REVISION,
  STATE_SNAPSHOT_VERSION,
  snapshotIsCurrent,
} from '@rca/core/stateSnapshot'
import { hasRemovedMark, removedHash } from '../activitiesView'
import { hrefFor, parseRoute } from '../route'
import type { Route } from '../route'
import { guardStep, libraryLoadHolds, type GuardMemory } from '../useRouteGuard'
import { readHoldsLibrary } from './libraryActions'
import { keepsLibraryNotice } from './libraryState'
import type { LibraryStatus } from './model'

type Page = 'balance' | 'activities' | 'activity'

interface ChancesLeft {
  navigations: number
  imports: number
  renames: number
  deletes: number
  otherTabChanges: number
}

export interface Tab {
  page: Page
  hash: string
  pageTheNoticeHandlerSaw: Page
  hashEventsUndelivered: number
  deleteNotice: boolean
  deleteAnswered: boolean
  leftLibraryPages: boolean
  status: LibraryStatus
  loadedOnce: boolean
  readsInFlight: number
  rereadWaiting: boolean
  savesToReadBack: boolean
  importing: boolean
  importBeganOn: Page | null
  readOverlappedImport: boolean
  resultsComing: boolean
  hasResult: boolean
  guard: GuardMemory
  originalRefused: boolean
  originalNotice: boolean
  originalOnly: boolean
  serverHoldsFile: boolean
  deviceCopyBuildsBehind: number
  deviceCopyRead: boolean
  shownBuildsBehind: number | null
  left: ChancesLeft
  broken: string | null
}

export interface ClientFaults {
  noticeKeptOnlyByMark?: boolean
  quietReadHoldsLibrary?: boolean
  listingSettlesRefusedOriginal?: boolean
  guardTakesRereadForImport?: boolean
}

const ACTIVITY_ID = 'a'
const routeOf = (page: Page): Route => (page === 'activity' ? { page, id: ACTIVITY_ID } : { page })
const isLibraryPage = (page: Page) => page !== 'balance'
const pageOf = (hash: string): Page => {
  const { page } = parseRoute(hash)
  return page === 'activity' || page === 'activities' ? page : 'balance'
}
const REFUSED_FOR = 'rate-limited'

const currentFor = (buildsBehind: number) =>
  snapshotIsCurrent({
    schemaVersion: STATE_SNAPSHOT_VERSION,
    modelRevision: MODEL_REVISION,
    analysisRevision: ANALYSIS_REVISION - buildsBehind,
    liftRevision: LIFT_REVISION,
  })

export function clientModel(
  left: ChancesLeft,
  faults: ClientFaults = {},
  excuseReadDuringImport = false,
): Model<Tab> {
  const spend = (t: Tab, key: keyof ChancesLeft) => ({ ...t.left, [key]: t.left[key] - 1 })

  // source: ui/analysis/libraryActions.ts loadLibrary
  const loadLibrary = (t: Tab, quiet: boolean): Tab => {
    if (quiet && t.readsInFlight > 0) return { ...t, rereadWaiting: true }
    const holds = faults.quietReadHoldsLibrary === true || readHoldsLibrary(quiet, t.status)
    const reads = quiet ? t.readsInFlight + 1 : 1
    return { ...t, status: holds ? 'loading' : t.status, readsInFlight: reads }
  }

  // source: ui/useRouteGuard.ts useRouteGuard and App.tsx, after every render
  const guarded = (t: Tab): Tab => {
    const reading = t.readsInFlight > 0
    const step = guardStep(t.guard, {
      route: parseRoute(t.hash),
      hasResult: t.hasResult,
      busy: t.importing || reading,
      waiting: false,
      libraryLoading:
        faults.guardTakesRereadForImport === true
          ? t.status === 'loading'
          : libraryLoadHolds(t.status, reading),
    })
    const overlapped = t.readOverlappedImport || (t.importing && reading)
    const moved = { ...t, guard: step.memory, readOverlappedImport: overlapped }
    if (!step.toBalance) return moved
    const excused = excuseReadDuringImport && overlapped
    const wrong = t.importBeganOn !== t.page && !excused ? `sent to Balance from ${t.page}` : null
    return {
      ...navigate(moved, 'balance'),
      importBeganOn: null,
      broken: t.broken ?? wrong,
    }
  }

  const navigate = (t: Tab, page: Page): Tab => ({
    ...t,
    page,
    hash: hrefFor(routeOf(page)),
    hashEventsUndelivered: t.hashEventsUndelivered + 1,
    leftLibraryPages: t.leftLibraryPages || !isLibraryPage(page),
  })

  const system = (name: string, next: (t: Tab) => Tab[]): Action<Tab> => ({
    name,
    next: (t) => next(t).map(guarded),
  })
  const world = (name: string, key: keyof ChancesLeft, next: (t: Tab) => Tab[]): Action<Tab> => ({
    name,
    env: true,
    next: (t) =>
      t.left[key] > 0 ? next(t).map((n) => guarded({ ...n, left: spend(t, key) })) : [],
  })
  const when = (ok: boolean, next: () => Tab): Tab[] => (ok ? [next()] : [])

  const actions: Action<Tab>[] = [
    // source: ui/analysis/accountResults.ts readSnapshot on open
    system('device copy read', (t) =>
      when(!t.deviceCopyRead, () => {
        const shown = currentFor(t.deviceCopyBuildsBehind)
        return {
          ...t,
          deviceCopyRead: true,
          ...(shown ? { shownBuildsBehind: t.deviceCopyBuildsBehind, hasResult: true } : {}),
        }
      }),
    ),
    // source: ui/analysis/replyHandlers.ts loadServer reply, core sessionIndex.ts fillLibrary
    system('library read answers', (t) =>
      when(t.readsInFlight > 0, () => {
        const settles =
          faults.listingSettlesRefusedOriginal === true ||
          settlesOnListing(t.originalOnly, true, t.serverHoldsFile)
        const answered: Tab = {
          ...t,
          readsInFlight: t.readsInFlight - 1,
          status: 'loaded',
          loadedOnce: true,
          originalNotice: t.originalNotice && !settles,
        }
        if (!t.rereadWaiting || answered.readsInFlight > 0) return answered
        return loadLibrary({ ...answered, rereadWaiting: false }, true)
      }),
    ),
    system('saves read back', (t) =>
      when(t.savesToReadBack, () => loadLibrary({ ...t, savesToReadBack: false }, true)),
    ),
    world('another tab changed the library', 'otherTabChanges', (t) => [loadLibrary(t, true)]),
    // source: ui/analysis/libraryActions.ts changeScope
    world('rename', 'renames', (t) => {
      if (t.status === 'loaded') return [{ ...t, deleteNotice: false, deleteAnswered: false }]
      const wrong = t.loadedOnce ? 'a rename refused as still loading' : null
      return [{ ...t, broken: t.broken ?? wrong }]
    }),
    // source: ui/pages/ActivityPage.tsx removedHash after a removal
    world('delete answers', 'deletes', (t) =>
      when(t.page === 'activity' && t.status === 'loaded', () => ({
        ...navigate(t, 'activities'),
        hash: removedHash(),
        deleteNotice: true,
        deleteAnswered: true,
        hasResult: false,
      })),
    ),
    // source: ui/pages/ActivitiesPage.tsx history.replaceState, which fires no hashchange
    system('list drops its marker', (t) =>
      when(t.page === 'activities' && hasRemovedMark(t.hash), () => ({
        ...t,
        hash: hrefFor(routeOf('activities')),
      })),
    ),
    // source: ui/analysis/libraryState.ts the hashchange handler
    system('hashchange delivered', (t) =>
      when(t.hashEventsUndelivered > 0, () => {
        const was = t.pageTheNoticeHandlerSaw
        const keeps =
          faults.noticeKeptOnlyByMark === true
            ? hasRemovedMark(t.hash)
            : keepsLibraryNotice(was, t.hash)
        return {
          ...t,
          hashEventsUndelivered: t.hashEventsUndelivered - 1,
          pageTheNoticeHandlerSaw: pageOf(t.hash),
          deleteNotice: t.deleteNotice && keeps,
        }
      }),
    ),
    ...(['balance', 'activities', 'activity'] as const).map((page) =>
      world(`go to ${page}`, 'navigations', (t) =>
        when(t.page !== page, () => ({ ...navigate(t, page), importBeganOn: null })),
      ),
    ),
    world('import', 'imports', (t) =>
      when(t.status === 'loaded' && !t.importing, () => ({
        ...t,
        importing: true,
        importBeganOn: t.page,
        readOverlappedImport: t.readsInFlight > 0,
      })),
    ),
    // source: core sessionKeep.ts markUnsynced, an original refused while its digest saved
    system('import ends', (t) => {
      if (!t.importing) return []
      const ended = { ...t, importing: false, savesToReadBack: true, resultsComing: true }
      return [
        { ...ended, serverHoldsFile: true },
        {
          ...ended,
          originalRefused: true,
          originalNotice: true,
          originalOnly: waitsForFile(REFUSED_FOR),
        },
      ]
    }),
    system('original sent again', (t) =>
      when(t.originalRefused && !t.serverHoldsFile, () => ({ ...t, serverHoldsFile: true })),
    ),
    system('results arrive', (t) =>
      when(t.resultsComing, () => ({
        ...t,
        resultsComing: false,
        hasResult: true,
        shownBuildsBehind: 0,
      })),
    ),
  ]

  const start = (deviceCopyBuildsBehind: number): Tab => ({
    page: 'activity',
    hash: hrefFor(routeOf('activity')),
    pageTheNoticeHandlerSaw: 'activity',
    hashEventsUndelivered: 0,
    deleteNotice: false,
    deleteAnswered: false,
    leftLibraryPages: false,
    status: 'loading',
    loadedOnce: false,
    readsInFlight: 1,
    rereadWaiting: false,
    savesToReadBack: false,
    importing: false,
    importBeganOn: null,
    readOverlappedImport: false,
    resultsComing: false,
    hasResult: false,
    guard: { coldPage: null, wasImporting: false },
    originalRefused: false,
    originalNotice: false,
    originalOnly: false,
    serverHoldsFile: false,
    deviceCopyBuildsBehind,
    deviceCopyRead: false,
    shownBuildsBehind: null,
    left,
    broken: null,
  })
  return {
    init: [start(0), start(1)],
    actions,
    quiescent: (t) =>
      t.readsInFlight === 0 &&
      !t.rereadWaiting &&
      t.hashEventsUndelivered === 0 &&
      !t.importing &&
      !t.savesToReadBack &&
      !t.resultsComing &&
      t.deviceCopyRead &&
      (!t.originalRefused || t.serverHoldsFile),
    invariants: {
      'the delete notice stays while the visitor is on the library pages': (t) =>
        !t.deleteAnswered || t.leftLibraryPages || t.deleteNotice,
      'a refused original keeps its notice until the server holds the file': (t) =>
        !t.originalRefused || t.serverHoldsFile || t.originalNotice,
      'no rename or redirect goes wrong': (t) => t.broken === null,
      'shown results are this build': (t) =>
        t.shownBuildsBehind === null || t.shownBuildsBehind === 0,
    },
  }
}

const showTab = (t: Tab) =>
  [
    `${t.page} ${t.hash} (${t.hashEventsUndelivered} hashchange)`,
    `library ${t.status}, ${t.readsInFlight} reads${t.rereadWaiting ? ', one waiting' : ''}`,
    `${t.importing ? 'importing' : 'idle'}${t.hasResult ? ', results' : ''}`,
    `notices: delete ${t.deleteNotice}, original ${t.originalNotice}`,
    ...(t.broken === null ? [] : [t.broken]),
  ].join(' | ')

export const NO_CHANCES: ChancesLeft = {
  navigations: 0,
  imports: 0,
  renames: 0,
  deletes: 0,
  otherTabChanges: 0,
}

export function clientVerdict(
  left: Partial<ChancesLeft>,
  faults: ClientFaults = {},
  excuseReadDuringImport = true,
) {
  const verdict = check(clientModel({ ...NO_CHANCES, ...left }, faults, excuseReadDuringImport))
  if (verdict.ok) return { ok: true as const, states: verdict.states }
  return { ok: false as const, broken: verdict.broken, trace: formatTrace(verdict.trace, showTab) }
}
