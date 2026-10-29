import { useState } from 'react'
import type { ProfileRow } from '@rca/core/profile'
import type { Sport } from '@rca/core/types'
import { SPORT_FORMAT } from '../sports'
import { effortLabel } from '../records'
import { ChartFrame } from './ChartFrame'
import { ChartXAxis } from './ChartXAxis'
import { ChartYAxis } from './ChartYAxis'
import { Crosshair } from './Crosshair'
import {
  diamondPath,
  markerRadii,
  plotSurface,
  sizedOnce,
  tooltipAt,
  tooltipOverlay,
} from './chartInteraction'
import type { AxisTick, ChartSize } from './chartTypes'
import { logScale, linearScale } from './scale'
import { keyOf, scaleNote, scaleOf, signedPercent, tableOf, tooltipOf } from './standOutText'
import { axisFontSize, fitTicks } from './ticks'
import { labelWidthPx, rootFontPx } from './rootFont'
import './ChartSeries.css'
import './StandOutChart.css'

export interface StandOutChartProps {
  sport: Sport
  /** One row per duration, shortest first. */
  rows: readonly ProfileRow[]
}

/** Durations the x axis may label: 5 s up to 60 min. The ones that fit are drawn. */
const TICK_DURATIONS_S = [5, 10, 30, 60, 300, 600, 1200, 1800, 3600]
/** Space kept either side of the first and last point, so that a point on the edge is not cut. */
const EDGE_PAD = 10
const CHART_HEIGHT = 280

interface Layout {
  xs: number[]
  /** The y of each duration's best, its interval's ends, and the zero line. */
  ys: number[]
  lows: number[]
  highs: number[]
  zero: number
  xTicks: AxisTick[]
  yTicks: AxisTick[]
}

function layout(rows: readonly ProfileRow[], size: ChartSize): Layout | null {
  const first = rows[0]
  const last = rows.at(-1)
  if (rows.length < 2 || first === undefined || last === undefined) return null
  const { plot, width } = size
  const x = logScale(
    [first.durationS, last.durationS],
    [plot.left + EDGE_PAD, plot.right - EDGE_PAD],
  )
  const { domain, ticks } = scaleOf(rows)
  const y = linearScale(domain, [plot.bottom, plot.top])
  return {
    xs: rows.map((row) => x(row.durationS)),
    ys: rows.map((row) => y(row.residual * 100)),
    lows: rows.map((row) => y(row.low * 100)),
    highs: rows.map((row) => y(row.high * 100)),
    zero: y(0),
    xTicks: fitTicks(
      TICK_DURATIONS_S.filter((s) => s >= first.durationS && s <= last.durationS).map((s) => ({
        position: x(s),
        label: effortLabel(s),
      })),
      { axis: 'x', width },
    ),
    yTicks: fitTicks(
      ticks.map((value) => ({ position: y(value), label: signedPercent(value / 100) })),
      { axis: 'y', width },
    ),
  }
}

/** Space between a point and the label beside it, in px. */
const LABEL_GAP = 8

/**
 * Where the duration label of a point sits: beside it, to the right, or to the left when the text would
 * run past the plot's edge. The bar runs straight up and down through the point, so the side is clear.
 */
function labelAt(
  x: number,
  y: number,
  text: string,
  right: number,
  rootPx: number,
): { x: number; y: number; anchor: 'start' | 'end' } {
  const fitsRight = x + LABEL_GAP + labelWidthPx(text, rootPx) <= right
  return fitsRight
    ? { x: x + LABEL_GAP, y, anchor: 'start' }
    : { x: x - LABEL_GAP, y, anchor: 'end' }
}

interface MarkProps {
  sport: Sport
  row: ProfileRow
  x: number
  y: number
  r: number
}

/** A point at a duration's residual: filled when it stands out, hollow when it is in line. */
function Mark({ sport, row, x, y, r }: MarkProps) {
  const className = `stand-out__mark ${row.standsOut === null ? 'stand-out__mark--hollow' : 'stand-out__mark--filled'}`
  return SPORT_FORMAT[sport].glyph === 'diamond' ? (
    <path data-testid="stand-out-mark" className={className} d={diamondPath(x, y, r * 1.3)} />
  ) : (
    <circle data-testid="stand-out-mark" className={className} cx={x} cy={y} r={r} />
  )
}

/** The duration a filled point is at, written beside it, since the key says a filled point stands out. */
function StandOutLabel({
  text,
  at,
}: {
  text: string
  at: { x: number; y: number; anchor: 'start' | 'end' }
}) {
  return (
    <text
      data-testid="stand-out-label"
      className="chart-series__label"
      x={at.x}
      y={at.y}
      textAnchor={at.anchor}
      dominantBaseline="central"
    >
      {text}
    </text>
  )
}

const DESCRIPTION =
  'How far each best sits above or below what your other bests predict, one point per duration with its range. Duration is on a log scale. Zero is in line with your other bests.'

/**
 * Where each duration's best sits against what the others predict: a strip with a zero line for "in
 * line with your other bests", and one lollipop per duration, its bar the range. A point that
 * stands out is filled in the sport's colour and shape; one that is in line is hollow.
 */
export function StandOutChart({ sport, rows }: StandOutChartProps) {
  const [active, setActive] = useState<number | null>(null)
  const layoutOf = sizedOnce((size: ChartSize) => layout(rows, size))
  const [rootPx] = useState(rootFontPx)
  return (
    <ChartFrame
      title="Each best against your other bests, by duration"
      description={DESCRIPTION}
      height={CHART_HEIGHT}
      legend={keyOf(sport)}
      note={scaleNote(rows)}
      table={tableOf(rows, scaleNote(rows))}
      surface={(size) => plotSurface(size, layoutOf(size)?.xs ?? null, active, setActive)}
      overlay={(size) =>
        tooltipOverlay(
          size,
          tooltipAt(
            size,
            layoutOf(size)?.xs ?? null,
            active,
            (index, x, y) => {
              const row = rows[index]
              return row ? tooltipOf(row, x, y, sport) : null
            },
            layoutOf(size)?.ys,
          ),
        )
      }
    >
      {(size) => {
        const m = layoutOf(size)
        if (m === null) return null
        const { marker, active: activeR } = markerRadii(size.width)
        const fontSize = axisFontSize(size.width)
        return (
          <>
            <ChartXAxis ticks={m.xTicks} plot={size.plot} title="Duration" fontSize={fontSize} />
            <ChartYAxis
              ticks={m.yTicks}
              plot={size.plot}
              title="Against your other bests"
              fontSize={fontSize}
            />
            <line
              data-testid="stand-out-zero"
              className="stand-out__zero"
              x1={size.plot.left}
              x2={size.plot.right}
              y1={m.zero}
              y2={m.zero}
            />
            {active !== null && m.xs[active] !== undefined ? (
              <Crosshair x={m.xs[active]} plot={size.plot} />
            ) : null}
            {rows.map((row, i) => (
              <g key={row.durationS} data-sport={sport}>
                <line
                  data-testid="stand-out-bar"
                  className="stand-out__bar"
                  x1={m.xs[i]}
                  x2={m.xs[i]}
                  y1={m.lows[i]}
                  y2={m.highs[i]}
                />
                <Mark
                  sport={sport}
                  row={row}
                  x={m.xs[i]!}
                  y={m.ys[i]!}
                  r={i === active ? activeR : marker}
                />
                {row.standsOut === null ? null : (
                  <StandOutLabel
                    text={effortLabel(row.durationS)}
                    at={labelAt(
                      m.xs[i]!,
                      m.ys[i]!,
                      effortLabel(row.durationS),
                      size.plot.right,
                      rootPx,
                    )}
                  />
                )}
              </g>
            ))}
          </>
        )
      }}
    </ChartFrame>
  )
}
