import { SavedLibrary } from './SavedLibrary'
import type { SavedScope } from './SavedLibrary'
import type { AnalysisController } from '../useAnalysis'

/**
 * The saved activities on the profile page: the signed-in library once it has loaded, or the
 * activities kept in this browser when signed out, which show only when there are some.
 */
export function SavedLibraryCard({
  analysis,
  signedIn,
}: {
  analysis: AnalysisController
  signedIn: boolean
}) {
  const list = (scope: SavedScope) => (
    <SavedLibrary
      scope={scope}
      activities={analysis.savedActivities}
      busy={analysis.busy || analysis.libraryAction !== null}
      onDelete={analysis.deleteActivity}
      status={analysis.libraryNotice}
      error={analysis.libraryError}
      unreadable={analysis.libraryUnreadable}
    />
  )

  if (signedIn) {
    if (analysis.libraryStatus !== 'loaded') return null
    return (
      <section className="section" aria-labelledby="saved-library">
        <h2 id="saved-library">Saved library</h2>
        {list('account')}
      </section>
    )
  }
  // Kept mounted while a delete's outcome is shown, so deleting the last one is still announced.
  const outcome = analysis.libraryNotice !== null || analysis.libraryError !== null
  if (analysis.savedActivities.length === 0 && !outcome) return null
  return (
    <section className="section" aria-labelledby="kept-in-browser">
      <h2 id="kept-in-browser">Kept in this browser</h2>
      <p className="secondary">
        Anyone using this browser can see these. Start over removes them all.
      </p>
      {list('device')}
    </section>
  )
}
