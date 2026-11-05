import type { YearRow } from '@rca/core/history'
import type { Sport } from '@rca/core/types'
import type { SparkPoint } from '../components/Sparkline'
import { SPORT_ORDER } from '../sports'

/** A year's point sits on its first day, so the line is spaced by the calendar. */
const startOf = (year: number) => Date.UTC(year, 0, 1)

/**
 * The year-by-year line behind a total: hours over every sport, or one sport's distance, from the years the hours chart
 * draws. The years on file are a count, and a library of one year has no line; both give none.
 */
export function yearSeries(id: string, years: readonly YearRow[]): SparkPoint[] {
  if (years.length < 2) return []
  if (id === 'hours') {
    return years.map((row) => ({
      atMs: startOf(row.year),
      value: SPORT_ORDER.reduce((sum, sport) => sum + row.sports[sport].hours, 0),
    }))
  }
  const sport = SPORT_ORDER.find((candidate: Sport) => id === `distance-${candidate}`)
  if (sport === undefined) return []
  return years.map((row) => ({ atMs: startOf(row.year), value: row.sports[sport].distanceM }))
}
