import * as SECTIONS from './sections'
import type { HistorySection } from './types'

/** Every section in sections.ts, in page order; two with the same order keep the order of their ids. */
export function listedSections(
  sections: Record<string, HistorySection> = SECTIONS,
): HistorySection[] {
  return Object.values(sections).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
}
