import { SavedLibrary } from '../components'
import type { AnalysisController } from '../useAnalysis'

/** The saved library card, shown once the signed-in library has loaded. */
export function SavedLibraryCard({
  analysis,
  signedIn,
}: {
  analysis: AnalysisController
  signedIn: boolean
}) {
  if (!signedIn || analysis.libraryStatus !== 'loaded') return null
  return (
    <section className="card" aria-label="Saved library">
      <h2>Saved library</h2>
      <SavedLibrary
        activities={analysis.savedActivities}
        busy={analysis.busy || analysis.libraryAction !== null}
        onDelete={analysis.deleteActivity}
        status={analysis.libraryNotice}
        error={analysis.libraryError}
        unreadable={analysis.libraryUnreadable}
      />
    </section>
  )
}
