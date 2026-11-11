import type { AnalysisSession, ImportFacts, SessionState } from '@rca/core/session'
import type { AthleteSettings } from '@rca/core/types'
import type { WorkerView } from './workerView'

/**
 * What an account's scope changes in a reply. The worker builds no state for an account, whose results are the server's
 * (docs/design/server-authority.md): its replies carry a null state, and the facts only the import knows.
 */
export function accountReplies(session: AnalysisSession, view: WorkerView) {
  /** Whether the worker holds an account's library, and is not showing the sample. */
  const inAccount = (): boolean => view.activeScope?.kind === 'account' && !view.showingSample
  return {
    inAccount,
    /** What only the import knows, sent with every reply that carries no state, so the page's copy of it stays current. */
    factsOf: (state: SessionState | null): { facts?: ImportFacts } =>
      state === null ? { facts: session.importFacts() } : {},
    /** The state of the session with these settings, or null in an account's scope. */
    stateWith: (settings: AthleteSettings): SessionState | null =>
      inAccount() ? null : session.setSettings(settings),
  }
}
