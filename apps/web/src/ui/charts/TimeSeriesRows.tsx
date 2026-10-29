import type { ChartSize } from './chartTypes'
import { ChartXAxis } from './ChartXAxis'
import { axisFontRem } from './ticks'
import { areaPath, bandPath, linePath, timeTicks } from './timeSeriesModel'
import type { PixelMap } from './timeSeriesModel'
import { bandOpacity, edgeTicks } from './timeSeriesEdge'
import { valueMap } from './timeSeriesLayout'
import type { StackLayout } from './timeSeriesLayout'
import type { StackChannel, StackMark } from './timeSeriesTypes'
import { formatRecordTime } from '@rca/core/units'
import { memo } from 'react'
import './TimeSeriesStack.css'

/** The widest a time label is, in px, so ticks keep clear of each other. */
const TICK_GAP_PX = 64
const SKIPPED_PX = 5

export interface TimeSeriesRowsProps {
  size: ChartSize
  layout: StackLayout
  channels: readonly StackChannel[]
  startS: number
  endS: number
  laps: readonly { startS: number; endS: number }[]
  marks: readonly StackMark[]
  hatchId: string
}

/**
 * The static drawing of the stack: laps behind, then each channel's row, the lane of pauses and gaps, and the time axis. It does not
 * know the cursor, so moving the cursor does not redraw it (it is memoised on what it draws).
 */
export const TimeSeriesRows = memo(function TimeSeriesRows({
  size,
  layout,
  channels,
  startS,
  endS,
  laps,
  marks,
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
              <path
                className="ts-stack__band"
                d={bandPath(channel.columns, map)}
                style={{ opacity: bandOpacity(span / Math.max(1, channel.columns.x.length)) }}
              />
            )}
            <path className="ts-stack__line" d={linePath(channel.columns, map)} />
            <path className="ts-stack__edge" d={edgeTicks(channel, row, x)} />
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
    </>
  )
})
