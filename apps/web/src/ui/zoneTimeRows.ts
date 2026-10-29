import type { MeasureTime } from '@rca/core/zones'
import {
  EASY_THROUGH,
  HARD_FROM,
  hasEnoughZoneTime,
  sameEnteredReferences,
  zoneShares,
} from '@rca/core/zones'
import type { ZoneMeasure } from '@rca/core/zones'
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

/** The shares of a measure's time that were easy and hard, by the same zones as the sentence above the bars. */
export function easyHardShares(
  measure: ZoneMeasure,
  time: Pick<MeasureTime, 'seconds' | 'totalSeconds'>,
): { easy: number; hard: number } {
  const shares = zoneShares(time)
  const sum = (keep: (level: number) => boolean) =>
    shares.reduce((total, share, i) => (keep(i + 1) ? total + share : total), 0)
  return {
    easy: sum((level) => level <= EASY_THROUGH[measure]),
    hard: sum((level) => level >= HARD_FROM[measure]),
  }
}

/** One measure's bar: its label, the time in each zone, its text reading, its zone names and its easy and hard shares. */
export function zoneBar(
  measure: ZoneMeasure,
  time: Pick<MeasureTime, 'seconds' | 'totalSeconds'>,
  names: readonly string[],
): ZoneChartRow {
  return {
    label: ROW_LABEL[measure],
    seconds: time.seconds,
    summary: barSummary(time),
    names,
    easyHard: easyHardShares(measure, time),
  }
}

/** The bars of a period: one for each measure. */
export function periodBars(rows: readonly MeasureTime[]): ZoneChartRow[] {
  return rows.map((row) => zoneBar(row.measure, row, row.names))
}

/** The previous period's row of a measure, only when it can be compared: enough time, and the same entered settings. */
function comparableBefore(
  row: MeasureTime,
  previous: readonly MeasureTime[] | null,
): MeasureTime | null {
  const before = previous?.find((each) => each.measure === row.measure)
  return before !== undefined && hasEnoughZoneTime(before) && sameEnteredReferences(before, row)
    ? before
    : null
}

/**
 * The text twin of a period's bars: every measure's time and share in each zone, and above it each
 * measure's totals, with how many activities it counted and how many it left out. With a period before
 * it, the zone table adds that period's share of each zone, where its time is enough and its zones are the
 * same as these; a measure that cannot be compared shows a dash, and a table with none has no column.
 */
export function periodTables(
  rows: readonly MeasureTime[],
  previous: readonly MeasureTime[] | null = null,
  previousLabel: string | null = null,
): {
  table: ChartTableData
  summary: ChartTableData
} {
  // Without a label for the period before there is no column to head, as there is no sentence to say it in.
  const befores = rows.map((row) =>
    previousLabel === null ? null : comparableBefore(row, previous),
  )
  const withPrevious = befores.some((before) => before !== null)
  return {
    summary: {
      caption: 'What each measure counted',
      columns: ['Measure', 'Activities counted', 'Time', 'Left out'],
      rows: rows.map((row) => [
        ROW_LABEL[row.measure],
        String(row.counted),
        zoneTimeText(row.totalSeconds),
        String(row.noData + row.setAside + row.noZones),
      ]),
    },
    table: {
      caption: 'Time in each zone over the period',
      columns: [
        'Measure',
        'Zone',
        'Name',
        'Time',
        'Share',
        ...(withPrevious && previousLabel !== null ? [previousLabel] : []),
      ],
      textColumns: [2],
      rows: rows.flatMap((row, r) => {
        const before = befores[r]!
        const then = before === null ? [] : zoneShares(before)
        return zoneShares(row).map((share, i) => {
          const cells = [
            ROW_LABEL[row.measure],
            String(i + 1),
            row.names[i] ?? '',
            zoneTimeText(row.seconds[i] ?? 0),
            percentText(share),
          ]
          if (withPrevious) cells.push(before === null ? '—' : percentText(then[i] ?? 0))
          return cells
        })
      }),
    },
  }
}
