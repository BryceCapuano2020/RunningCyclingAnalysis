import { useMemo, useState } from 'react'
import type { FitnessDots } from '@rca/core/history'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { FITNESS_WORDS } from '../fitnessWords'
import { SPORT_FORMAT } from '../sports'
import { ChartFrame } from './ChartFrame'
import { ChartXAxis } from './ChartXAxis'
import { ChartYAxis } from './ChartYAxis'
import { plotSurface, sizedOnce, tooltipAt, tooltipOverlay } from './chartInteraction'
import type { ChartSize } from './chartTypes'
import { useChartHeight } from './chartHeight'
import { fitnessYearsLayout } from './fitnessYearsLayout'
import { atText, axisTitleOf, spansTable, yearTooltip, yearsTable } from './fitnessYearsText'
import { idleFrom } from './idleReadout'
import { linePath } from './paths'
import { PLOT_BOTTOM_WITHOUT_X_TITLE } from './plotBox'
import { axisFontSize } from './ticks'
import './ChartSeries.css'
import './FitnessYearsChart.css'

export interface FitnessYearsChartProps {
  sport: Sport
  /** The sport's steady activities over the whole library, as the fitness card reads them. */
  dots: FitnessDots
  units: UnitSystem
}

/** The narrowest a slip's or rise's shading can be, px, and still carry its word. */
const WORD_ROOM_PX = 34

const SPAN_WORD = { slip: 'Slip', rise: 'Rise' } as const

const upper = (text: string): string => `${text[0]!.toUpperCase()}${text.slice(1)}`

/**
 * Every steady run or ride of the library as a dot: its pace or power at the fitness card's heart rate. A line runs
 * through their median, and the slips and rises the look-back lists are shaded behind them. The dots are one drawing,
 * not a node each, so a library of thousands stays smooth. The keyboard reads one year at a time, and the table
 * holds the same years.
 */
export function FitnessYearsChart({ sport, dots, units }: FitnessYearsChartProps) {
  const [active, setActive] = useState<number | null>(null)
  const height = useChartHeight()
  // The layout is kept between renders, so reading a year does not lay the dots out again.
  const layoutOf = useMemo(
    () => sizedOnce((size: ChartSize) => fitnessYearsLayout(dots, sport, units, size)),
    [dots, sport, units],
  )
  const words = FITNESS_WORDS[sport]
  const last = dots.years.length - 1
  return (
    <ChartFrame
      title="Fitness over the years"
      lede={`${words.output} at ${atText(dots)} on ${words.steadyPlural}`}
      description={`${dots.levels.length} ${words.steadyPlural} from ${dots.years[0]?.year} to ${dots.years[last]?.year}, each ${words.output.toLowerCase()} at ${atText(dots)}, with a line through their median and the slips and rises shaded.`}
      height={height}
      plotBottomMargin={PLOT_BOTTOM_WITHOUT_X_TITLE}
      legend={[
        { label: upper(words.steady), kind: sport, swatch: SPORT_FORMAT[sport].glyph },
        { label: 'Median', kind: sport, swatch: 'line' },
      ]}
      idleReadout={idleFrom(yearTooltip(dots, sport, units, last, 0, 0))}
      table={yearsTable(dots, sport, units)}
      summary={spansTable(dots)}
      surface={(size) => plotSurface(size, layoutOf(size)?.xs ?? null, active, setActive)}
      overlay={(size) =>
        tooltipOverlay(
          size,
          tooltipAt(
            size,
            layoutOf(size)?.xs ?? null,
            active,
            (i, x, y) => yearTooltip(dots, sport, units, i, x, y),
            layoutOf(size)?.ys,
          ),
        )
      }
    >
      {(size) => {
        const m = layoutOf(size)
        if (m === null) return null
        const { plot } = size
        const room = active === null ? undefined : m.rooms[active]
        return (
          <g data-sport={sport}>
            <g className="fitness-years__x">
              <ChartXAxis ticks={m.xTicks} plot={plot} fontSize={axisFontSize(size.width)} />
            </g>
            <ChartYAxis
              ticks={m.yTicks}
              plot={plot}
              title={axisTitleOf(sport, units)}
              fontSize={axisFontSize(size.width)}
            />
            {room === undefined ? null : (
              <rect
                className="fitness-years__year"
                x={room.x0}
                y={plot.top}
                width={Math.max(1, room.x1 - room.x0)}
                height={plot.bottom - plot.top}
              />
            )}
            {m.spans.map((span) => (
              <g key={`${span.kind}-${span.x0}`} data-testid="fitness-span">
                <rect
                  className={`fitness-years__span fitness-years__span--${span.kind}`}
                  x={span.x0}
                  y={plot.top}
                  width={Math.max(2, span.x1 - span.x0)}
                  height={plot.bottom - plot.top}
                />
                {span.x1 - span.x0 >= WORD_ROOM_PX ? (
                  <text
                    className="annot__text annot__text--label"
                    x={span.x0 + 4}
                    y={plot.top + 12}
                  >
                    {SPAN_WORD[span.kind]}
                  </text>
                ) : null}
              </g>
            ))}
            <path
              data-testid="fitness-dots"
              className={`fitness-years__dots fitness-years__dots--${SPORT_FORMAT[sport].glyph}`}
              d={m.dots}
            />
            <path
              data-testid="fitness-median"
              className={`chart-series__line chart-series__line--${sport} fitness-years__median`}
              d={linePath(m.line)}
            />
          </g>
        )
      }}
    </ChartFrame>
  )
}

const EMPTY = 'Add steady runs with heart rate, or rides with power, to see this.'

/** The chart's place when no sport has enough steady activities to draw: its title and one line saying what to add. */
export function FitnessYearsEmpty() {
  return (
    <ChartFrame
      title="Fitness over the years"
      description="No steady runs or rides yet."
      empty={EMPTY}
      table={{ columns: ['Year'], rows: [] }}
    >
      {() => null}
    </ChartFrame>
  )
}
