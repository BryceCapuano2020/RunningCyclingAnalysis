import { ORIGINALS_UNAVAILABLE } from '../analysis/copy'
import { plural } from '../components/plural'
import type { AnalysisController } from '../useAnalysis'

/** What the page says and offers, from the counts. Pure, so each state is tested without a page. */
export function heldLibraryView(counts: {
  stale: number
  newer: number
  rebuildable: number
  unreadable: number
  busy: boolean
  /** Whether originals can be rebuilt from at all; false disables Update now, and the page says why. */
  retention?: boolean
}): { title: string; lines: string[]; update: boolean; addFiles: boolean } {
  const { stale, newer, rebuildable, unreadable, busy, retention = true } = counts
  const needFiles = stale - rebuildable
  if (stale === 0 && newer > 0) {
    return {
      title: 'Your library needs a newer app',
      lines: [
        `${plural(newer, 'saved activity', 'saved activities')} ${newer === 1 ? 'was' : 'were'} made by a newer version of this app.`,
        'Reload the page to update the app.',
      ],
      update: false,
      addFiles: false,
    }
  }
  if (stale === 0) {
    return {
      title: 'Your library is here',
      lines: [
        unreadable > 0
          ? `${plural(unreadable, 'saved activity', 'saved activities')} could not be read. Add the files again to bring ${unreadable === 1 ? 'it' : 'them'} back.`
          : 'This library holds no runs or rides yet. Add your files to see your results.',
      ],
      update: false,
      addFiles: true,
    }
  }
  const lines: string[] = []
  if (busy && rebuildable > 0) {
    lines.push('Updating your library. Your results come back when it finishes.')
  } else if (rebuildable > 0) {
    lines.push(
      'A new version of the analysis is ready. Update your library to see your results.',
      `${plural(rebuildable, 'activity', 'activities')} will be rebuilt from your saved files.`,
    )
    if (!retention) lines.push(ORIGINALS_UNAVAILABLE)
  }
  if (needFiles > 0) {
    lines.push(
      `${plural(needFiles, 'activity', 'activities')} ${needFiles === 1 ? 'needs its file' : 'need their files'} added again. Drop your export or the files; what is already saved is not uploaded again.`,
    )
  }
  if (newer > 0) lines.push('Reload the page to update the app.')
  return {
    title: 'Update your library',
    lines,
    update: rebuildable > 0,
    addFiles: needFiles > 0,
  }
}

/** The view for the library on screen: the counts the session and the account give. */
export function heldViewFor(
  analysis: AnalysisController,
  signedIn: boolean,
  fileRetentionAvailable: boolean,
): ReturnType<typeof heldLibraryView> {
  const { outdatedActivities: stale, incompatibleActivities: newer } = analysis.state
  return heldLibraryView({
    stale,
    newer,
    rebuildable: signedIn ? Math.min(analysis.outdatedWithOriginal, stale) : 0,
    unreadable: analysis.libraryUnreadable,
    busy: analysis.busy,
    retention: fileRetentionAvailable,
  })
}
