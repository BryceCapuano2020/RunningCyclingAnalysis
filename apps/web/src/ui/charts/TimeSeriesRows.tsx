import type { ChartSize } from './chartTypes'
import { ChartXAxis } from './ChartXAxis'
import { axisFontRem, labelWidth, rootScale } from './ticks'
import { areaPath, linePath, timeTicks } from './timeSeriesModel'
import type { PixelMap } from './timeSeriesModel'
import { valueMap } from './timeSeriesLayout'
import type { StackLayout } from './timeSeriesLayout'
import type { StackChannel } from './timeSeriesTypes'
import { formatRecordTime } from '@rca/core/units'
import { memo } from 'react'
import './TimeSeriesStack.css'

/** The widest a time label is, in px, at the default text size, so ticks keep clear of each other. */
const TICK_GAP_PX = 64
/** The tick text size and the air kept between two labels, px. */
const TICK_FONT_PX = 12
const TICK_AIR_PX = 16

export interface TimeSeriesRowsProps {
  size: ChartSize
  layout: StackLayout
  channels: readonly StackChannel[]
  startS: number
  endS: number
  laps: readonly { startS: number; endS: number }[]
}

/**
 * The static drawing of the stack: laps behind, then each channel's row as a small chart of its own with its name above
 * it, and the time axis. A pause or gap is a break in the line, with no mark of its own. It does not
 * know the cursor, so moving the cursor does not redraw it (it is memoised on what it draws).
 */
export const TimeSeriesRows = memo(function TimeSeriesRows({
  size,
  layout,
  channels,
  startS,
  endS,
  laps,
}: TimeSeriesRowsProps) {
  const { plot } = size
  const span = Math.max(1, endS - startS)
  const x = (timeS: number) => plot.left + ((timeS - startS) / span) * (plot.right - plot.left)
  const rowsBottom = layout.rows.at(-1)?.bottom ?? plot.top
  // The longest time on the axis sets the gap, at the reader's text size and spacing: an hour's "1:30:00" is wider than "0:30".
  const gap = Math.max(
    TICK_GAP_PX,
    labelWidth(formatRecordTime(endS), TICK_FONT_PX, rootScale()) + TICK_AIR_PX,
  )
  const ticks = timeTicks(startS, endS, plot.right - plot.left, gap).map((t) => ({
    position: x(t),
    label: formatRecordTime(t),
  }))
  return (
    <>
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
            <path className="ts-stack__line" d={linePath(channel.columns, map)} />
            <text className="ts-stack__label" x={plot.left} y={row.top - 6}>
              {channel.short}{' '}
              <tspan className="ts-stack__unit" dx="2">
                {channel.unit}
              </tspan>
            </text>
          </g>
        )
      })}
    </>
  )
})
