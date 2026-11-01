import { useState } from 'react'
import type { IntensityRow } from '@rca/core/history'
import type { Sport } from '@rca/core/types'
import { SPORT_PLURAL } from '../sports'
import { ChartFrame } from './ChartFrame'
import { ChartXAxis } from './ChartXAxis'
import { ChartYAxis } from './ChartYAxis'
import { Crosshair } from './Crosshair'
import { plotSurface, sizedOnce, tooltipAt, tooltipOverlay } from './chartInteraction'
import type { ChartSize } from './chartTypes'
import { useChartHeight } from './chartHeight'
import { idleFrom } from './idleReadout'
import { keyOf, intensityLayout } from './intensityByYearLayout'
import { intensityTable, intensityTitle, intensityTooltip } from './intensityByYearText'
import { PLOT_BOTTOM_WITHOUT_X_TITLE } from './plotBox'
import { axisFontSize } from './ticks'
import './IntensityByYearChart.css'

export interface IntensityByYearChartProps {
  /** One row for each calendar year of the library, first to last. */
  years: readonly IntensityRow[]
  /** The sport whose bars are drawn. */
  sport: Sport
}

const DESCRIPTION =
  'One bar a year, split into the share of heart-rate time in easy, moderate and hard zones.'
const NOTE = "Heart rate in today's zones, with set-aside readings left out."

/**
 * Each year's heart-rate time for one sport, as one bar of 100%, split into easy, moderate and hard. The title is the
 * finding (the hardest year), or the measure when there is none. The table gives each year's shares, time and count.
 */
export function IntensityByYearChart({ years, sport }: IntensityByYearChartProps) {
  const [active, setActive] = useState<number | null>(null)
  const height = useChartHeight()
  const layoutOf = sizedOnce((size: ChartSize) => intensityLayout(years, sport, size))
  const timed = years.some((row) => row.sports[sport].seconds > 0)
  const tooltipFor = (i: number, x: number, y: number) => intensityTooltip(years, sport, i, x, y)
  return (
    <ChartFrame
      title={intensityTitle(years, sport)}
      description={DESCRIPTION}
      height={height}
      plotBottomMargin={PLOT_BOTTOM_WITHOUT_X_TITLE}
      note={NOTE}
      empty={
        timed
          ? undefined
          : `Add ${SPORT_PLURAL[sport]} with a heart rate to see each year's intensity.`
      }
      idleReadout={idleFrom(tooltipFor(years.length - 1, 0, 0))}
      table={intensityTable(years, sport)}
      surface={(size) => plotSurface(size, layoutOf(size)?.xs ?? null, active, setActive)}
      overlay={(size) =>
        tooltipOverlay(
          size,
          tooltipAt(size, layoutOf(size)?.xs ?? null, active, tooltipFor, layoutOf(size)?.ys),
        )
      }
    >
      {(size) => {
        const m = layoutOf(size)
        if (m === null) return null
        const fontSize = axisFontSize(size.width)
        return (
          <>
            <g className="intensity-chart__x">
              <ChartXAxis ticks={m.xTicks} plot={size.plot} fontSize={fontSize} />
            </g>
            <ChartYAxis ticks={m.yTicks} plot={size.plot} fontSize={fontSize} />
            {keyOf(size.plot).map((slot) => (
              <g key={slot.band} className="intensity-key">
                <rect
                  className="intensity-key__chip"
                  data-band={slot.band}
                  data-sport={sport}
                  x={slot.chipX}
                  y={slot.chipY}
                  width={slot.chip}
                  height={slot.chip}
                  rx={2}
                />
                <text className="intensity-key__label" x={slot.textX} y={slot.textY}>
                  {slot.label}
                </text>
              </g>
            ))}
            {active === null ? null : <Crosshair x={m.xs[active]!} plot={size.plot} />}
            {m.bars.flatMap((bar, i) =>
              bar.segments.map((segment) => (
                <rect
                  key={`${years[i]?.year}-${segment.band}`}
                  data-testid="intensity-band"
                  data-band={segment.band}
                  data-sport={sport}
                  className="intensity-band"
                  x={bar.x}
                  y={segment.y}
                  width={bar.width}
                  height={segment.height}
                />
              )),
            )}
          </>
        )
      }}
    </ChartFrame>
  )
}
