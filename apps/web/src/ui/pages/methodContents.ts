import { SECTION_ID } from '../components/methodTopics'

export interface ContentsEntry {
  id: string
  label: string
}

/** Each section's name, as the contents and the answer's chips name it. */
export const SECTION_NAME: Record<keyof typeof SECTION_ID, string> = {
  energy: 'The energy view',
  grades: 'Age grades and levels',
  lift: 'Estimated one-rep max',
  liftGrade: 'Lift age grade',
  heart: 'Heart-rate check',
  accuracy: 'Virtual power meter accuracy',
  how: 'How this works',
}

/** The sections on the page, in order. The accuracy section shows only when there is one. */
export function contentsOf(hasAccuracy: boolean): ContentsEntry[] {
  return [
    { id: SECTION_ID.energy, label: SECTION_NAME.energy },
    { id: SECTION_ID.grades, label: SECTION_NAME.grades },
    { id: SECTION_ID.lift, label: SECTION_NAME.lift },
    { id: SECTION_ID.liftGrade, label: SECTION_NAME.liftGrade },
    { id: SECTION_ID.heart, label: SECTION_NAME.heart },
    ...(hasAccuracy ? [{ id: SECTION_ID.accuracy, label: SECTION_NAME.accuracy }] : []),
    { id: SECTION_ID.how, label: SECTION_NAME.how },
  ]
}

/**
 * Moves focus to a section's heading and scrolls it to the top, under the sticky header (the page's scroll padding).
 * A fragment link would change the hash route, so the contents use buttons that call this instead. A plain focus
 * scrolls only as far as the browser likes, which in Chrome puts the heading mid-screen, so focus does not scroll here.
 */
export function focusSection(id: string) {
  const heading = document.getElementById(id)
  if (heading === null) return
  heading.focus({ preventScroll: true })
  heading.scrollIntoView?.({ block: 'start' })
}
