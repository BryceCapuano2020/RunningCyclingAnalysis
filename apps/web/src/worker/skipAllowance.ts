import type { AnalysisSession } from '@rca/core/session'
import type { Workbench } from './workbench'
import type { TraceScope } from './workbenchStore'

/** The start of a workout, in ms, from its key (`<sport>-<start second>`). */
export const startOfKey = (key: string): number =>
  Number(key.slice(key.lastIndexOf('-') + 1)) * 1000

/**
 * What the worker owes the workouts of a file before the file may be left unread, beyond what the library says (the core
 * checks that every workout is held and none is waiting to be saved):
 *
 *  - an original: when files are kept with the account, a workout whose saved record lacks its original is read again,
 *    so the original is uploaded;
 *  - a detailed recording: a workout in a scope that stores recordings has its recording, or is older than every
 *    recording kept (the store keeps the newest, so reading it again would not bring it back). A scope that stores
 *    none (`traceScope` null) owes none. Storage that cannot say owes them all, so the file is read.
 *
 * The coverage is read once for the import, which is enough: a recording stored later is not in it, and a file read
 * again for it is only a missed skip.
 */
export async function skipAllowance(options: {
  session: AnalysisSession
  workbench: Workbench
  traceScope: TraceScope | null
  /** The workouts whose saved record has no original, or null when originals are not kept. */
  missingOriginals: ReadonlySet<string> | null
}): Promise<(keys: readonly string[]) => Promise<boolean>> {
  const { session, workbench, traceScope, missingOriginals } = options
  const coverage = traceScope === null ? null : await workbench.coverage(traceScope)
  const held = coverage === null ? null : new Set(coverage.ids)
  return async (keys) => {
    if (missingOriginals !== null && keys.some((key) => missingOriginals.has(key))) return false
    if (traceScope === null) return true
    if (held === null || coverage === null) return false
    const ids = session.heldIds(keys)
    return keys.every((key, i) => {
      const id = ids[i]
      if (id !== undefined && held.has(id)) return true
      return coverage.oldestStartMs !== null && startOfKey(key) < coverage.oldestStartMs
    })
  }
}
