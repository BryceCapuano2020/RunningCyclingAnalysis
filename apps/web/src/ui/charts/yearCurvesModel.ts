import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { SportYearCurves } from '@rca/core/history'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { PACE_UNIT } from '@rca/core/units'
import { effortLabel } from '../records'
import { SPORT_LABEL } from '../sports'
import { formatNative } from './sportAxis'

/** One calendar year's best curve, drawn as a line. */
export interface YearLine {
  year: number
  /** The sport's own number at each of the model's durations (m/s for a run, watts for a ride); null with none. */
  values: (number | null)[]
  /** Whether heart rate shows the year's best 20 minutes was hard. */
  hard: boolean
  /** How recent the year is among the years drawn: 0 for the oldest, 1 for the newest. */
  recency: number
}

export interface YearCurvesModel {
  sport: Sport
  /** The durations the lines have values at, s, shortest first: from the shortest any year has to the longest. */
  durations: number[]
  /** Oldest year first. */
  lines: YearLine[]
  /** The index in `durations` the finding is about: the 20 minute best, else the longest that two years share; null with none. */
  focus: number | null
  /** The year with the highest value at the focus, the earliest where two tie; null without a focus. */
  bestYear: number | null
  /** The newest year with a line. */
  latestYear: number
}

/** How a sport's own number is called in the title's finding. */
const METRIC: Record<Sport, string> = { run: 'pace', ride: 'power' }

/** What the figure is, for a screen reader. */
export const curvesDescription = (sport: Sport): string =>
  `Best ${METRIC[sport]} at each duration, one line for each year. Duration is on a log scale. The newest year and the best year are named, and older years are fainter.`

/** The vertical axis's title. A run's curve is graded for the ground it covered. */
const AXIS_TITLE: Record<Sport, (units: UnitSystem) => string> = {
  run: (units) => `Grade-adjusted pace (${PACE_UNIT[units]}), faster up`,
  ride: () => 'Power (W)',
}

export const curvesAxisTitle = (sport: Sport, units: UnitSystem): string => AXIS_TITLE[sport](units)

/** The index of the duration the finding is about, or null when no length is shared by two years. */
function focusOf(durations: readonly number[], lines: readonly YearLine[]): number | null {
  const shared = (index: number) =>
    lines.filter((line) => line.values[index] !== null && line.values[index] !== undefined)
      .length >= 2
  const headline = durations.indexOf(HEADLINE_DURATION_S)
  if (headline >= 0 && shared(headline)) return headline
  for (let i = durations.length - 1; i >= 0; i--) if (shared(i)) return i
  return null
}

/**
 * A sport's best curve in each calendar year, trimmed to the durations any year has and ready to draw. Null with no year.
 */
export function yearCurvesModel(sport: Sport, curves: SportYearCurves): YearCurvesModel | null {
  const kept = curves.durations
    .map((durationS, i) => ({ durationS, i }))
    .filter(({ i }) =>
      curves.years.some((year) => year.values[i] !== null && year.values[i] !== undefined),
    )
  if (kept.length === 0) return null
  const durations = kept.map(({ durationS }) => durationS)
  const last = curves.years.length - 1
  const lines = curves.years.map((year, n): YearLine => ({
    year: year.year,
    values: kept.map(({ i }) => year.values[i] ?? null),
    hard: year.hard,
    recency: last === 0 ? 1 : n / last,
  }))
  const focus = focusOf(durations, lines)
  let bestYear: number | null = null
  if (focus !== null) {
    let top = -Infinity
    for (const line of lines) {
      const value = line.values[focus]
      if (value !== null && value !== undefined && value > top) {
        top = value
        bestYear = line.year
      }
    }
  }
  return { sport, durations, lines, focus, bestYear, latestYear: lines[last]!.year }
}

/** The chart's title: the finding about the focus duration, else the chart's measure. */
export function curvesTitle(model: YearCurvesModel): string {
  if (model.focus === null || model.bestYear === null) {
    return `${SPORT_LABEL[model.sport]} best curve by year`
  }
  const subject = `Your ${effortLabel(model.durations[model.focus]!)} ${METRIC[model.sport]}`
  return model.bestYear === model.latestYear
    ? `${subject} is highest in ${model.bestYear}`
    : `${subject} peaked in ${model.bestYear}`
}

/** The years that are labelled on the chart: the newest, and the best year when it is another. Oldest first. */
export function labelledYears(model: YearCurvesModel): number[] {
  const years = [model.latestYear]
  if (model.bestYear !== null && model.bestYear !== model.latestYear) years.unshift(model.bestYear)
  return years.sort((a, b) => a - b)
}

/** A value as a table cell: a 20 minute best not confirmed hard says so first. */
export function curveCell(
  model: YearCurvesModel,
  line: YearLine,
  index: number,
  units: UnitSystem,
): string {
  const value = line.values[index]
  if (value === null || value === undefined) return 'None'
  const text = formatNative(model.sport, value, units)
  return model.durations[index] === HEADLINE_DURATION_S && !line.hard ? `At least ${text}` : text
}
