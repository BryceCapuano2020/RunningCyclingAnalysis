import { useState } from 'react'
import type { VirtualPowerAccuracy } from '../../core/types'
import { formatDuration, formatPercent, formatPower } from '../../core/units'
import { ChartFrame } from './ChartFrame'
import { ChartTooltip } from './ChartTooltip'
import { ChartXAxis } from './ChartXAxis'
import { ChartYAxis } from './ChartYAxis'
import type { AxisTick, ChartSize, PlotBox, Point, TooltipContent } from './chartTypes'
import { nearestByPoint, stepActive } from './hover'
import { PlotSurface } from './PlotSurface'
import { linearScale, niceDomain } from './scale'
import './AccuracyScatter.css'

export interface AccuracyScatterProps {
  accuracy: VirtualPowerAccuracy
}

const EMPTY = 'No climbs of two minutes or more with power-meter data yet'
const DOT_R = 4
const ACTIVE_DOT_R = 6
const HIT_RADIUS = 16

interface Dot extends Point {
  measuredW: number
  estimatedW: number
  lengthS: number
}

interface Layout {
  dots: Dot[]
  square: PlotBox
  /** The y = x line across the whole domain. */
  reference: { x1: number; y1: number; x2: number; y2: number }
  xTicks: AxisTick[]
  yTicks: AxisTick[]
}

/** Largest square inside the plot, centred, so that the y = x line is at 45 degrees. */
function squareOf(plot: PlotBox): PlotBox {
  const side = Math.min(plot.right - plot.left, plot.bottom - plot.top)
  const left = plot.left + (plot.right - plot.left - side) / 2
  const top = plot.top + (plot.bottom - plot.top - side) / 2
  return { left, right: left + side, top, bottom: top + side }
}

function layout(accuracy: VirtualPowerAccuracy, size: ChartSize): Layout {
  const { segments } = accuracy
  // Both axes share one domain, so that distance from the diagonal is an error.
  const { domain, ticks } = niceDomain(
    segments.flatMap((segment) => [segment.measuredW, segment.estimatedW]),
    4,
  )
  const square = squareOf(size.plot)
  const x = linearScale(domain, [square.left, square.right])
  const y = linearScale(domain, [square.bottom, square.top])
  const [low, high] = domain
  return {
    dots: segments.map((segment) => ({
      x: x(segment.measuredW),
      y: y(segment.estimatedW),
      measuredW: segment.measuredW,
      estimatedW: segment.estimatedW,
      lengthS: segment.end - segment.start,
    })),
    square,
    reference: { x1: x(low), y1: y(low), x2: x(high), y2: y(high) },
    xTicks: ticks.map((value) => ({ position: x(value), label: String(Math.round(value)) })),
    yTicks: ticks.map((value) => ({ position: y(value), label: String(Math.round(value)) })),
  }
}

const errorOf = (dot: Dot): number => (dot.estimatedW - dot.measuredW) / dot.measuredW

function tooltipFor(dot: Dot): TooltipContent {
  return {
    x: dot.x,
    y: dot.y,
    title: 'Climb',
    rows: [
      { value: formatPower(dot.measuredW), label: 'Measured' },
      { value: formatPower(dot.estimatedW), label: 'Estimated' },
      { value: formatPercent(errorOf(dot), true), label: 'Error' },
      { value: formatDuration(dot.lengthS), label: 'Length' },
    ],
  }
}

export function AccuracyScatter({ accuracy }: AccuracyScatterProps) {
  const hasData = accuracy.nSegments > 0
  const [active, setActive] = useState<number | null>(null)

  return (
    <ChartFrame
      title="Estimated against measured power on climbs"
      description="Power estimated from speed and gradient against power measured by a power meter, one point per climb. Points on the dashed line are perfect estimates."
      table={{
        columns: ['Measured', 'Estimated', 'Error'],
        rows: accuracy.segments.map((segment) => {
          const error = (segment.estimatedW - segment.measuredW) / segment.measuredW
          return [
            formatPower(segment.measuredW),
            formatPower(segment.estimatedW),
            formatPercent(error, true),
          ]
        }),
      }}
      empty={hasData ? undefined : EMPTY}
      overlay={(size) => {
        const m = hasData ? layout(accuracy, size) : null
        const dot = m && active !== null ? m.dots[active] : undefined
        return (
          <ChartTooltip
            bounds={{ width: size.width, height: size.height }}
            content={dot ? tooltipFor(dot) : null}
          />
        )
      }}
    >
      {(size) => {
        const m = layout(accuracy, size)
        const { square, reference } = m
        const squareSize: ChartSize = { ...size, plot: square }
        return (
          <>
            <ChartXAxis ticks={m.xTicks} plot={square} title="Measured power (W)" />
            <ChartYAxis ticks={m.yTicks} plot={square} title="Estimated power (W)" />
            <line
              data-testid="accuracy-reference"
              className="accuracy-scatter__reference"
              x1={reference.x1}
              y1={reference.y1}
              x2={reference.x2}
              y2={reference.y2}
            />
            <text
              className="accuracy-scatter__reference-label"
              x={square.right - 6}
              y={square.top + 14}
              textAnchor="end"
            >
              Perfect estimate
            </text>
            {m.dots.map((dot, i) => (
              <circle
                key={i}
                data-testid="accuracy-dot"
                className="accuracy-scatter__dot"
                cx={dot.x}
                cy={dot.y}
                r={i === active ? ACTIVE_DOT_R : DOT_R}
              />
            ))}
            <PlotSurface
              size={squareSize}
              label="Climbs, measured against estimated power. Use the left and right arrow keys to move between climbs, Escape to clear"
              onPoint={(point) =>
                setActive(point === null ? null : nearestByPoint(m.dots, point, HIT_RADIUS))
              }
              onKey={(key) => {
                const next = stepActive(active, m.dots.length, key)
                if (next) setActive(next.index)
              }}
              onBlur={() => setActive(null)}
            />
          </>
        )
      }}
    </ChartFrame>
  )
}
