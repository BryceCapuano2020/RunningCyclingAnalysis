import type { MatchFigure } from '@rca/core/standing'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { PACE_UNIT, formatClock, formatWatts, paceSeconds } from '@rca/core/units'
import { SPORT_FORMAT } from './sports'

/**
 * The lower sport's threshold, as what it would need to grade level with the higher sport's whole-percent grade (both graded as
 * an hour), in words. The figures are core's (`SportStanding.match`): this names them in the sport's own unit.
 */
export interface LevelTarget {
  higher: Sport
  lower: Sport
  /** The levelled centre as the sport's own text: "270 W" or "6:50 /mi". */
  centre: string
  /** A ride's range as text, "245 to 295 W"; null for a run, which has one pace. */
  range: string | null
  /** The figure the page shows for the lower sport's threshold. */
  now: string
  /** The target's sentence, as the page words it. */
  sentence: string
}

type Range = Pick<MatchFigure, 'low' | 'centre' | 'high'>

/**
 * The levelled target as the words a sentence uses: a pace, or watts with the range the ride's estimate carries,
 * then what it is the figure of, the sport's threshold: "285 W threshold (240 to 330)".
 */
const SHOWN_TEXT: Record<Sport, (levelled: Range, units: UnitSystem) => string> = {
  run: (levelled, units) =>
    `${formatClock(paceSeconds(levelled.centre, units))} ${PACE_UNIT[units]} threshold`,
  ride: (levelled) => {
    const range =
      levelled.low === levelled.high
        ? ''
        : ` (${formatWatts(levelled.low)} to ${formatWatts(levelled.high)})`
    return `${formatWatts(levelled.centre)} W threshold${range}`
  },
}

/** Where the lower sport would have to match the higher: "on the run", "on the bike". */
const MATCH_ON: Record<Sport, string> = { run: 'on the run', ride: 'on the bike' }

/** A levelled centre as the sport's own figure with its unit: "270 W" or "6:50 /mi". */
const OWN_TEXT: Record<Sport, (centre: number, units: UnitSystem) => string> = {
  run: (centre, units) => `${formatClock(paceSeconds(centre, units))} ${PACE_UNIT[units]}`,
  ride: (centre) => `${formatWatts(centre)} W`,
}

/** A ride's levelled range as its low and high watts. A run has one pace, so it names no range. */
const RANGE_TEXT: Record<Sport, (levelled: Range) => string> = {
  run: () => '',
  ride: (levelled) => `${formatWatts(levelled.low)} to ${formatWatts(levelled.high)} W`,
}

/** The match figure as words, or null when there is none. */
export function levelTarget(match: MatchFigure | null, units: UnitSystem): LevelTarget | null {
  if (match === null) return null
  const { higher, lower } = match
  const nowText = SPORT_FORMAT[lower].formatted(match.now, units)
  const sentence = `To match it ${MATCH_ON[lower]}: ${SHOWN_TEXT[lower](match, units)}. You’re at ${nowText}.`
  return {
    higher,
    lower,
    centre: OWN_TEXT[lower](match.centre, units),
    range: match.low === match.high ? null : RANGE_TEXT[lower](match),
    now: nowText,
    sentence,
  }
}

/** The target's sentence for the page, or null when there is no target. */
export function levelTargetText(match: MatchFigure | null, units: UnitSystem): string | null {
  return levelTarget(match, units)?.sentence ?? null
}
