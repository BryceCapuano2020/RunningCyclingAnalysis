import { rowsAsText } from './components/property'
import type { Property } from './components/property'
import type { MatchFigure } from '@rca/core/standing'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { PACE_UNIT, formatClock, formatWatts, paceSeconds } from '@rca/core/units'
import { SPORT_FORMAT } from './sports'

/**
 * The lower sport's threshold, as what it would need to grade level with the higher sport's whole-percent grade (both graded as
 * an hour), as figures. The figures are core's (`SportStanding.match`): this names them in the sport's own unit.
 */
export interface LevelTarget {
  higher: Sport
  lower: Sport
  /** The levelled centre as the sport's own text: "270 W" or "6:50 /mi". */
  centre: string
  /** A ride's range as its two ends in watts, "245–295"; null for a run, which has one pace. */
  range: string | null
  /** The figure the page shows for the lower sport's threshold. */
  now: string
}

type Range = Pick<MatchFigure, 'low' | 'centre' | 'high'>

/** Where the lower sport would have to match the higher: "on the run", "on the bike". */
const MATCH_ON: Record<Sport, string> = { run: 'on the run', ride: 'on the bike' }

/** A levelled centre as the sport's own figure with its unit: "270 W" or "6:50 /mi". */
const OWN_TEXT: Record<Sport, (centre: number, units: UnitSystem) => string> = {
  run: (centre, units) => `${formatClock(paceSeconds(centre, units))} ${PACE_UNIT[units]}`,
  ride: (centre) => `${formatWatts(centre)} W`,
}

/** A ride's levelled range as its low and high watts, from the match figures. A run has one pace, so it names no range. */
const RANGE_TEXT: Record<Sport, (levelled: Range) => string> = {
  run: () => '',
  ride: (levelled) => `${formatWatts(levelled.low)}\u2013${formatWatts(levelled.high)}`,
}

/** The match figure as words, or null when there is none. */
export function levelTarget(match: MatchFigure | null, units: UnitSystem): LevelTarget | null {
  if (match === null) return null
  const { higher, lower } = match
  const nowText = SPORT_FORMAT[lower].formatted(match.now, units)
  return {
    higher,
    lower,
    centre: OWN_TEXT[lower](match.centre, units),
    range: match.low === match.high ? null : RANGE_TEXT[lower](match),
    now: nowText,
  }
}

/** What the lower sport's threshold is called in a row: "Your ride threshold". */
const NOW_LABEL: Record<Sport, string> = { run: 'Your run threshold', ride: 'Your ride threshold' }

/**
 * The target as a detail panel's rows: what the lower sport would need, with a ride's range, then where it is now.
 */
export function targetRows(target: LevelTarget): Property[] {
  const range = target.range === null ? '' : ` (${target.range})`
  return [
    { label: `To match it ${MATCH_ON[target.lower]}`, value: `${target.centre}${range}` },
    { label: NOW_LABEL[target.lower], value: target.now },
  ]
}

/** The target's rows as one text, or null when there is no target. The owner's eval reads the words a surface prints from this. */
export function levelTargetText(match: MatchFigure | null, units: UnitSystem): string | null {
  const target = levelTarget(match, units)
  return target === null ? null : rowsAsText(targetRows(target))
}
