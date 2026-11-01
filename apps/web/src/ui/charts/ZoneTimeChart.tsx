import { useId } from 'react'
import { percentText } from '../zoneTimeCopy'
import { ChartFrame } from './ChartFrame'
import type { ChartSize, ChartTableData } from './chartTypes'
import { eyebrowWidth, smallWidth } from './annotationTypes'
import { geometryScale } from './plotBox'
import { rootFontPx } from './rootFont'
import { percentFits, segmentsOf, takeawayText, underLabels } from './zoneBars'
import './ZoneTimeChart.css'

/** One measure's stacked bar: the seconds in each zone, lowest effort first. */
export interface ZoneChartRow {
  /** "Heart rate", above its bar. */
  label: string
  seconds: readonly number[]
  /** What the bar reads as text: "zone 1 12%, zone 2 64%". */
  summary: string
  /** The zone names, lowest effort first: "Endurance", set under a segment wide enough to hold it. */
  names?: readonly string[]
  /** The shares of the time that were easy and hard, 0 to 1: the bar's takeaway, written above it. */
  easyHard?: { easy: number; hard: number }
}

export interface ZoneTimeChartProps {
  title: string
  /** A line under the title, such as the stretch the bars are of; absent for none. */
  lede?: string
  rows: readonly ZoneChartRow[]
  table: ChartTableData
  /** A short table above `table` in the text view. */
  summary?: ChartTableData
}

/**
 * One measure's band: its label and takeaway line, the bar, and the zone numbers and names under it. The sizes
 * are laid out for a 16 px root and grow with the reader's text size (geometryScale), as the text inside them does.
 */
const LABEL_BASELINE = 14
const BAR_TOP = 24
const BAR_HEIGHT = 44
const NAME_GAP = 16
const ROW_GAP = 22
/** The key under the bars: Easy, five numbered steps, Hard. */
const KEY_HEIGHT = 30
const KEY_CHIP = { width: 34, height: 22, gap: 6 }
const BAR_RADIUS = 8
/** The gap kept between two segments, px. */
const SEGMENT_GAP = 2
/** The room a label and its takeaway keep between them, px, and the line the takeaway takes when it drops under. */
const TAKEAWAY_GAP = 12
const TAKEAWAY_LINE = 16

/** Whether the label and its takeaway are too wide for one line, so the takeaway goes on a line of its own. */
function takeawayDrops(row: ZoneChartRow, width: number, rootPx: number): boolean {
  if (!row.easyHard) return false
  return (
    eyebrowWidth(row.label, rootPx) +
      smallWidth(takeawayText(row.easyHard), rootPx) +
      TAKEAWAY_GAP >
    width
  )
}

/** The band's height, with the extra line a dropped takeaway takes. */
function rowHeight(dropped: boolean): number {
  const scale = geometryScale()
  return (BAR_TOP + BAR_HEIGHT + NAME_GAP + ROW_GAP + (dropped ? TAKEAWAY_LINE : 0)) * scale
}

/** Where each band starts, and the height of the whole chart: each band, then the key. */
function layoutOf(rows: readonly ZoneChartRow[], width: number) {
  const rootPx = rootFontPx()
  const dropped = rows.map((row) => takeawayDrops(row, width, rootPx))
  const tops = dropped.map((_, i) =>
    dropped.slice(0, i).reduce((sum, drop) => sum + rowHeight(drop), 0),
  )
  const keyTop = tops.length === 0 ? 0 : tops.at(-1)! + rowHeight(dropped.at(-1)!)
  return { dropped, tops, keyTop, height: keyTop + KEY_HEIGHT * geometryScale() }
}

function Bar({
  row,
  index,
  top,
  dropped,
  size,
  clipId,
}: {
  row: ZoneChartRow
  index: number
  top: number
  dropped: boolean
  size: ChartSize
  clipId: string
}) {
  const scale = geometryScale()
  const barHeight = BAR_HEIGHT * scale
  const nameGap = NAME_GAP * scale
  const barTop = top + (BAR_TOP + (dropped ? TAKEAWAY_LINE : 0)) * scale
  const baseline = top + LABEL_BASELINE * scale
  const rootPx = rootFontPx()
  const segments = segmentsOf(row.seconds, size.width)
  const clip = `${clipId}-${index}`
  return (
    <g>
      <text className="zone-time__label" x={0} y={baseline}>
        {row.label}
      </text>
      {row.easyHard ? (
        <text
          className="zone-time__takeaway"
          x={dropped ? 0 : size.width}
          y={dropped ? baseline + TAKEAWAY_LINE * scale : baseline}
          textAnchor={dropped ? 'start' : 'end'}
        >
          {takeawayText(row.easyHard)}
        </text>
      ) : null}
      <clipPath id={clip}>
        <rect x={0} y={barTop} width={size.width} height={barHeight} rx={BAR_RADIUS * scale} />
      </clipPath>
      <g clipPath={`url(#${clip})`}>
        {segments.map((segment, i) => {
          // Each segment gives up half the gap on a side it shares with a neighbour, so the gap is the same everywhere.
          const first = i === 0
          const last = i === segments.length - 1
          const x = segment.left + (first ? 0 : SEGMENT_GAP / 2)
          const width = segment.width - (first ? 0 : SEGMENT_GAP / 2) - (last ? 0 : SEGMENT_GAP / 2)
          const text = percentText(segment.share)
          return (
            <g key={segment.level} data-zone={segment.level}>
              <rect
                className="zone-time__segment"
                data-zone={segment.level}
                x={x}
                y={barTop}
                width={Math.max(0, width)}
                height={barHeight}
              />
              {percentFits(text, segment.width, rootPx) ? (
                <text
                  className="zone-time__percent"
                  data-zone={segment.level}
                  x={segment.left + segment.width / 2}
                  y={barTop + barHeight / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {text}
                </text>
              ) : null}
            </g>
          )
        })}
      </g>
      {underLabels(segments, row.names, size.width, rootPx).map((label) => (
        <text
          key={label.level}
          className="zone-time__number"
          x={label.x}
          y={barTop + barHeight + nameGap - 2}
          textAnchor="middle"
        >
          {label.text}
        </text>
      ))}
    </g>
  )
}

/** The key: the five steps, numbered, from easy to hard, in the ramp's colours. */
function Key({ y }: { y: number }) {
  const scale = geometryScale()
  const chip = { width: KEY_CHIP.width * scale, height: KEY_CHIP.height * scale }
  const step = chip.width + KEY_CHIP.gap * scale
  const left = 40 * scale
  return (
    <g className="zone-time__key">
      <text className="zone-time__number" x={0} y={y + 16 * scale}>
        Easy
      </text>
      {[1, 2, 3, 4, 5].map((level) => (
        <g key={level}>
          <rect
            className="zone-time__chip"
            data-zone={level}
            x={left + (level - 1) * step}
            y={y}
            width={chip.width}
            height={chip.height}
            rx={4 * scale}
          />
          <text
            className="zone-time__percent zone-time__percent--key"
            data-zone={level}
            x={left + (level - 1) * step + chip.width / 2}
            y={y + chip.height / 2}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {level}
          </text>
        </g>
      ))}
      <text className="zone-time__number" x={left + 5 * step + 2} y={y + 16 * scale}>
        Hard
      </text>
    </g>
  )
}

/**
 * The share of time in each zone as a stacked horizontal bar for each measure, on the sport's five-step ramp:
 * the percent inside each segment where it fits, the zone's number and name under it where they fit, and the
 * easy and hard shares above the bar as its takeaway. Under the bars a key reads Easy 1 2 3 4 5 Hard. The
 * sentence the bars support is above them and the same numbers are in a table behind View as table.
 */
export function ZoneTimeChart({ title, lede, rows, table, summary }: ZoneTimeChartProps) {
  const clipId = useId().replaceAll(':', '')
  const description = `Stacked bars of the share of time in each zone. ${rows.map((row) => `${row.label}: ${row.summary}.`).join(' ')}`
  return (
    <ChartFrame
      title={title}
      description={description}
      lede={lede}
      height={(width) => layoutOf(rows, width).height}
      table={table}
      summary={summary}
    >
      {(size) => {
        const { dropped, tops, keyTop } = layoutOf(rows, size.width)
        return (
          <>
            {rows.map((row, i) => (
              <Bar
                key={row.label}
                row={row}
                index={i}
                top={tops[i]!}
                dropped={dropped[i]!}
                size={size}
                clipId={clipId}
              />
            ))}
            <Key y={keyTop} />
          </>
        )
      }}
    </ChartFrame>
  )
}
