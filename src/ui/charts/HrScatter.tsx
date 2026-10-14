import { useId, useState } from 'react'
import type { HrCrossCheck, HrPoint, LinearFit, Sport } from '../../core/types'
import { formatWkg } from '../../core/units'
import { ChartFrame } from './ChartFrame'
import { ChartTooltip } from './ChartTooltip'
import { ChartXAxis } from './ChartXAxis'
import { ChartYAxis } from './ChartYAxis'
import type { AxisTick, ChartSize, Point, TooltipContent } from './chartTypes'
import { nearestByPoint, stepActive } from './hover'
import { PlotSurface } from './PlotSurface'
import { linearScale, niceDomain, tickDecimals } from './scale'
import { axisFontSize, fitTicks } from './ticks'
import './HrScatter.css'

export interface HrScatterProps {
  hr: HrCrossCheck
}

const EMPTY =
  'Not enough steady heart-rate data yet. It takes roughly 8 five-minute blocks per sport across a range of efforts'
const SPORT_LABEL: Record<Sport, string> = { run: 'Running', ride: 'Cycling' }
const DOT_R = 4
const ACTIVE_DOT_R = 6
/** Pointer distance, in px, within which a dot counts as hovered. Wider than the dot. */
const HIT_RADIUS = 16

interface SportData {
  sport: Sport
  points: HrPoint[]
  fit: LinearFit
}

interface Dot extends Point {
  sport: Sport
  metabolicWkg: number
  bpm: number
}

interface FitLine {
  sport: Sport
  x1: number
  y1: number
  x2: number
  y2: number
}

interface Layout {
  dots: Dot[]
  fits: FitLine[]
  xTicks: AxisTick[]
  yTicks: AxisTick[]
}

function sportsOf(hr: HrCrossCheck): SportData[] {
  const sports: SportData[] = []
  if (hr.run) sports.push({ sport: 'run', points: hr.run.points, fit: hr.run.fit })
  if (hr.ride) sports.push({ sport: 'ride', points: hr.ride.points, fit: hr.ride.fit })
  return sports
}

/** Slope note when both sports are present; otherwise a note naming the missing sport. */
function noteFor(hr: HrCrossCheck): string | undefined {
  if (hr.run && hr.ride) {
    return `Slopes: running ${hr.run.fit.slope.toFixed(1)} and cycling ${hr.ride.fit.slope.toFixed(1)} bpm per W/kg`
  }
  if (hr.run === null && hr.ride === null) return undefined
  const missing = hr.run === null ? 'running' : 'cycling'
  const shown = missing === 'running' ? 'cycling' : 'running'
  return `Not enough steady heart-rate data for ${missing} yet, so only ${shown} is shown.`
}

function layout(sports: SportData[], size: ChartSize): Layout | null {
  const all = sports.flatMap((data) => data.points)
  if (all.length === 0) return null
  const { plot, width } = size
  const xDomain = niceDomain(
    all.map((point) => point.metabolicPower),
    4,
  )
  const yDomain = niceDomain(
    all.map((point) => point.heartRate),
    4,
  )
  const x = linearScale(xDomain.domain, [plot.left, plot.right])
  const y = linearScale(yDomain.domain, [plot.bottom, plot.top])

  const dots = sports
    .flatMap(({ sport, points }) =>
      points.map((point): Dot => ({
        sport,
        x: x(point.metabolicPower),
        y: y(point.heartRate),
        metabolicWkg: point.metabolicPower,
        bpm: point.heartRate,
      })),
    )
    .sort((a, b) => a.x - b.x)

  // Each fitted line runs across the range of its own sport's data.
  const fits = sports.map(({ sport, points, fit }): FitLine => {
    const xs = points.map((point) => point.metabolicPower)
    const low = Math.min(...xs)
    const high = Math.max(...xs)
    return {
      sport,
      x1: x(low),
      y1: y(fit.intercept + fit.slope * low),
      x2: x(high),
      y2: y(fit.intercept + fit.slope * high),
    }
  })

  return {
    dots,
    fits,
    xTicks: fitTicks(
      xDomain.ticks.map((value) => ({
        position: x(value),
        label: value.toFixed(tickDecimals(xDomain.ticks)),
      })),
      { axis: 'x', width },
    ),
    yTicks: fitTicks(
      yDomain.ticks.map((value) => ({
        position: y(value),
        label: value.toFixed(tickDecimals(yDomain.ticks)),
      })),
      { axis: 'y', width },
    ),
  }
}

function tooltipFor(dot: Dot): TooltipContent {
  return {
    x: dot.x,
    y: dot.y,
    title: SPORT_LABEL[dot.sport],
    rows: [
      { kind: dot.sport, value: formatWkg(dot.metabolicWkg), label: 'Gross metabolic power' },
      { kind: dot.sport, value: `${Math.round(dot.bpm)} bpm`, label: 'Heart rate' },
    ],
  }
}

export function HrScatter({ hr }: HrScatterProps) {
  const sports = sportsOf(hr)
  const clipId = `hr-scatter-clip-${useId().replace(/:/g, '')}`
  const [active, setActive] = useState<number | null>(null)

  const note = noteFor(hr)

  return (
    <ChartFrame
      title="Heart rate against gross metabolic power"
      description="Average heart rate against gross metabolic power for each block of steady effort, with a fitted line for each sport."
      legend={sports.map((data) => ({ label: SPORT_LABEL[data.sport], kind: data.sport }))}
      table={{
        columns: ['Sport', 'Blocks', 'Slope (bpm per W/kg)', 'R squared'],
        rows: sports.map((data) => [
          SPORT_LABEL[data.sport],
          String(data.points.length),
          data.fit.slope.toFixed(1),
          data.fit.r2.toFixed(2),
        ]),
      }}
      empty={sports.length > 0 ? undefined : EMPTY}
      note={note}
      overlay={(size) => {
        const m = layout(sports, size)
        const dot = m && active !== null ? m.dots[active] : undefined
        return (
          <ChartTooltip
            bounds={{ width: size.width, height: size.height }}
            content={dot ? tooltipFor(dot) : null}
            id={size.tooltipId}
          />
        )
      }}
      surface={(size) => {
        const m = layout(sports, size)
        if (m === null) return null
        return (
          <PlotSurface
            size={size}
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
    >
      {(size) => {
        const m = layout(sports, size)
        if (m === null) return null
        const { plot } = size
        const fontSize = axisFontSize(size.width)
        return (
          <>
            <ChartXAxis
              ticks={m.xTicks}
              plot={plot}
              title="Gross metabolic power (W/kg)"
              fontSize={fontSize}
            />
            <ChartYAxis ticks={m.yTicks} plot={plot} title="Heart rate (bpm)" fontSize={fontSize} />
            <clipPath id={clipId}>
              <rect
                x={plot.left}
                y={plot.top}
                width={plot.right - plot.left}
                height={plot.bottom - plot.top}
              />
            </clipPath>
            <g clipPath={`url(#${clipId})`}>
              {m.fits.map((fit) => (
                <line
                  key={fit.sport}
                  data-testid="hr-fit"
                  className={`hr-scatter__fit hr-scatter__fit--${fit.sport}`}
                  x1={fit.x1}
                  y1={fit.y1}
                  x2={fit.x2}
                  y2={fit.y2}
                />
              ))}
              {m.dots.map((dot, i) => (
                <circle
                  key={`${dot.sport}-${i}`}
                  data-testid="hr-dot"
                  data-sport={dot.sport}
                  className={`hr-scatter__dot hr-scatter__dot--${dot.sport}`}
                  cx={dot.x}
                  cy={dot.y}
                  r={i === active ? ACTIVE_DOT_R : DOT_R}
                />
              ))}
            </g>
          </>
        )
      }}
    </ChartFrame>
  )
}
