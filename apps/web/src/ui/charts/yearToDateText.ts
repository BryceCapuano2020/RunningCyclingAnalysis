import type { YearToDate } from '@rca/core/history'
import type { Sport } from '@rca/core/types'
import { distanceUnit, formatWholeDistance } from '@rca/core/units'
import type { UnitSystem } from '@rca/core/units'
import { SPORT_LABEL, SPORT_PLURAL } from '../sports'
import type { ChartTableData, TooltipRow } from './chartTypes'
import { bestPastYear, currentRow, dayLabel, lastOf, metresOf } from './yearToDateModel'

/** The chart's title: the finding about this year against the best past year by today's date, in whole units. */
export function yearToDateTitle(data: YearToDate, sport: Sport, units: UnitSystem): string {
  const { year } = data.today
  const now = metresOf(currentRow(data)?.toDate[sport] ?? 0)
  const best = bestPastYear(data, sport)
  if (best === undefined) {
    return now === 0
      ? `No ${SPORT_PLURAL[sport]} in ${year} yet`
      : `${year} has ${formatWholeDistance(now, units)} so far`
  }
  const gap = now - metresOf(best.toDate[sport])
  if (Math.round(Math.abs(gap) / distanceUnit(units).metres) === 0) {
    return `${year} is level with ${best.year}`
  }
  const side = gap < 0 ? 'behind' : 'above'
  return `${year} is ${formatWholeDistance(Math.abs(gap), units)} ${side} ${best.year}`
}

/** The table twin: each year's distance to today's date, and its whole year, in the units setting. */
export function yearToDateTable(data: YearToDate, sport: Sport, units: UnitSystem): ChartTableData {
  return {
    caption: `${SPORT_LABEL[sport]} distance by year`,
    columns: ['Year', `To ${dayLabel(data, data.today.day)}`, 'Whole year'],
    rows: data.years.map((row) => [
      String(row.year),
      formatWholeDistance(metresOf(row.toDate[sport]), units),
      row.year === data.today.year
        ? 'In progress'
        : formatWholeDistance(metresOf(lastOf(row, sport)), units),
    ]),
  }
}

/**
 * A sample's tooltip: the day, and each year's distance to that day, newest year first. This year's row takes its
 * sport's colour and the past years are neutral.
 */
export function yearToDateTooltip(
  data: YearToDate,
  sport: Sport,
  units: UnitSystem,
  index: number,
): { title: string; rows: TooltipRow[] } {
  const day = data.days[index] ?? data.today.day
  const rows: TooltipRow[] = []
  for (const row of [...data.years].reverse()) {
    const hectometres = row.hectometres[sport][index]
    if (hectometres === undefined) continue
    const current = row.year === data.today.year
    rows.push({
      kind: current ? sport : 'neutral',
      label: String(row.year),
      value: formatWholeDistance(metresOf(hectometres), units),
    })
  }
  return { title: `To ${dayLabel(data, day)}`, rows }
}
