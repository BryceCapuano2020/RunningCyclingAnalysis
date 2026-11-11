import type { AnalysisSession, ImportFacts, IndexFacts, SessionState } from '@rca/core/session'
import type { AthleteSettings } from '@rca/core/types'
import { libraryVersionNow } from './accountState'
import { NO_CHECKIN } from './checkinKeeper'
import type { WorkerRequest, WorkerResponse } from './protocol'
import type { WorkerView } from './workerView'

/**
 * What an account's scope changes in a reply. The worker builds no state for an account, whose results are the server's
 * (docs/design/server-authority.md): its replies carry a null state, and the facts only the import knows.
 */
export function accountReplies(session: AnalysisSession, view: WorkerView) {
  /** Whether the session holds an account's index. */
  const inAccount = (): boolean => view.accountIndex
  // The library version the last `loadServer` read before its list.
  let listed: number | undefined
  return {
    inAccount,
    /** Reads the library version a `loadServer` lists at, before its list. */
    readListed: async () => {
      listed = await libraryVersionNow()
    },
    /**
     * The reply that ends a request with a state: for an account no state, the facts only the import knows and what the index knows
     * (so the page's copy of them stays current), what a library read adds (no check-in, as the last was of another library, and the
     * version it listed at) and, for an account's import, the library version after its last save, so the page lands its summary on
     * results that include it.
     */
    stateReply: async (
      state: SessionState | null,
      type: WorkerRequest['type'],
      extra: object,
      imported?: { facts?: ImportFacts },
    ): Promise<Extract<WorkerResponse, { type: 'state' }>> => {
      const afterSaves = imported?.facts === undefined ? undefined : await libraryVersionNow()
      return {
        type: 'state',
        state,
        ...(state === null ? { facts: session.importFacts(), index: session.indexFacts() } : {}),
        ...(type === 'loadServer'
          ? { checkIn: NO_CHECKIN, ...(listed === undefined ? {} : { libraryVersion: listed }) }
          : {}),
        ...(afterSaves === undefined ? {} : { libraryVersion: afterSaves }),
        ...extra,
      }
    },
    /** What a rebuild's reply adds when it has no state. */
    factsOf: (state: SessionState | null): { facts?: ImportFacts; index?: IndexFacts } =>
      state === null ? { facts: session.importFacts(), index: session.indexFacts() } : {},
    /** The state of the session with these settings, or null in an account's scope. */
    stateWith: (settings: AthleteSettings): SessionState | null =>
      inAccount() ? null : session.setSettings(settings),
  }
}
