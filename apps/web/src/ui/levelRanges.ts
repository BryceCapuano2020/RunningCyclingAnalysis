import { HALF_MARATHON_M } from '@rca/core/constants'
import type { LevelBand } from '@rca/core/grade'
import { NO_TRIANGLE_GRADES, levelLadder } from '@rca/core/standing'
import type { TriangleSport } from '@rca/core/standing'
import {
  PACE_UNIT,
  formatClock,
  formatLoadValue,
  formatRecordTime,
  formatWatts,
  paceSeconds,
} from '@rca/core/units'
import type { UnitSystem } from '@rca/core/units'
import { levelBandText, levelMeaningLine } from './levelMeaning'

/** One level of a sport's table: its name and meaning, the share of the age standard it stands for, and the range of the figure. */
export interface LevelRangeRow {
  label: string
  /** "90% and up", "50% to 59%": the grade band, as Balance's table writes it. */
  band: string
  meaning: string | null
  /** The range of the sport's figure: "1:34:41 to 1:44:12", "245 to 289 W". */
  range: string
  /** A second reading of the same range (a run's pace), or null. */
  pace: string | null
  /** The athlete's own level. */
  mine: boolean
}

/** A band's two ends as the figure writes them: the best still inside it and the worst that earns it. Open ends are null. */
interface Ends {
  best: string | null
  worst: string | null
}

/** How a figure puts a band's ends into words: both ends, the open top (no best) and the open bottom (no worst). */
interface Words {
  both: (ends: { best: string; worst: string }) => string
  top: (worst: string) => string
  bottom: (best: string) => string
}

/** What a sport's table is headed and how its figure is written: values, the words around them, and an optional second reading. */
interface Figure {
  /** The column head: the figure the levels are stated in. */
  head: string
  value: (n: number, units: UnitSystem) => string
  words: (units: UnitSystem) => Words
  pace?: { value: (n: number, units: UnitSystem) => string; words: (units: UnitSystem) => Words }
}

const rangeOf = ({ best, worst }: Ends, words: Words): string => {
  if (best !== null && worst !== null) return words.both({ best, worst })
  if (worst !== null) return words.top(worst)
  return words.bottom(best ?? '')
}

/** A time is better the lower it is, so a run's band reads fastest first. */
const TIME_WORDS: Words = {
  both: ({ best, worst }) => `${best} to ${worst}`,
  top: (worst) => `${worst} or faster`,
  bottom: (best) => `${best} or slower`,
}

/** A pace is read per mile or per kilometre, with its unit after the figure. */
const paceWords = (units: UnitSystem): Words => ({
  both: ({ best, worst }) => `${best} to ${worst} ${PACE_UNIT[units]}`,
  top: (worst) => `${worst} ${PACE_UNIT[units]} or faster`,
  bottom: (best) => `${best} ${PACE_UNIT[units]} or slower`,
})

/** A figure that rises with the level is read from the least that earns the level upward, with its unit once. */
const risingWords =
  (unit: (units: UnitSystem) => string) =>
  (units: UnitSystem): Words => ({
    both: ({ best, worst }) => `${worst} to ${best} ${unit(units)}`,
    top: (worst) => `${worst} ${unit(units)} and up`,
    bottom: (best) => `Up to ${best} ${unit(units)}`,
  })

/** The three tables' figures, keyed by the sport on the triangle. */
const FIGURES: Record<TriangleSport, Figure> = {
  run: {
    head: 'Half marathon',
    value: (seconds) => formatRecordTime(seconds),
    words: () => TIME_WORDS,
    pace: {
      value: (seconds, units) => formatClock(paceSeconds(HALF_MARATHON_M / seconds, units)),
      words: paceWords,
    },
  },
  ride: {
    head: 'Threshold power',
    value: (watts) => formatWatts(watts),
    words: risingWords(() => 'W'),
  },
  lift: {
    head: 'Big three total',
    value: (kg, units) => formatLoadValue(kg, units),
    words: risingWords((units) => (units === 'imperial' ? 'lb' : 'kg')),
  },
}

/** The column head of a sport's table. */
export const levelFigureHead = (sport: TriangleSport): string => FIGURES[sport].head

/**
 * A sport's bands (core's inverse of its grade) as the rows of its Levels table, top level first, with the band and the meaning
 * Balance's table gives each level. `mine` is the level of the athlete's grade, or null when there is none to mark. The figures
 * are core's: this names them.
 */
export function levelRangeRows(
  sport: TriangleSport,
  bands: readonly LevelBand[],
  units: UnitSystem,
  mine: string | null,
): LevelRangeRow[] {
  const figure = FIGURES[sport]
  const ladder = levelLadder(NO_TRIANGLE_GRADES)
  const ends = (band: LevelBand, value: Figure['value']): Ends => ({
    best: band.best === null ? null : value(band.best, units),
    worst: band.worst === null ? null : value(band.worst, units),
  })
  return bands.map((band) => ({
    label: band.label,
    band: levelBandText(
      ladder,
      ladder.findIndex((rung) => rung.label === band.label),
    ),
    meaning: levelMeaningLine(band.label, sport === 'lift') ?? null,
    range: rangeOf(ends(band, figure.value), figure.words(units)),
    pace:
      figure.pace === undefined
        ? null
        : rangeOf(ends(band, figure.pace.value), figure.pace.words(units)),
    mine: band.label === mine,
  }))
}
