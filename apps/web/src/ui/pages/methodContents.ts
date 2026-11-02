import { SECTION_ID } from '../components/methodTopics'

export interface ContentsEntry {
  id: string
  label: string
}

/** Each section's name, as the contents and the answer's chips name it. */
export const SECTION_NAME: Record<keyof typeof SECTION_ID, string> = {
  energy: 'The energy view',
  grades: 'Age grades and levels',
  heart: 'Heart-rate check',
  accuracy: 'Virtual power meter accuracy',
  calculated: 'What is calculated',
  how: 'How this works and what it assumes',
}

/** The sections on the page, in order. The accuracy section shows only when there is one. */
export function contentsOf(hasAccuracy: boolean): ContentsEntry[] {
  return [
    { id: SECTION_ID.energy, label: SECTION_NAME.energy },
    { id: SECTION_ID.grades, label: SECTION_NAME.grades },
    { id: SECTION_ID.heart, label: SECTION_NAME.heart },
    ...(hasAccuracy ? [{ id: SECTION_ID.accuracy, label: SECTION_NAME.accuracy }] : []),
    { id: SECTION_ID.calculated, label: SECTION_NAME.calculated },
    { id: SECTION_ID.how, label: SECTION_NAME.how },
  ]
}

/**
 * Moves focus to a section's heading. A fragment link would change the hash route, so the contents
 * use buttons that focus the heading instead.
 */
export function focusSection(id: string) {
  document.getElementById(id)?.focus()
}
