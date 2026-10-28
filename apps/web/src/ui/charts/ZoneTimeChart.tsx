import type { CSSProperties } from 'react'
import { ChartFrame } from './ChartFrame'
import type { ChartSize, ChartTableData } from './chartTypes'
import './ZoneTimeChart.css'

/** One measure's stacked bar: the seconds in each zone, lowest effort first. */
export interface ZoneChartRow {
  /** "Heart rate", above its bar. */
  label: string
  seconds: readonly number[]
  /** What the bar reads as text: "zone 1 12%, zone 2 64%". */
  summary: string
}

export interface ZoneTimeChartProps {
  title: string
  /** The sentence the bars support. */
  lede: string
  rows: readonly ZoneChartRow[]
  table: ChartTableData
  /** A short table above `table` in the text view. */
  summary?: ChartTableData
}

/** One measure's band: the label, the bar and the zone numbers under it. */
const ROW_HEIGHT = 64
const LABEL_BASELINE = 14
const BAR_TOP = 22
const BAR_HEIGHT = 22
const NUMBER_BASELINE = 60
/** A zone number is drawn under its segment only when the segment is at least this wide, in px. */
const NUMBER_MIN_WIDTH = 20

/**
 * The least strength, in percent, of the sport's colour in a segment. At 80% the lightest segment keeps 3:1
 * against the card in both schemes and both sports (the least that does is 66 to 80%, which
 * zoneTint.test.ts checks from the tokens), which is what a graphic that carries meaning needs.
 */
export const MIN_ZONE_TINT = 80

/**
 * The tint of a zone: the sport's colour at a strength that rises with the zone, from MIN_ZONE_TINT to
 * 100%. So close a range cannot tell zones apart on its own: the order of the bar, the numbers under it
 * and the table say which zone is which, and the segments are edged in the page colour.
 */
function tint(index: number, count: number): number {
  return Math.round(MIN_ZONE_TINT + ((100 - MIN_ZONE_TINT) * (index + 1)) / count)
}

function segmentStyle(index: number, count: number): CSSProperties {
  return { ['--zone-tint' as string]: `${tint(index, count)}%` }
}

/** The segments of a bar, left to right across the width, with the zone each stands for. Empty zones have none. */
function segmentsOf(seconds: readonly number[], width: number) {
  const total = seconds.reduce((a, b) => a + b, 0)
  const lefts = seconds.map((_, i) => seconds.slice(0, i).reduce((a, b) => a + b, 0))
  return seconds.flatMap((each, i) =>
    each > 0 && total > 0
      ? [{ level: i + 1, left: (lefts[i]! / total) * width, width: (each / total) * width }]
      : [],
  )
}

function Bar({ row, index, size }: { row: ZoneChartRow; index: number; size: ChartSize }) {
  const top = index * ROW_HEIGHT
  return (
    <g>
      <text className="zone-time__label" x={0} y={top + LABEL_BASELINE}>
        {row.label}
      </text>
      {segmentsOf(row.seconds, size.width).map((segment) => (
        <g key={segment.level}>
          <rect
            className="zone-time__segment"
            style={segmentStyle(segment.level - 1, row.seconds.length)}
            x={segment.left}
            y={top + BAR_TOP}
            width={segment.width}
            height={BAR_HEIGHT}
          />
          {segment.width >= NUMBER_MIN_WIDTH ? (
            <text
              className="zone-time__number"
              x={segment.left + segment.width / 2}
              y={top + NUMBER_BASELINE}
              textAnchor="middle"
            >
              {segment.level}
            </text>
          ) : null}
        </g>
      ))}
    </g>
  )
}

/**
 * The share of time in each zone as a stacked horizontal bar for each measure, with the sentence it
 * supports above and the same numbers in a table behind View as table. The bars fill the width, so a
 * 320 px phone shows them whole. A zone's number sits under its segment when the segment is wide enough.
 */
export function ZoneTimeChart({ title, lede, rows, table, summary }: ZoneTimeChartProps) {
  const description = `Stacked bars of the share of time in each zone. ${rows.map((row) => `${row.label}: ${row.summary}.`).join(' ')}`
  return (
    <ChartFrame
      title={title}
      description={description}
      lede={lede}
      height={rows.length * ROW_HEIGHT + 4}
      table={table}
      summary={summary}
    >
      {(size) => rows.map((row, i) => <Bar key={row.label} row={row} index={i} size={size} />)}
    </ChartFrame>
  )
}
