import { useMemo } from 'react'
import { libraryKnowledgeOf } from './analysis/libraryKnowledge'
import type { LibraryKnowledge } from './analysis/libraryKnowledge'
import { holdOf } from './resultHold'
import type { Hold, HoldInputs } from './resultHold'
import { libraryPageOf } from './libraryPage'
import type { LibraryPage } from './libraryPage'
import type { Route } from './route'
import type { AnalysisController } from './useAnalysis'

/**
 * What the page knows of the library, the hold on its results, the inputs every surface reads that hold under,
 * and the page that stands in the main area.
 */
export function useLibraryPage(
  analysis: AnalysisController,
  route: Route,
  signedIn: boolean,
): { knowledge: LibraryKnowledge; hold: Hold | null; holdInputs: HoldInputs; page: LibraryPage } {
  const { state } = analysis
  const hasResult = state.result !== null
  const deviceUnreadable = analysis.deviceIssue?.issue === 'notRead'
  const knowledge = libraryKnowledgeOf({
    hasResult,
    signedIn,
    libraryStatus: analysis.libraryStatus,
    restoring: analysis.restoring,
    saved: analysis.savedActivities.length,
    held: state.libraryActivities,
    unreadable: analysis.libraryUnreadable,
    deviceUnreadable,
  })
  const stale = state.outdatedActivities
  const newer = state.incompatibleActivities
  const holdInputs = useMemo<HoldInputs>(
    () => ({ updating: { knowledge, stale, newer } }),
    [knowledge, stale, newer],
  )
  const hold = holdOf(state.result, holdInputs)
  const page = libraryPageOf({
    route,
    hasResult: hasResult && hold?.scope !== 'results',
    knowledge,
    restoring: analysis.restoring,
    failed: signedIn ? analysis.libraryStatus === 'failed' : deviceUnreadable,
  })
  return { knowledge, hold, holdInputs, page }
}
