import { useState } from 'react'
import type { LiftHistoryPoint } from '@rca/core/lift'
import type { UnitSystem } from '@rca/core/units'
import { formatLoad } from '@rca/core/units'
import { ChartFrame } from '../charts/ChartFrame'
import { ChartXAxis } from '../charts/ChartXAxis'
import { ChartYAxis } from '../charts/ChartYAxis'
import { Crosshair } from '../charts/Crosshair'
import {
  markerRadii,
  plotSurface,
  sizedOnce,
  tooltipAt,
  tooltipOverlay,
} from '../charts/chartInteraction'
import type { ChartSize, TooltipContent } from '../charts/chartTypes'
import { useChartHeight } from '../charts/chartHeight'
import { idleFrom } from '../charts/idleReadout'
import { bandPath, linePath } from '../charts/paths'
import { PLOT_BOTTOM_WITHOUT_X_TITLE } from '../charts/plotBox'
import { axisFontSize } from '../charts/ticks'
import { shortDateWithYear } from '../charts/trendTicks'
import { liftChartLayout, utcMsOf } from './liftChartLayout'
import { loadParts, rangeText } from './liftEntries'
import '../charts/ChartSeries.css'
import './LiftChart.css'

export interface LiftChartProps {
  /** The lift's name with its equipment, which names the chart. */
  title: string
  history: readonly LiftHistoryPoint[]
  units: UnitSystem
}

/**
 * One lift's estimated one-rep max at each session, with its 80% range as a band. The estimate is a ring (it is not a lift
 * the athlete did), and the table gives every session's estimate, range and floor in words and numbers.
 */
export function LiftChart({ title, history, units }: LiftChartProps) {
  const [active, setActive] = useState<number | null>(null)
  const height = useChartHeight()
  const layoutOf = sizedOnce((size: ChartSize) => liftChartLayout(history, units, size))
  const unit = loadParts(0, units).unit
  const tooltipFor = (index: number, x: number, y: number): TooltipContent | null => {
    const p = history[index]
    if (p === undefined) return null
    return {
      x,
      y,
      title: shortDateWithYear(utcMsOf(p.date)),
      rows: [
        {
          kind: 'neutral',
          label: 'One-rep max',
          value: formatLoad(p.point, units),
          note: `80% range ${rangeText(p.low, p.high, units)}; floor ${formatLoad(p.floor, units)}`,
        },
      ],
    }
  }
  return (
    <ChartFrame
      title={`${title}, one-rep max over time`}
      titleHidden
      description={`The estimated one-rep max at each session, in ${unit}, with its 80% range as a band.`}
      plotBottomMargin={PLOT_BOTTOM_WITHOUT_X_TITLE}
      height={height}
      idleReadout={idleFrom(tooltipFor(history.length - 1, 0, 0))}
      empty={history.length < 2 ? 'A line needs two sessions with an estimate' : undefined}
      table={{
        columns: ['Date', 'One-rep max', '80% range', 'Floor'],
        rows: history.map((p) => [
          shortDateWithYear(utcMsOf(p.date)),
          formatLoad(p.point, units),
          rangeText(p.low, p.high, units),
          formatLoad(p.floor, units),
        ]),
        caption: `${title}: the estimated one-rep max at each session with its 80% range and floor.`,
      }}
      surface={(size) => plotSurface(size, layoutOf(size)?.xs ?? null, active, setActive)}
      overlay={(size) =>
        tooltipOverlay(
          size,
          tooltipAt(
            size,
            layoutOf(size)?.xs ?? null,
            active,
            tooltipFor,
            layoutOf(size)?.line.map((p) => p.y),
          ),
        )
      }
    >
      {(size) => {
        const m = layoutOf(size)
        if (m === null) return null
        const { marker } = markerRadii(size.width)
        const fontSize = axisFontSize(size.width)
        return (
          <g data-sport="lift">
            <ChartXAxis ticks={m.xTicks} plot={size.plot} fontSize={fontSize} />
            <ChartYAxis ticks={m.yTicks} plot={size.plot} title={unit} fontSize={fontSize} />
            {active === null ? null : <Crosshair x={m.xs[active]!} plot={size.plot} />}
            <path
              data-testid="lift-band"
              className="lift-chart__band"
              d={bandPath(m.upper, m.lower)}
            />
            <path data-testid="lift-line" className="lift-chart__line" d={linePath(m.line)} />
            {m.line.map((p, i) => (
              <circle
                key={history[i]!.date}
                data-testid="lift-point"
                className="lift-chart__ring"
                cx={p.x}
                cy={p.y}
                r={i === active ? marker + 2 : marker}
              />
            ))}
          </g>
        )
      }}
    </ChartFrame>
  )
}
