import { useId } from 'react'
import { percentText } from '../zoneTimeCopy'
import { ChartFrame } from './ChartFrame'
import type { ChartSize, ChartTableData } from './chartTypes'
import { labelWidthPx, rootFontPx } from './rootFont'
import { percentFits, segmentsOf, takeawayText } from './zoneBars'
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
  /** The sentence the bars support. */
  lede: string
  rows: readonly ZoneChartRow[]
  table: ChartTableData
  /** A short table above `table` in the text view. */
  summary?: ChartTableData
}

/** One measure's band: its label and takeaway line, the bar, and the zone numbers and names under it. */
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
/** A zone's number is drawn under its segment when the segment is at least this wide, px. */
const NUMBER_MIN_WIDTH = 20

const ROW_HEIGHT = BAR_TOP + BAR_HEIGHT + NAME_GAP + ROW_GAP

/** The height of the whole chart for this many bars: each band, then the key. */
function heightOf(rows: number): number {
  return rows * ROW_HEIGHT + KEY_HEIGHT
}

function Bar({
  row,
  index,
  size,
  clipId,
}: {
  row: ZoneChartRow
  index: number
  size: ChartSize
  clipId: string
}) {
  const barHeight = BAR_HEIGHT
  const top = index * ROW_HEIGHT
  const barTop = top + BAR_TOP
  const rootPx = rootFontPx()
  const segments = segmentsOf(row.seconds, size.width)
  const clip = `${clipId}-${index}`
  return (
    <g>
      <text className="zone-time__label" x={0} y={top + LABEL_BASELINE}>
        {row.label}
      </text>
      {row.easyHard ? (
        <text
          className="zone-time__takeaway"
          x={size.width}
          y={top + LABEL_BASELINE}
          textAnchor="end"
        >
          {takeawayText(row.easyHard)}
        </text>
      ) : null}
      <clipPath id={clip}>
        <rect x={0} y={barTop} width={size.width} height={barHeight} rx={BAR_RADIUS} />
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
      {segments.map((segment) => {
        const name = row.names?.[segment.level - 1]
        const named = name === undefined ? '' : `${segment.level} ${name}`
        const label =
          named !== '' && segment.width >= labelWidthPx(named, rootPx) + 8
            ? named
            : segment.width >= NUMBER_MIN_WIDTH
              ? String(segment.level)
              : ''
        return label === '' ? null : (
          <text
            key={segment.level}
            className="zone-time__number"
            x={segment.left + segment.width / 2}
            y={barTop + barHeight + NAME_GAP - 2}
            textAnchor="middle"
          >
            {label}
          </text>
        )
      })}
    </g>
  )
}

/** The key: the five steps, numbered, from easy to hard, in the ramp's colours. */
function Key({ y }: { y: number }) {
  const step = KEY_CHIP.width + KEY_CHIP.gap
  const left = 40
  return (
    <g className="zone-time__key">
      <text className="zone-time__number" x={0} y={y + 16}>
        Easy
      </text>
      {[1, 2, 3, 4, 5].map((level) => (
        <g key={level}>
          <rect
            className="zone-time__chip"
            data-zone={level}
            x={left + (level - 1) * step}
            y={y}
            width={KEY_CHIP.width}
            height={KEY_CHIP.height}
            rx={4}
          />
          <text
            className="zone-time__percent zone-time__percent--key"
            data-zone={level}
            x={left + (level - 1) * step + KEY_CHIP.width / 2}
            y={y + KEY_CHIP.height / 2}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {level}
          </text>
        </g>
      ))}
      <text className="zone-time__number" x={left + 5 * step + 2} y={y + 16}>
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
      height={heightOf(rows.length)}
      table={table}
      summary={summary}
    >
      {(size) => (
        <>
          {rows.map((row, i) => (
            <Bar key={row.label} row={row} index={i} size={size} clipId={clipId} />
          ))}
          <Key y={rows.length * ROW_HEIGHT} />
        </>
      )}
    </ChartFrame>
  )
}
