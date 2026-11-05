import type { Sport } from '@rca/core/types'
import type { SectionId } from './sportSections'

/** A section's anchor: the id of the element that holds it, the disclosure itself for one that folds. */
export const anchorOf = (sport: Sport, id: SectionId): string => `${sport}-section-${id}`
