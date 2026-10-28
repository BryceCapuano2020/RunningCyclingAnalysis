import { hrefFor } from '../route'
import type { AnalysisController } from '../useAnalysis'
import { plural } from './plural'
import { savedSummary } from './savedSummary'

/** The note on stored activities that could not be read, singular or plural. */
function unreadableNote(count: number): string {
  const one = count === 1
  return `${plural(count, 'saved activity', 'saved activities')} could not be read and ${one ? 'is' : 'are'} hidden. Re-adding ${one ? 'its file' : 'their files'} will restore ${one ? 'it' : 'them'}.`
}

/**
 * The saved activities on the profile page: the signed-in library once it has loaded, or the
 * activities kept in this browser when signed out, which show only when there are some. It counts
 * them and points to Activities, where each can be opened and deleted, rather than listing them again.
 */
export function SavedLibraryCard({
  analysis,
  signedIn,
}: {
  analysis: AnalysisController
  signedIn: boolean
}) {
  const { savedActivities, libraryUnreadable } = analysis
  if (signedIn && analysis.libraryStatus !== 'loaded') return null
  if (!signedIn && savedActivities.length === 0 && libraryUnreadable === 0) return null
  const heading = signedIn ? 'Saved library' : 'Kept in this browser'
  const id = signedIn ? 'saved-library' : 'kept-in-browser'
  return (
    <section className="section" aria-labelledby={id}>
      <h2 id={id}>{heading}</h2>
      {savedActivities.length === 0 ? (
        <p className="muted">No saved activities</p>
      ) : (
        <>
          <p>{savedSummary(savedActivities)}</p>
          {!signedIn && <p className="secondary">Anyone using this browser can see these.</p>}
          <p className="secondary">
            Open an activity from the list to see it, or delete it from its row or its own page.
          </p>
          <div>
            <a className="btn" href={hrefFor({ page: 'activities' })}>
              See them in Activities
            </a>
          </div>
        </>
      )}
      {libraryUnreadable > 0 && <p className="muted">{unreadableNote(libraryUnreadable)}</p>}
    </section>
  )
}
