import type { AnalysisSession, ImportFacts, IndexFacts, SessionState } from '@rca/core/session'
import type { AthleteSettings } from '@rca/core/types'
import { NO_CHECKIN } from './checkinKeeper'
import type { WorkerRequest } from './protocol'
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
    noteListed: (version: number | undefined) => {
      listed = version
    },
    /** What a library read adds to its reply: no check-in (the last was of another library) and the version it listed at. */
    loadReply: (type: WorkerRequest['type']) =>
      type === 'loadServer'
        ? { checkIn: NO_CHECKIN, ...(listed === undefined ? {} : { libraryVersion: listed }) }
        : {},
    /** What only the import knows, sent with every reply that carries no state, so the page's copy of it stays current. */
    factsOf: (state: SessionState | null): { facts?: ImportFacts; index?: IndexFacts } =>
      state === null ? { facts: session.importFacts(), index: session.indexFacts() } : {},
    /** The state of the session with these settings, or null in an account's scope. */
    stateWith: (settings: AthleteSettings): SessionState | null =>
      inAccount() ? null : session.setSettings(settings),
  }
}
