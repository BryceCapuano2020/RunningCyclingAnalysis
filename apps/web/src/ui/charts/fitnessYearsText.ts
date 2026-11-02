import { WEEK_ORIGIN_MS } from '@rca/core/calendar'
import { DAY_MS } from '@rca/core/constants'
import type { DotsSpan, DotsYear, FitnessDots } from '@rca/core/history'
import { monthYear, monthsBetween } from '@rca/core/lookback'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { FITNESS_WORDS } from '../fitnessWords'
import { formatCount } from '../format/count'
import { SPORT_FORMAT } from '../sports'
import type { ChartTableData, TooltipContent, TooltipRow } from './chartTypes'
import { outputOf } from './fitnessYearsLayout'
import { plottedValue } from './sportAxis'

const NONE = 'None'

/** The vertical axis's title, as every sport page's chart writes it: GAP says which way is faster, power is in watts. */
export const axisTitleOf = (sport: Sport, units: UnitSystem): string =>
  SPORT_FORMAT[sport].axisTitle(units)

const upper = (text: string): string => `${text[0]!.toUpperCase()}${text.slice(1)}`

const msOfDay = (day: number): number => WEEK_ORIGIN_MS + day * DAY_MS

/** The sport's number for a count of steps, as text with its unit. */
const output = (dots: FitnessDots, sport: Sport, units: UnitSystem, steps: number): string =>
  SPORT_FORMAT[sport].formatted(outputOf(dots, steps), units)

/** Two ends of a range as "4:58 to 5:31 /km": the smaller number first, the unit once. */
function rangeText(
  dots: FitnessDots,
  sport: Sport,
  units: UnitSystem,
  low: number,
  high: number,
): string {
  const [a, b] = [low, high]
    .map((steps) => ({
      plotted: plottedValue(sport, outputOf(dots, steps), units),
      text: output(dots, sport, units, steps),
    }))
    .sort((p, q) => p.plotted - q.plotted)
  const [first] = a!.text.split(' ')
  return a!.text === b!.text ? a!.text : `${first} to ${b!.text}`
}

/** The heart rate the dots are read at, as a phrase: "140 bpm", or "one heart rate" when the card names none. */
export const atText = (dots: FitnessDots): string =>
  dots.referenceHr === null ? 'one heart rate' : `${dots.referenceHr} bpm`

/** A slip or a rise as a period: "March to October 2022", or "From March 2022" while it lasts. */
function periodText(span: DotsSpan): string {
  return span.toDay === null
    ? `From ${monthYear(msOfDay(span.fromDay))}`
    : monthsBetween(msOfDay(span.fromDay), msOfDay(span.toDay))
}

const WORD: Record<DotsSpan['kind'], string> = { slip: 'Slip', rise: 'Rise' }

/** The slips and rises that touch a calendar year. */
function spansIn(dots: FitnessDots, year: number): DotsSpan[] {
  const from = (Date.UTC(year, 0, 1) - WEEK_ORIGIN_MS) / DAY_MS
  const to = (Date.UTC(year + 1, 0, 1) - WEEK_ORIGIN_MS) / DAY_MS
  const horizon = dots.horizonDay ?? to
  return dots.spans.filter((s) => s.fromDay < to && (s.toDay ?? horizon) > from)
}

/** A year's tooltip: the middle of its steady activities and their middle 80%, how many there were, and any slip or rise in it. */
export function yearTooltip(
  dots: FitnessDots,
  sport: Sport,
  units: UnitSystem,
  i: number,
  x: number,
  y: number,
): TooltipContent | null {
  const year = dots.years[i]
  if (year === undefined) return null
  const words = FITNESS_WORDS[sport]
  const rows: TooltipRow[] =
    year.n === 0
      ? [{ label: upper(words.steadyPlural), value: NONE }]
      : [
          {
            kind: sport,
            label: words.output,
            value: output(dots, sport, units, year.median),
            note: `Middle 80%: ${rangeText(dots, sport, units, year.low, year.high)}`,
          },
          { label: upper(words.steadyPlural), value: formatCount(year.n) },
        ]
  for (const span of spansIn(dots, year.year)) {
    rows.push({ kind: 'neutral', label: WORD[span.kind], value: periodText(span) })
  }
  return { x, y, title: String(year.year), rows }
}

/** The table twin of the dots: each year's middle, its middle 80% and its count. */
export function yearsTable(dots: FitnessDots, sport: Sport, units: UnitSystem): ChartTableData {
  const words = FITNESS_WORDS[sport]
  const row = (year: DotsYear): string[] =>
    year.n === 0
      ? [String(year.year), NONE, NONE, '0']
      : [
          String(year.year),
          output(dots, sport, units, year.median),
          rangeText(dots, sport, units, year.low, year.high),
          formatCount(year.n),
        ]
  return {
    columns: ['Year', words.output, 'Middle 80%', upper(words.steadyPlural)],
    rows: dots.years.map(row),
    caption: `${words.output} at ${atText(dots)} by year`,
    phoneHidden: [2],
  }
}

/** The table twin of the shading: each slip and rise and the months it covers. */
export function spansTable(dots: FitnessDots): ChartTableData | undefined {
  if (dots.spans.length === 0) return undefined
  return {
    columns: ['Change', 'Period'],
    rows: dots.spans.map((span) => [WORD[span.kind], periodText(span)]),
    caption: 'Slips and rises',
    textColumns: [0, 1],
  }
}
