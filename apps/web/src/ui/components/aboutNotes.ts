import { formatCount } from '../format/count'
import type { Property } from './property'
import type { SessionState } from '@rca/core/session'
import {
  WALKING_NOTE_PAGES,
  labelledText,
  leftOutRuns,
  walkingPaceText,
} from '../analysis/walkingPaceCopy'
import { hiddenCopiesText } from '../analysis/hiddenCopiesCopy'
import type { Route } from '../route'
import type { AboutNote } from './AboutData'

/** The pages whose one ▸ Details under the title holds the notes about the data, so nothing sits above the title. */
export const NOTES_IN_DETAILS: readonly Route['page'][] = ['balance', 'run', 'ride']

/**
 * The notes about the visitor's data that need no action: copies hidden, and, where runs are listed or analysed, the runs
 * at walking pace and those labelled as walks. Run, when every run is left out, has its own button to count them, so the
 * walking note leaves the offer to open one out there.
 */
export function aboutNotesOf(
  state: Pick<SessionState, 'hiddenDuplicates' | 'walkingPaceRuns' | 'labelledRuns' | 'library'>,
  page: Route['page'],
): AboutNote[] {
  const { hiddenDuplicates: copies, walkingPaceRuns: walking, labelledRuns: labelled = 0 } = state
  const walkingNote = WALKING_NOTE_PAGES.includes(page)
  const left = leftOutRuns(state.library)
  const offerToOpen = !(left.allLeftOut && left.runs[0]?.sport === page)
  return [
    ...(copies > 0 ? [{ id: 'copies', count: copies, text: hiddenCopiesText(copies) }] : []),
    ...(walkingNote && walking > 0
      ? [{ id: 'walking', count: walking, text: walkingPaceText(walking, offerToOpen) }]
      : []),
    ...(walkingNote && labelled > 0
      ? [{ id: 'labelled', count: labelled, text: labelledText(labelled) }]
      : []),
  ]
}

/** What each note's row is called in a page's Details. */
const NOTE_LABEL: Record<string, string> = {
  copies: 'Copies hidden',
  walking: 'At walking pace',
  labelled: 'Hikes and walks',
}

/** A note as a detail panel's row: what it is, and how many, which stay in the activities and out of the analysis. */
export function noteRow(note: AboutNote): Property {
  return {
    label: NOTE_LABEL[note.id] ?? note.id,
    value: note.id === 'copies' ? formatCount(note.count) : `${formatCount(note.count)}, left out`,
  }
}
