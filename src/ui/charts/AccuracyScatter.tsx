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
import { linearScale, niceDomain, tickDecimals } from './scale'
import { axisFontSize, fitTicks } from './ticks'
import './AccuracyScatter.css'

export interface AccuracyScatterProps {
  accuracy: VirtualPowerAccuracy
}

const EMPTY = 'No climbs of two minutes or more with power-meter data yet'
const DOT_R = 4
const ACTIVE_DOT_R = 6
const HIT_RADIUS = 16
const MAX_TICKS = 5
/** Domain padding on each side, as a fraction of the data span. */
const DOMAIN_PAD = 0.1
/** Where along the reference line, from its lower-left end, the label sits. */
const LABEL_T = 0.2

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
    DOMAIN_PAD,
  )
  const decimals = tickDecimals(ticks)
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
    xTicks: fitTicks(
      ticks.map((value) => ({ position: x(value), label: value.toFixed(decimals) })),
      { axis: 'x', width: size.width, maxCount: MAX_TICKS },
    ),
    yTicks: fitTicks(
      ticks.map((value) => ({ position: y(value), label: value.toFixed(decimals) })),
      { axis: 'y', width: size.width, maxCount: MAX_TICKS },
    ),
  }
}

/** Summary of the scored climbs, from the scores the core computed. */
function noteFor(accuracy: VirtualPowerAccuracy): string {
  const climbs = accuracy.nSegments === 1 ? 'climb' : 'climbs'
  return `${accuracy.nSegments} ${climbs}. Average error ±${Math.round(accuracy.mape * 100)}%, bias ${formatPercent(accuracy.bias, true)}`
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
      note={hasData ? noteFor(accuracy) : undefined}
      surface={(size) => {
        const m = hasData ? layout(accuracy, size) : null
        if (m === null) return null
        return (
          <PlotSurface
            size={{ ...size, plot: m.square }}
            onPoint={(point) =>
              setActive(point === null ? null : nearestByPoint(m.dots, point, HIT_RADIUS))
            }
            onKey={(key) => {
              const next = stepActive(active, m.dots.length, key)
              if (next) setActive(next.index)
            }}
            onBlur={() => setActive(null)}
          />
        )
      }}
      overlay={(size) => {
        const m = hasData ? layout(accuracy, size) : null
        const dot = m && active !== null ? m.dots[active] : undefined
        return (
          <ChartTooltip
            bounds={{ width: size.width, height: size.height }}
            content={dot ? tooltipFor(dot) : null}
            id={size.tooltipId}
          />
        )
      }}
    >
      {(size) => {
        const m = layout(accuracy, size)
        const { square, reference } = m
        const fontSize = axisFontSize(size.width)
        // Lower-left part of the line, set just below and right of it so the dots above stay clear.
        const labelX = reference.x1 + LABEL_T * (reference.x2 - reference.x1) + 8
        const labelY = reference.y1 + LABEL_T * (reference.y2 - reference.y1) + 16
        return (
          <>
            <ChartXAxis
              ticks={m.xTicks}
              plot={square}
              title="Measured power (W)"
              fontSize={fontSize}
            />
            <ChartYAxis
              ticks={m.yTicks}
              plot={square}
              title="Estimated power (W)"
              fontSize={fontSize}
            />
            <line
              data-testid="accuracy-reference"
              className="accuracy-scatter__reference"
              x1={reference.x1}
              y1={reference.y1}
              x2={reference.x2}
              y2={reference.y2}
            />
            <text className="accuracy-scatter__reference-label" x={labelX} y={labelY}>
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
          </>
        )
      }}
    </ChartFrame>
  )
}
