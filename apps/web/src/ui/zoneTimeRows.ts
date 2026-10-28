import type { MeasureTime } from '@rca/core/zones'
import { zoneShares } from '@rca/core/zones'
import type { ChartTableData } from './charts/chartTypes'
import type { ZoneChartRow } from './charts/ZoneTimeChart'
import { ROW_LABEL, percentText, zoneTimeText } from './zoneTimeCopy'

/** What a bar reads as text: each zone that held time, with its share. */
export function barSummary(time: Pick<MeasureTime, 'seconds' | 'totalSeconds'>): string {
  return zoneShares(time)
    .map((share, i) => (share > 0 ? `zone ${i + 1} ${percentText(share)}` : null))
    .filter((part): part is string => part !== null)
    .join(', ')
}

/** The bars of a period: one for each measure. */
export function periodBars(rows: readonly MeasureTime[]): ZoneChartRow[] {
  return rows.map((row) => ({
    label: ROW_LABEL[row.measure],
    seconds: row.seconds,
    summary: barSummary(row),
  }))
}

/**
 * The text twin of a period's bars: every measure's time and share in each zone, and above it each
 * measure's totals, with how many activities it counted and how many it left out.
 */
export function periodTables(rows: readonly MeasureTime[]): {
  table: ChartTableData
  summary: ChartTableData
} {
  return {
    summary: {
      caption: 'What each measure counted',
      columns: ['Measure', 'Activities counted', 'Time', 'Left out'],
      rows: rows.map((row) => [
        ROW_LABEL[row.measure],
        String(row.counted),
        zoneTimeText(row.totalSeconds),
        String(row.noData + row.noZones),
      ]),
    },
    table: {
      caption: 'Time in each zone over the period',
      columns: ['Measure', 'Zone', 'Name', 'Time', 'Share'],
      textColumns: [2],
      rows: rows.flatMap((row) =>
        zoneShares(row).map((share, i) => [
          ROW_LABEL[row.measure],
          String(i + 1),
          row.names[i] ?? '',
          zoneTimeText(row.seconds[i] ?? 0),
          percentText(share),
        ]),
      ),
    },
  }
}
