import { useId, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { HrCrossCheck } from '@rca/core/types'
import { ENERGY_RATE_UNIT } from '@rca/core/units'
import { keyByContent } from '../contentKeys'
import { SPORT_LABEL } from '../sports'
import { ChartFrame } from './ChartFrame'
import type { ChartLegendEntry } from './ChartLegend'
import { diamondPath } from './chartInteraction'
import { ChartTooltip } from './ChartTooltip'
import { ChartXAxis } from './ChartXAxis'
import { ChartYAxis } from './ChartYAxis'
import type { ChartSize } from './chartTypes'
import { nearestByPoint, stepActive } from './hover'
import { PlotSurface } from './PlotSurface'
import {
  type Layout,
  descriptionFor,
  emptyTextFor,
  layoutCache,
  noteFor,
  plotted,
  sportsOf,
  thinningNote,
  tooltipFor,
} from './hrScatterModel'
import { axisFontSize } from './ticks'
import './HrScatter.css'

export interface HrScatterProps {
  hr: HrCrossCheck
  /**
   * False while the rides wait for a weight: then only the running blocks are drawn, and the chart,
   * its legend, its tables and its description name running alone.
   */
  includeRides?: boolean
}

const DOT_R = 4
const ACTIVE_DOT_R = 6

/** Pointer distance, in px, within which a dot counts as hovered. Wider than the dot. */
const HIT_RADIUS = 16

function surfaceOf(
  size: ChartSize,
  layoutFor: (size: ChartSize) => Layout | null,
  active: number | null,
  setActive: (index: number | null) => void,
): ReactNode {
  const m = layoutFor(size)
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
}

function overlayOf(
  size: ChartSize,
  layoutFor: (size: ChartSize) => Layout | null,
  active: number | null,
): ReactNode {
  const m = layoutFor(size)
  const dot = m && active !== null ? m.dots[active] : undefined
  return (
    <ChartTooltip
      bounds={{ width: size.width, height: size.height, plotTop: size.plot.top }}
      content={dot ? tooltipFor(dot) : null}
      id={size.tooltipId}
    />
  )
}

export function HrScatter({ hr, includeRides = true }: HrScatterProps) {
  const sports = useMemo(() => sportsOf(hr, includeRides), [hr, includeRides])
  const drawn = useMemo(() => sports.map((data) => data.sport), [sports])
  const blocks = useMemo(() => plotted(sports), [sports])
  const layoutFor = useMemo(() => layoutCache(sports, blocks.blocks), [sports, blocks])
  const clipId = `hr-scatter-clip-${useId().replace(/:/g, '')}`
  const [active, setActive] = useState<number | null>(null)

  const thinned = blocks.blocks.length < blocks.total
  const note = [
    noteFor(hr, drawn),
    thinned ? thinningNote(blocks.total, blocks.blocks.length) : null,
  ]
    .filter((line): line is string => line !== null)
    .join(' ')

  return (
    <ChartFrame
      title="Heart rate against energy rate"
      description={descriptionFor(drawn)}
      legend={sports.map((data): ChartLegendEntry => ({
        label: SPORT_LABEL[data.sport],
        kind: data.sport,
        swatch: data.sport === 'ride' ? 'diamond' : 'dot',
      }))}
      summary={{
        caption: 'Summary by sport',
        columns: ['Sport', 'Blocks', `Slope (bpm per ${ENERGY_RATE_UNIT})`, 'R squared'],
        rows: sports.map((data) => [
          SPORT_LABEL[data.sport],
          String(data.points.length),
          data.fit.slope.toFixed(1),
          data.fit.r2.toFixed(2),
        ]),
      }}
      table={{
        caption: 'Plotted blocks',
        columns: ['Sport', `Energy rate (${ENERGY_RATE_UNIT})`, 'Heart rate (bpm)'],
        rows: blocks.blocks.map(({ sport, point }) => [
          SPORT_LABEL[sport],
          point.metabolicPower.toFixed(1),
          String(Math.round(point.heartRate)),
        ]),
      }}
      empty={sports.length > 0 ? undefined : emptyTextFor(includeRides)}
      note={note === '' ? undefined : note}
      overlay={(size) => overlayOf(size, layoutFor, active)}
      surface={(size) => surfaceOf(size, layoutFor, active, setActive)}
    >
      {(size) => {
        const m = layoutFor(size)
        if (m === null) return null
        const { plot } = size
        const fontSize = axisFontSize(size.width)
        return (
          <>
            <ChartXAxis
              ticks={m.xTicks}
              plot={plot}
              title={`Energy rate (${ENERGY_RATE_UNIT})`}
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
              {keyByContent(m.dots, (dot) => `${dot.sport}:${dot.bpm}:${dot.metabolicWkg}`).map(
                ({ key, item: dot, index: i }) => {
                  const r = i === active ? ACTIVE_DOT_R : DOT_R
                  const className = `hr-scatter__dot hr-scatter__dot--${dot.sport}`
                  // Rides are diamonds, so the two sports differ in shape as well as colour.
                  return dot.sport === 'ride' ? (
                    <path
                      key={key}
                      data-testid="hr-dot"
                      data-sport="ride"
                      data-shape="diamond"
                      className={className}
                      d={diamondPath(dot.x, dot.y, r)}
                    />
                  ) : (
                    <circle
                      key={key}
                      data-testid="hr-dot"
                      data-sport="run"
                      data-shape="circle"
                      className={className}
                      cx={dot.x}
                      cy={dot.y}
                      r={r}
                    />
                  )
                },
              )}
            </g>
          </>
        )
      }}
    </ChartFrame>
  )
}
