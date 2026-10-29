import type { ChartSize } from './chartTypes'
import { ChartXAxis } from './ChartXAxis'
import { axisFontRem } from './ticks'
import { areaPath, bandPath, linePath, timeTicks } from './timeSeriesModel'
import type { PixelMap } from './timeSeriesModel'
import type { StackLayout } from './timeSeriesLayout'
import type { StackChannel, StackMark } from './timeSeriesTypes'
import { formatRecordTime } from '@rca/core/units'
import './TimeSeriesStack.css'

/** The widest a time label is, in px, so ticks keep clear of each other. */
const TICK_GAP_PX = 64
const MARKER_R = 4
const EDGE_MARK_PX = 5
const SKIPPED_PX = 5

export interface TimeSeriesRowsProps {
  size: ChartSize
  layout: StackLayout
  channels: readonly StackChannel[]
  startS: number
  endS: number
  laps: readonly { startS: number; endS: number }[]
  marks: readonly StackMark[]
  /** The cursor's whole second, or null. */
  cursor: number | null
  hatchId: string
}

/** A reading's pixel row, clamped to it so one past the axis sits on its edge. */
function valueMap(channel: StackChannel, row: { top: number; bottom: number }) {
  const span = channel.high - channel.low || 1
  return (value: number) => {
    const share = Math.min(1, Math.max(0, (value - channel.low) / span))
    return row.bottom - share * (row.bottom - row.top)
  }
}

/** A small arrowhead on a row's edge for each stretch where a reading went past the axis. */
function edgeMarks(
  channel: StackChannel,
  row: { top: number; bottom: number },
  x: PixelMap['x'],
): string {
  const { columns } = channel
  const marks: string[] = []
  columns.x.forEach((t, i) => {
    const px = Math.round(x(t))
    if (columns.hi[i]! > channel.high)
      marks.push(
        `M ${px - 3} ${row.top} L ${px + 3} ${row.top} L ${px} ${row.top + EDGE_MARK_PX} Z`,
      )
    if (columns.lo[i]! < channel.low)
      marks.push(
        `M ${px - 3} ${row.bottom} L ${px + 3} ${row.bottom} L ${px} ${row.bottom - EDGE_MARK_PX} Z`,
      )
  })
  return marks.join(' ')
}

/** The static drawing of the stack: laps behind, then each channel's row, the lane of pauses and gaps, and the time axis. */
export function TimeSeriesRows({
  size,
  layout,
  channels,
  startS,
  endS,
  laps,
  marks,
  cursor,
  hatchId,
}: TimeSeriesRowsProps) {
  const { plot } = size
  const span = Math.max(1, endS - startS)
  const x = (timeS: number) => plot.left + ((timeS - startS) / span) * (plot.right - plot.left)
  const rowsBottom = layout.rows.at(-1)?.bottom ?? plot.top
  const ticks = timeTicks(startS, endS, plot.right - plot.left, TICK_GAP_PX).map((t) => ({
    position: x(t),
    label: formatRecordTime(t),
  }))
  return (
    <>
      <defs>
        <pattern id={hatchId} width="4" height="4" patternUnits="userSpaceOnUse">
          <path d="M 0 4 L 4 0" className="ts-stack__hatch" />
        </pattern>
      </defs>
      {laps.map((lap, index) =>
        index % 2 === 1 && lap.endS > startS && lap.startS < endS ? (
          <rect
            key={lap.startS}
            className="ts-stack__lap"
            x={x(Math.max(lap.startS, startS))}
            y={plot.top}
            width={x(Math.min(lap.endS, endS)) - x(Math.max(lap.startS, startS))}
            height={rowsBottom - plot.top}
          />
        ) : null,
      )}
      <ChartXAxis ticks={ticks} plot={plot} />
      {channels.map((channel, index) => {
        const row = layout.rows[index]!
        const y = valueMap(channel, row)
        const map: PixelMap = { x, y }
        return (
          <g
            key={channel.key}
            className={`ts-ch ts-ch--${channel.colour}`}
            data-channel={channel.key}
          >
            {channel.ticks.map((tick) => (
              <g key={tick.value}>
                <line
                  className="ts-stack__grid"
                  x1={plot.left}
                  x2={plot.right}
                  y1={y(tick.value)}
                  y2={y(tick.value)}
                />
                <text
                  className="ts-stack__tick"
                  style={{ fontSize: axisFontRem(12) }}
                  x={plot.left - 8}
                  y={y(tick.value)}
                  textAnchor="end"
                  dominantBaseline="central"
                >
                  {tick.label}
                </text>
              </g>
            ))}
            <path
              className="ts-stack__baseline"
              d={`M ${plot.left} ${row.bottom} L ${plot.right} ${row.bottom}`}
            />
            {channel.shape === 'area' && (
              <path className="ts-stack__area" d={areaPath(channel.columns, map, row.bottom)} />
            )}
            {channel.shape === 'line' && (
              <path className="ts-stack__band" d={bandPath(channel.columns, map)} />
            )}
            <path className="ts-stack__line" d={linePath(channel.columns, map)} />
            <path className="ts-stack__edge" d={edgeMarks(channel, row, x)} />
            {channel.skipped.map(([from, to]) =>
              to > startS && from < endS ? (
                <rect
                  key={from}
                  className="ts-stack__skipped"
                  x={x(Math.max(from, startS))}
                  y={row.bottom - SKIPPED_PX}
                  width={Math.max(2, x(Math.min(to, endS)) - x(Math.max(from, startS)))}
                  height={SKIPPED_PX}
                />
              ) : null,
            )}
            <text className="ts-stack__label" x={plot.left + 6} y={row.top + 12}>
              {channel.short} <tspan className="ts-stack__unit">{channel.unit}</tspan>
            </text>
          </g>
        )
      })}
      {marks.map((mark) =>
        mark.endS > startS && mark.startS < endS ? (
          <rect
            key={`${mark.kind}-${mark.startS}`}
            className={`ts-stack__mark ts-stack__mark--${mark.kind}`}
            x={x(Math.max(mark.startS, startS))}
            y={layout.laneTop}
            width={Math.max(2, x(Math.min(mark.endS, endS)) - x(Math.max(mark.startS, startS)))}
            height={layout.laneBottom - layout.laneTop}
            fill={mark.kind === 'unrecorded' ? `url(#${hatchId})` : undefined}
          />
        ) : null,
      )}
      {cursor !== null && (
        <line
          className="chart-crosshair ts-stack__crosshair"
          x1={x(cursor + 0.5)}
          x2={x(cursor + 0.5)}
          y1={plot.top}
          y2={plot.bottom}
        />
      )}
      {/* The dots sit above the crosshair, so each reads against it. */}
      {cursor !== null &&
        channels.map((channel, index) => (
          <g key={channel.key} className={`ts-ch ts-ch--${channel.colour}`}>
            <CursorDot
              channel={channel}
              cursor={cursor}
              map={{ x, y: valueMap(channel, layout.rows[index]!) }}
            />
          </g>
        ))}
    </>
  )
}

/** The ringed marker where the cursor crosses a channel's line, or nothing where the channel has no reading. */
function CursorDot({
  channel,
  cursor,
  map,
}: {
  channel: StackChannel
  cursor: number
  map: PixelMap
}) {
  const reading = channel.at(cursor)
  if (reading === null) return null
  return (
    <circle
      className="ts-stack__dot"
      cx={map.x(cursor + 0.5)}
      cy={map.y(reading.raw)}
      r={MARKER_R}
    />
  )
}
