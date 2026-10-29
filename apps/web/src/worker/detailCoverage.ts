import type { WorkerResponse } from './protocol'
import type { Workbench } from './workbench'
import { scopeKey } from './workbenchSchema'
import type { TraceScope } from './workbenchStore'

const UNKNOWN = 'unknown'

/** The requests after which what is stored can have changed, so the page is told again. */
export const DETAIL_CHANGING: ReadonlySet<string> = new Set([
  'addFiles',
  'deleteActivity',
  'clear',
  'loadServer',
  'loadDevice',
  'deleteDeviceActivity',
  'keepProvisional',
  'rebuildStale',
  // A sample has none stored, so it only makes the reporter forget what it last said.
  'loadSample',
])

/** The requests that change the scope the page is looking at, so what it holds from before no longer stands. */
export const DETAIL_RESCOPING: ReadonlySet<string> = new Set(['loadServer', 'loadDevice', 'clear'])

/**
 * Tells the page which activities this browser holds detailed readings for, and since when. A sample has
 * none stored, so it reports nothing. Storage that cannot answer is reported as unknown (null ids), so the
 * page does not keep an answer from before. The same answer is not sent twice, unless `again` says the
 * page dropped what it had.
 */
export function detailReporter(
  workbench: Workbench,
  post: (message: WorkerResponse) => void,
  /** The scope the page is looking at, or null for a sample, which has nothing stored. */
  scope: () => TraceScope | null,
) {
  // What the page was last told: nothing, or 'unknown', until real coverage has been sent.
  let last = UNKNOWN as string
  return async (again = false): Promise<void> => {
    const current = scope()
    if (current === null) {
      last = UNKNOWN
      return
    }
    const coverage = await workbench.coverage(current)
    if (coverage === null) {
      // Storage cannot say. A page that holds an answer from before is told to drop it; one that holds none
      // already reads unknown, and is not sent a message for that.
      if (last !== UNKNOWN) post({ type: 'detailCoverage', ids: null, oldestStartMs: null })
      last = UNKNOWN
      return
    }
    const signature = JSON.stringify([
      scopeKey(current),
      [...coverage.ids].sort(),
      coverage.oldestStartMs,
    ])
    if (!again && signature === last) return
    last = signature
    post({ type: 'detailCoverage', ids: coverage.ids, oldestStartMs: coverage.oldestStartMs })
  }
}
