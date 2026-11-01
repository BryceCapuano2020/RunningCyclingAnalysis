import { LEVEL_BANDS } from '../grades'

/** The levels as the definition names them: each band's name and where it starts, as a whole percent. */
const LEVELS_TEXT = LEVEL_BANDS.map((band) =>
  band.min === 0
    ? `${band.name} below ${Math.round(LEVEL_BANDS[1]!.min * 100)}%`
    : `${band.name} from ${Math.round(band.min * 100)}%`,
).join(', ')

/**
 * What the terms that carry the answer on Balance mean, in words short enough for a note beside the term.
 * The Method page has the full account; these say what a reader needs to take the figure at its word.
 */
export const DEFINITIONS = {
  ageGrade:
    'Your pace, scored against the standard for your age and sex. 70% means you ran at 70% of the standard pace. A ride is graded through the running pace of equal effort.',
  range90:
    'The span the true value is expected to fall in, nine times out of ten. A wide range means the figure is less certain; a narrow one means it is firm.',
  assumedSpread:
    'The 10th to 90th percentile of an assumed error. The marathon’s error is a published validation figure and the shorter races’ are a judgement, so read it as a spread around the time, not as a promise of where the time will fall.',
  level: `A band of the age grade: ${LEVELS_TEXT}.`,
} as const
