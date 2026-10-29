import { SPORT_PLURAL } from '../sports'
import type { ChartLegendEntry } from './ChartLegend'
import type { TooltipContent, TooltipRow } from './chartTypes'
import type { SharedWeek } from './gradeTrend'
import type { TrendRows } from './sharedTrendRows'
import { copyOf, formatValue, levelNote } from './sharedTrendText'
import { weekDay } from './trendText'

/** What a row's tooltip says about the weeks behind it: a month's mean, or the latest week by itself. */
function coverage(data: TrendRows, index: number): string | undefined {
  const count = data.weeksIn[index] ?? 1
  if (!data.monthly) return undefined
  return index === data.rows.length - 1
    ? 'The latest week'
    : `Average of ${count} week${count === 1 ? '' : 's'}`
}

/**
 * A row's tooltip: each sport's value, or a dash and a note where a sport has none then. A grade's cycling
 * is an estimate, so its key is a ring and its name says so.
 */
export function tooltipFor(
  data: TrendRows,
  index: number,
  x: number,
  y: number,
  rideKnown: boolean,
): TooltipContent | null {
  const week = data.rows[index]
  if (week === undefined) return null
  const span = coverage(data, index)
  const noted = (level: string | undefined) =>
    [level, span].filter((part) => part !== undefined).join(' · ') || undefined
  const rows: TooltipRow[] = [
    week.run === null
      ? { kind: 'run', label: 'Run', value: '—', note: `No ${SPORT_PLURAL.run} in the window` }
      : {
          kind: 'run',
          label: 'Run',
          value: formatValue(week.run),
          note: noted(levelNote(week.run)),
        },
  ]
  if (rideKnown) {
    rows.push(
      week.ride === null
        ? {
            kind: 'ride',
            label: 'Ride, estimated',
            value: '—',
            note: `No ${SPORT_PLURAL.ride} in the window`,
          }
        : {
            kind: 'ride',
            label: 'Ride, estimated',
            value: formatValue(week.ride),
            swatch: 'dashed',
            note: noted(levelNote(week.ride)),
          },
    )
  }
  const title = data.monthly
    ? `Month to ${weekDay(week.endMs)}`
    : `Week ending ${weekDay(week.endMs)}`
  return { x, y, title, rows }
}

/** The key: each sport's line, the ride's ring and its 90% range where the ride is an estimate. */
export function legendOf(
  copy: ReturnType<typeof copyOf>,
  hasRun: boolean,
  hasRide: boolean,
  hasBand: boolean,
): ChartLegendEntry[] {
  return [
    ...(hasRun ? [{ label: copy.runLegend, kind: 'run' as const, swatch: 'line' as const }] : []),
    ...(hasRide
      ? [
          {
            label: copy.rideLegend,
            kind: 'ride' as const,
            swatch: 'ring' as const,
          },
        ]
      : []),
    ...(hasBand ? [{ label: '90% range', kind: 'ride' as const, swatch: 'band' as const }] : []),
  ]
}

/** A row of the table twin: the week, each sport's value or a dash, and the counts of the activities behind them. */
export function tableRowOf(week: SharedWeek, rideKnown: boolean, average = false): string[] {
  const row = [weekDay(week.endMs), week.run === null ? '—' : formatValue(week.run)]
  if (rideKnown) row.push(week.ride === null ? '—' : formatValue(week.ride))
  // A month is an average of its weeks, so it has no count of activities of its own.
  row.push(average ? '—' : String(week.runCount))
  if (rideKnown) row.push(average ? '—' : String(week.rideCount))
  return row
}
