import { useState } from 'react'
import { ChartFrame } from './ChartFrame'
import { ChartXAxis } from './ChartXAxis'
import { ChartYAxis } from './ChartYAxis'
import { Crosshair } from './Crosshair'
import { isHollow, titleOf } from './balanceYears'
import type { YearView } from './balanceYears'
import { yearsLayout } from './balanceYearsLayout'
import { DESCRIPTION, idleOf, legendOf, tableOf, tooltipFor } from './balanceYearsText'
import { markerRadii, plotSurface, sizedOnce, tooltipAt, tooltipOverlay } from './chartInteraction'
import type { ChartSize } from './chartTypes'
import { useChartHeight } from './chartHeight'
import { gappedBandPath, linePath } from './paths'
import { PLOT_BOTTOM_WITHOUT_X_TITLE } from './plotBox'
import { axisFontSize } from './ticks'
import './ChartSeries.css'
import './BalanceOverYearsChart.css'

export interface BalanceOverYearsChartProps {
  /** One view for each calendar year from the first with a best to the last, with at least one grade among them. */
  views: readonly YearView[]
}

/**
 * Each sport's age grade of the best 20 minutes in every calendar year, on one scale from 0 to 100, titled by who led.
 * A ride is estimated, so its range is a band. A dot is solid for a best the gate found hard (or could not judge),
 * hollow for one that was not all-out.
 */
export function BalanceOverYearsChart({ views }: BalanceOverYearsChartProps) {
  const [active, setActive] = useState<number | null>(null)
  const height = useChartHeight()
  const layoutOf = sizedOnce((size: ChartSize) => yearsLayout(views, size))

  return (
    <ChartFrame
      title={titleOf(views)}
      description={DESCRIPTION}
      height={height}
      plotBottomMargin={PLOT_BOTTOM_WITHOUT_X_TITLE}
      legend={legendOf(views)}
      idleReadout={idleOf(views)}
      table={tableOf(views)}
      surface={(size) => plotSurface(size, layoutOf(size)?.xs ?? null, active, setActive)}
      overlay={(size) =>
        tooltipOverlay(
          size,
          tooltipAt(
            size,
            layoutOf(size)?.xs ?? null,
            active,
            (i, x, y) => tooltipFor(views, i, x, y),
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
            <g className="balance-years__x">
              <ChartXAxis ticks={m.xTicks} plot={size.plot} fontSize={fontSize} />
            </g>
            <ChartYAxis ticks={m.yTicks} plot={size.plot} title="Age grade" fontSize={fontSize} />
            {active === null ? null : <Crosshair x={m.xs[active]!} plot={size.plot} />}
            {m.marks
              .filter((marks) => marks.ranged)
              .map((marks) => (
                <path
                  key={marks.sport}
                  data-testid="years-band"
                  data-sport={marks.sport}
                  className={`chart-series__band--${marks.sport}`}
                  d={gappedBandPath(marks.high, marks.low)}
                />
              ))}
            {m.whiskers.map((whisker) => (
              <line
                key={`${whisker.sport}-${whisker.x}`}
                data-testid="years-whisker"
                data-sport={whisker.sport}
                className="balance-years__whisker"
                x1={whisker.x}
                x2={whisker.x}
                y1={whisker.top}
                y2={whisker.bottom}
              />
            ))}
            {/* The first sport is the recorded one, so it is drawn last, over the estimate and its band. */}
            {[...m.marks].reverse().map((marks) => (
              <g key={marks.sport}>
                <path
                  data-testid="years-line"
                  data-sport={marks.sport}
                  className={`chart-series__line chart-series__line--${marks.sport}`}
                  d={linePath(marks.centre)}
                />
                {marks.centre.map((point, i) => {
                  const each = views[i]?.grades[marks.sport]
                  if (point === null || each === undefined) return null
                  const hollow = isHollow(each)
                  return (
                    <circle
                      key={point.x}
                      data-testid="years-dot"
                      data-sport={marks.sport}
                      data-hollow={hollow}
                      className={
                        hollow
                          ? `chart-series__ring--${marks.sport}`
                          : 'chart-series__marker balance-years__dot'
                      }
                      cx={point.x}
                      cy={point.y}
                      r={i === active ? activeR : marker}
                    />
                  )
                })}
              </g>
            ))}
          </>
        )
      }}
    </ChartFrame>
  )
}
