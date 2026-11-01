import { formatGrade, wholeGrade } from '../gradeFormat'
import { TOP_OF_SCALE_SHORT, gradeLevelText } from '../grades'
import type { SportGrade } from '../grades'
import { SPORT_LABEL, SPORT_ORDER } from '../sports'
import type { Sport } from '@rca/core/types'
import { drawnIn, isHollow } from './balanceYears'
import type { YearGrade, YearView } from './balanceYears'
import type { ChartLegendEntry } from './ChartLegend'
import type { ChartTableData, TooltipContent, TooltipRow } from './chartTypes'

const NONE = 'None'
const NOT_ALL_OUT = 'not all out'

/** What the chart says to a screen reader: the scale, what the band is and what a hollow dot is. */
export const DESCRIPTION =
  'Age grade of the best 20 minutes in each calendar year, run and ride on one scale from 0 to 100. A ride is estimated and has a band for its range. A hollow dot is a best that was not all out.'

/** A ride's range as "58 to 66%". */
export function rangeText(range: NonNullable<SportGrade['range']>): string {
  return `${wholeGrade(range.low.grade)} to ${formatGrade(range.high.grade)}`
}

/** A sport's name; a ride is estimated through its running equivalent. */
const nameOf = (sport: Sport, ranged: boolean): string =>
  ranged ? `${SPORT_LABEL[sport]}, estimated` : SPORT_LABEL[sport]

const rangedIn = (views: readonly YearView[], sport: Sport): boolean =>
  views.some((view) => view.grades[sport]?.grade.range != null)

const rangeLabel = (sport: Sport): string => `${SPORT_LABEL[sport]} range`

/** The key: each drawn sport as a line, the ride's band, and a hollow dot when a year has one. */
export function legendOf(views: readonly YearView[]): ChartLegendEntry[] {
  const sports = drawnIn(views)
  const entries: ChartLegendEntry[] = sports.map((sport) => ({
    label: nameOf(sport, rangedIn(views, sport)),
    kind: sport,
    // One sport needs no key of its own: the title names it.
    swatch: sports.length > 1 ? 'line' : 'dot',
  }))
  for (const sport of sports.filter((each) => rangedIn(views, each))) {
    entries.push({ label: rangeLabel(sport), kind: sport, swatch: 'band' })
  }
  const anyHollow = views.some((view) => Object.values(view.grades).some(isHollow))
  if (anyHollow) entries.push({ label: 'Best not all out', kind: 'neutral', swatch: 'ring' })
  return entries
}

/** A grade as the table writes it: the whole percent, a ride's range in brackets, and a best that was not all out. */
function cellOf(each: YearGrade | undefined, atTop: boolean): string {
  if (each === undefined) return atTop ? TOP_OF_SCALE_SHORT : NONE
  const { centre, range } = each.grade
  const parts = [formatGrade(centre.grade)]
  if (range !== null) parts.push(`(${rangeText(range)})`)
  return isHollow(each) ? `${parts.join(' ')}, ${NOT_ALL_OUT}` : parts.join(' ')
}

const LEADER_TEXT = { run: SPORT_LABEL.run, ride: SPORT_LABEL.ride, even: 'Level' } as const

/** The leader by year, as a table twin: one row for each calendar year. */
export function tableOf(views: readonly YearView[]): ChartTableData {
  const sports = drawnIn(views)
  const both = sports.length === SPORT_ORDER.length
  return {
    caption: 'Age grade of the best 20 minutes in each calendar year',
    columns: [
      'Year',
      ...sports.map((sport) => nameOf(sport, rangedIn(views, sport))),
      ...(both ? ['Leader'] : []),
    ],
    rows: views.map((view) => [
      String(view.year),
      ...sports.map((sport) => cellOf(view.grades[sport], view.atTop.includes(sport))),
      ...(both ? [view.leader === null ? NONE : LEADER_TEXT[view.leader]] : []),
    ]),
    textColumns: [0],
  }
}

/** A year's tooltip: each drawn sport's grade and level, then a ride's range. */
export function tooltipFor(
  views: readonly YearView[],
  i: number,
  x: number,
  y: number,
): TooltipContent | null {
  const view = views[i]
  if (view === undefined) return null
  const rows: TooltipRow[] = drawnIn(views).flatMap((sport): TooltipRow[] => {
    const each = view.grades[sport]
    const label = nameOf(sport, rangedIn(views, sport))
    if (each === undefined) return [{ kind: sport, label, value: NONE }]
    const level = gradeLevelText(each.grade)
    const row: TooltipRow = {
      kind: sport,
      label,
      value: formatGrade(each.grade.centre.grade),
      note: isHollow(each) ? `${level}, ${NOT_ALL_OUT}` : level,
    }
    return each.grade.range === null
      ? [row]
      : [row, { kind: sport, label: rangeLabel(sport), value: rangeText(each.grade.range) }]
  })
  return { x, y, title: String(view.year), rows }
}

/** What a phone's readout says at rest: the latest year with a grade. */
export function idleOf(views: readonly YearView[]): string | undefined {
  const latest = views.findLast((view) => Object.keys(view.grades).length > 0)
  if (latest === undefined) return undefined
  const grades = drawnIn(views).flatMap((sport) => {
    const each = latest.grades[sport]
    return each === undefined
      ? []
      : [`${formatGrade(each.grade.centre.grade)} ${SPORT_LABEL[sport].toLowerCase()}`]
  })
  return `Latest: ${grades.join(', ')}, ${latest.year}`
}
