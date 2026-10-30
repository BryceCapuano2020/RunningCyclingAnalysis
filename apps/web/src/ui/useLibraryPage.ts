import { libraryKnowledgeOf } from './analysis/libraryKnowledge'
import type { LibraryKnowledge } from './analysis/libraryKnowledge'
import { holdOf } from './analysis/resultHold'
import type { Hold } from './analysis/resultHold'
import { libraryPageOf } from './libraryPage'
import type { LibraryPage } from './libraryPage'
import type { Route } from './route'
import type { AnalysisController } from './useAnalysis'

/** What the page knows of the library, the hold on its results, and the page that stands in the main area. */
export function useLibraryPage(
  analysis: AnalysisController,
  route: Route,
  signedIn: boolean,
): { knowledge: LibraryKnowledge; hold: Hold | null; page: LibraryPage } {
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
  const hold = holdOf({
    knowledge,
    hasResult,
    stale: state.outdatedActivities,
    newer: state.incompatibleActivities,
  })
  const page = libraryPageOf({
    route,
    hasResult: hasResult && hold?.scope !== 'results',
    knowledge,
    restoring: analysis.restoring,
    failed: signedIn ? analysis.libraryStatus === 'failed' : deviceUnreadable,
  })
  return { knowledge, hold, page }
}
