import { useMemo } from 'react'
import { partialHold } from './analysis/importIncompleteCopy'
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
  // The one hold for a library known to be only part of what was added (the notice's "Use what I have" lifts it).
  const incomplete = analysis.incompleteImport
  const partial = incomplete === null ? null : partialHold(incomplete)
  const partialText = partial?.text
  const partialAction = partial?.action
  const holdInputs = useMemo<HoldInputs>(
    () => ({
      updating: { knowledge, stale, newer },
      ...(partialText === undefined || partialAction === undefined
        ? {}
        : { partialImport: { text: partialText, action: partialAction } }),
    }),
    [knowledge, stale, newer, partialText, partialAction],
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
