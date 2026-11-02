import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { SportYearCurves } from '@rca/core/history'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { PACE_UNIT } from '@rca/core/units'
import { effortLabel } from '../records'
import { SPORT_LABEL } from '../sports'
import { formatNative } from './sportAxis'
import { drawnCount } from './walkingCut'

/** One calendar year's best curve, drawn as a line. */
export interface YearLine {
  year: number
  /** The sport's own number at each of the model's durations (m/s for a run, watts for a ride); null with none. */
  values: (number | null)[]
  /** Whether heart rate shows the year's best 20 minutes was hard. */
  hard: boolean
  /** For each of the model's durations, whether the value is a bike model's and not a power meter's. */
  estimated: boolean[]
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

/** How the best year's value is called against the others': a pace is fastest, a power is highest. */
const BEST_WORD: Record<Sport, string> = { run: 'fastest', ride: 'highest' }

/** More years than this are too many to tell apart in one colour: the rest are drawn grey. */
export const MANY_YEARS = 6
/** How many years are in colour once there are many: the newest, the best, and the newest of the others. */
const COLOURED_YEARS = 4

/** What the figure is, for a screen reader. */
export const curvesDescription = (sport: Sport): string =>
  `Best ${METRIC[sport]} at each duration, one line for each year. Duration is on a log scale. The newest year and the best year are named, and the other years are fainter or grey.`

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
 * The year with the highest value at an index, the earliest where two tie. An estimate is the best only where no year
 * has a measured value there, so a model's reading never stands above a meter's.
 */
function bestYearAt(lines: readonly YearLine[], index: number): number | null {
  const valued = lines.filter(
    (line) => line.values[index] !== null && line.values[index] !== undefined,
  )
  const measured = valued.filter((line) => !line.estimated[index])
  let best: YearLine | null = null
  for (const line of measured.length > 0 ? measured : valued) {
    if (best === null || line.values[index]! > best.values[index]!) best = line
  }
  return best?.year ?? null
}

/**
 * A sport's best curve in each calendar year, trimmed to the durations any year has and ready to draw. A run's curve stops at
 * its longest duration that is not at walking pace, and a year with none left has no line. Null with no year.
 */
export function yearCurvesModel(sport: Sport, curves: SportYearCurves): YearCurvesModel | null {
  const drawn = curves.years
    .map((year) => ({ year, count: drawnCount(sport, year.values) }))
    .filter(({ count }) => count > 0)
  const kept = curves.durations
    .map((durationS, i) => ({ durationS, i }))
    .filter(({ i }) =>
      drawn.some(
        ({ year, count }) => i < count && year.values[i] !== null && year.values[i] !== undefined,
      ),
    )
  if (kept.length === 0) return null
  const durations = kept.map(({ durationS }) => durationS)
  const last = drawn.length - 1
  const lines = drawn.map(({ year, count }, n): YearLine => ({
    year: year.year,
    values: kept.map(({ i }) => (i < count ? (year.values[i] ?? null) : null)),
    hard: year.hard,
    estimated: kept.map(({ i }) => year.estimated.includes(i)),
    recency: last === 0 ? 1 : n / last,
  }))
  const focus = focusOf(durations, lines)
  return {
    sport,
    durations,
    lines,
    focus,
    bestYear: focus === null ? null : bestYearAt(lines, focus),
    latestYear: lines[last]!.year,
  }
}

/** The chart's title: the finding about the focus duration, else the chart's measure. */
export function curvesTitle(model: YearCurvesModel): string {
  if (model.focus === null || model.bestYear === null) {
    return `${SPORT_LABEL[model.sport]} best curve by year`
  }
  const subject = `Your ${effortLabel(model.durations[model.focus]!)} ${METRIC[model.sport]}`
  return model.bestYear === model.latestYear
    ? `${subject} is ${BEST_WORD[model.sport]} in ${model.bestYear}`
    : `${subject} peaked in ${model.bestYear}`
}

/** The years that are named on the chart, heavier and marked at the 20 minute best: the newest, and the best year when it is another. Oldest first. */
export function namedYears(model: YearCurvesModel): number[] {
  const years = [model.latestYear]
  if (model.bestYear !== null && model.bestYear !== model.latestYear) years.unshift(model.bestYear)
  return years.sort((a, b) => a - b)
}

/** Whether there are too many years to tell apart in one colour. */
export const isCrowded = (model: YearCurvesModel): boolean => model.lines.length > MANY_YEARS

/**
 * The years that carry a label at their end: the named ones, and once the years are crowded the newest others too, up to
 * COLOURED_YEARS in all. The rest are grey and have none. Oldest first.
 */
export function labelledYears(model: YearCurvesModel): number[] {
  const named = namedYears(model)
  if (!isCrowded(model)) return named
  const others = model.lines
    .map((line) => line.year)
    .filter((year) => !named.includes(year))
    .reverse()
    .slice(0, Math.max(0, COLOURED_YEARS - named.length))
  return [...named, ...others].sort((a, b) => a - b)
}

/** A value as a table cell: a 20 minute best that was not all-out says so first, and an estimate says so last. */
export function curveCell(
  model: YearCurvesModel,
  line: YearLine,
  index: number,
  units: UnitSystem,
): string {
  const value = line.values[index]
  if (value === null || value === undefined) return 'None'
  const text = formatNative(model.sport, value, units)
  const floor = model.durations[index] === HEADLINE_DURATION_S && !line.hard
  const cell = floor ? `At least ${text}` : text
  return line.estimated[index] ? `${cell}, estimated` : cell
}
