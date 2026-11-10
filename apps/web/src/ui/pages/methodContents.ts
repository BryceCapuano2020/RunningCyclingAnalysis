import { SECTION_ID } from '../components/methodTopics'

export interface ContentsEntry {
  id: string
  label: string
}

/** Each section's name: its heading, its entry in the contents and the name the answer's chips give it. */
export const SECTION_NAME: Record<keyof typeof SECTION_ID, string> = {
  thresholds: 'Thresholds and race times',
  grades: 'Age grades and levels',
  energy: 'The energy view',
  lift: 'Lifting',
  liftGrade: 'Lift age grade',
  heart: 'Heart-rate check',
  accuracy: 'Virtual power meter',
  how: 'How this works',
}

/** The sections on the page, in order. The virtual power meter shows only when there is one. */
export function contentsOf(hasAccuracy: boolean): ContentsEntry[] {
  const keys: (keyof typeof SECTION_ID)[] = [
    'thresholds',
    'grades',
    'energy',
    'lift',
    'liftGrade',
    'heart',
    ...(hasAccuracy ? (['accuracy'] as const) : []),
    'how',
  ]
  return keys.map((key) => ({ id: SECTION_ID[key], label: SECTION_NAME[key] }))
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
