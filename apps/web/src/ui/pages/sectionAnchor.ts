import type { Sport } from '@rca/core/types'
import type { SectionId } from './sportSections'

/** A section's anchor: where the "On this page" row scrolls to, and a closed section opens. */
export const anchorOf = (sport: Sport, id: SectionId): string => `${sport}-section-${id}`
