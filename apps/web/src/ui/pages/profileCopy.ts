import { SAVE_STATE_TEXT } from '../analysis/copy'
import { plural } from '../components/plural'
import type { SaveState } from '../useSaveStatus'

/** The profile fields that save as soon as they change, each with a status line of its own. */
export type SavedField = 'year' | 'sex' | 'units'

const FIELD_LABEL: Record<SavedField, string> = {
  year: 'Year of birth',
  sex: 'Sex',
  units: 'Units',
}

/** The fields whose saves the one status line reports. */
export const SAVED_FIELDS: SavedField[] = ['year', 'sex', 'units']

/**
 * The one status line's text. A save under way shows first. A refused field then shows until it saves
 * or is edited, so a later success elsewhere does not hide it. Otherwise the last save shows, such as
 * "Sex: Saved.", or '' before any save.
 */
export function statusText(
  lastSaved: SavedField | null,
  saves: Partial<Record<SavedField, SaveState>>,
): string {
  const last = lastSaved === null ? undefined : saves[lastSaved]
  const text = (field: SavedField, state: SaveState) =>
    `${FIELD_LABEL[field]}: ${SAVE_STATE_TEXT[state]}`
  if (lastSaved !== null && last === 'saving') return text(lastSaved, last)
  const refused = SAVED_FIELDS.find((field) => saves[field] === 'failed')
  if (refused !== undefined) return text(refused, 'failed')
  return lastSaved !== null && last !== undefined ? text(lastSaved, last) : ''
}

/**
 * The removal's trigger, its lead line and its question, named by how many activities are kept. With
 * none kept, only the analysis on screen goes, so the trigger says that. The analysis on screen is
 * named only when there is one, since it goes with them.
 */
export function removalCopy(kept: number, onScreen: boolean) {
  const screen = onScreen ? ' and the analysis on screen with them' : ''
  if (kept === 0) {
    return {
      trigger: 'Clear the analysis',
      lead: 'Clears the analysis on screen. No activities or detailed recordings are kept in this browser.',
      title: 'Clear the analysis on this page?',
      description:
        'Only the analysis on screen is cleared. No activities or detailed recordings are kept in this browser.',
      confirmLabel: 'Clear',
    }
  }
  return {
    trigger: 'Remove all my activities',
    lead: onScreen
      ? 'Removes every activity and detailed recording kept in this browser, and the analysis on screen.'
      : 'Removes every activity and detailed recording kept in this browser.',
    title: `Remove all ${plural(kept, 'activity', 'activities')} kept in this browser?`,
    description: `Their summaries and detailed recordings are removed from this browser${screen}. This cannot be undone. Add their files again to bring them back.`,
    confirmLabel: 'Remove all',
  }
}
