import { useState } from 'react'
import type { LiftWeek } from '@rca/core/lift'
import type { UnitSystem } from '@rca/core/units'
import { formatLoad } from '@rca/core/units'
import { plural } from '../components/plural'
import { ChartFrame } from '../charts/ChartFrame'
import { ChartXAxis } from '../charts/ChartXAxis'
import { ChartYAxis } from '../charts/ChartYAxis'
import { Crosshair } from '../charts/Crosshair'
import { plotSurface, sizedOnce, tooltipAt, tooltipOverlay } from '../charts/chartInteraction'
import type { ChartSize, TooltipContent } from '../charts/chartTypes'
import { useChartHeight } from '../charts/chartHeight'
import { idleFrom } from '../charts/idleReadout'
import { PLOT_BOTTOM_WITHOUT_X_TITLE } from '../charts/plotBox'
import { axisFontSize } from '../charts/ticks'
import { shortDate } from '../charts/trendTicks'
import { utcMsOf } from './liftChartLayout'
import { REGIONS, setsOf, weeklyLoadLayout } from './weeklyLoadLayout'
import './LiftChart.css'

const REGION_NAME = { upper: 'Upper', lower: 'Lower', other: 'Other' } as const

/** The week's name: its Monday. */
const weekName = (week: LiftWeek) => `Week of ${shortDate(utcMsOf(week.weekStart))}`

/** The working sets of each week, its hard sets and its volume by region, in the tooltip and the table. */
export function WeeklyLoadChart({
  weeks,
  units,
}: {
  weeks: readonly LiftWeek[]
  units: UnitSystem
}) {
  const [active, setActive] = useState<number | null>(null)
  const height = useChartHeight()
  const layoutOf = sizedOnce((size: ChartSize) => weeklyLoadLayout(weeks, size))
  const hardOf = (week: LiftWeek) => REGIONS.reduce((n, r) => n + week.regions[r].hardSets, 0)
  const tooltipFor = (index: number, x: number, y: number): TooltipContent | null => {
    const week = weeks[index]
    if (week === undefined) return null
    return {
      x,
      y,
      title: weekName(week),
      rows: [
        {
          kind: 'neutral',
          label: 'Working sets',
          value: String(setsOf(week)),
          note: `${plural(hardOf(week), 'hard set')}`,
        },
        ...REGIONS.filter((r) => week.regions[r].workingSets > 0).map((r) => ({
          kind: 'neutral' as const,
          label: REGION_NAME[r],
          value: plural(week.regions[r].workingSets, 'set'),
          note: `${week.regions[r].hardSets} hard · ${formatLoad(week.regions[r].volumeKg, units)}`,
        })),
      ],
    }
  }
  return (
    <ChartFrame
      title="Weekly lifting load"
      titleHidden
      description="Bars of the working sets lifted each week."
      plotBottomMargin={PLOT_BOTTOM_WITHOUT_X_TITLE}
      height={height}
      idleReadout={idleFrom(tooltipFor(weeks.length - 1, 0, 0))}
      table={{
        columns: ['Week of', 'Working sets', 'Hard sets', 'Upper', 'Lower', 'Other'],
        rows: weeks.map((week) => [
          shortDate(utcMsOf(week.weekStart)),
          String(setsOf(week)),
          String(hardOf(week)),
          ...REGIONS.map((r) => formatLoad(week.regions[r].volumeKg, units)),
        ]),
        caption:
          'Working sets and hard sets each week, and the volume lifted in each region. Hard sets are RPE 7 or more.',
      }}
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
          <g data-sport="lift">
            <ChartXAxis ticks={m.xTicks} plot={size.plot} fontSize={fontSize} />
            <ChartYAxis ticks={m.yTicks} plot={size.plot} title="Sets" fontSize={fontSize} />
            {active === null ? null : <Crosshair x={m.xs[active]!} plot={size.plot} />}
            {m.bars.map((bar, i) =>
              bar.height > 0 ? (
                <rect
                  key={weeks[i]!.weekStart}
                  data-testid="load-bar"
                  className="lift-chart__bar"
                  x={bar.x}
                  y={bar.y}
                  width={bar.width}
                  height={bar.height}
                />
              ) : null,
            )}
          </g>
        )
      }}
    </ChartFrame>
  )
}
