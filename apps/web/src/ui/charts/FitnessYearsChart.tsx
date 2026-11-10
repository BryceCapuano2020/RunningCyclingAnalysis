import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
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
import { formatNative } from './sportAxis'
import { fitnessYearsLayout, yearAtX } from './fitnessYearsLayout'
import { atText, axisTitleOf, yearTooltip, yearsTable } from './fitnessYearsText'
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
  /** The sport toggle, which the chart puts in its frame's controls row. */
  controls?: ReactNode
  /** Names the chart where the page's own heading is not "Fitness over the years": the sport page's sport. */
  title?: string
  /** The title is the chart's accessible name only, where a heading over it says it. */
  titleHidden?: boolean
  /** The one sentence the chart keeps in its Details, in place of what each dot is. */
  lede?: string
  /** Today's level in the sport's own unit, marked on the plot at the last dot. */
  now?: number | null
  /** A short strip for a sport page's row, with no key: the dots alone. */
  compact?: boolean
  /** The rest of a sport page's section, for the chart's one Details; `onOpen` is called when it opens. */
  extra?: ReactNode
  onOpen?: () => void
}

/** The plot's height in a sport page's strip, px. */
const COMPACT_PLOT_PX = { phone: 130, wide: 170 }

const upper = (text: string): string => `${text[0]!.toUpperCase()}${text.slice(1)}`

/**
 * Every steady run or ride of the library as a dot: its pace or power at the fitness card's heart rate. A line runs
 * through their median. The dots are one drawing,
 * not a node each, so a library of thousands stays smooth. The keyboard reads one year at a time, and the table
 * holds the same years.
 */
export function FitnessYearsChart({
  sport,
  dots,
  units,
  controls,
  title = 'Fitness over the years',
  titleHidden = false,
  lede,
  now = null,
  compact = false,
  extra,
  onOpen,
}: FitnessYearsChartProps) {
  // The year being read belongs to the sport it was read in: the other sport starts with none.
  const [read, setRead] = useState<{ sport: Sport; year: number | null }>({ sport, year: null })
  const active = read.sport === sport ? read.year : null
  const setActive = (year: number | null) => setRead({ sport, year })
  const height = useChartHeight(compact ? COMPACT_PLOT_PX : undefined)
  // The layout is kept between renders, so reading a year does not lay the dots out again.
  const layoutOf = useMemo(
    () => sizedOnce((size: ChartSize) => fitnessYearsLayout(dots, sport, units, size, now)),
    [dots, sport, units, now],
  )
  const words = FITNESS_WORDS[sport]
  const last = dots.years.length - 1
  return (
    <ChartFrame
      title={title}
      titleHidden={titleHidden}
      extra={extra}
      onOpen={onOpen}
      lede={lede ?? `${words.output} at ${atText(dots)} on ${words.steadyPlural}`}
      controls={controls}
      description={`${dots.levels.length} ${words.steadyPlural} from ${dots.years[0]?.year} to ${dots.years[last]?.year}, each ${words.output.toLowerCase()} at ${atText(dots)}, with a line through their median.`}
      height={height}
      plotBottomMargin={PLOT_BOTTOM_WITHOUT_X_TITLE}
      legend={
        compact
          ? undefined
          : [
              { label: upper(words.steady), kind: sport, swatch: SPORT_FORMAT[sport].glyph },
              { label: 'Median', kind: sport, swatch: 'line' },
            ]
      }
      idleReadout={idleFrom(yearTooltip(dots, sport, units, last, 0, 0))}
      table={yearsTable(dots, sport, units)}
      surface={(size) => {
        const layout = layoutOf(size)
        return plotSurface(size, layout?.xs ?? null, active, setActive, (_xs, x) =>
          layout === null ? null : yearAtX(layout.rooms, x),
        )
      }}
      overlay={(size) => {
        const layout = layoutOf(size)
        return tooltipOverlay(
          size,
          tooltipAt(
            size,
            layout?.xs ?? null,
            active,
            (i, x, y) => yearTooltip(dots, sport, units, i, x, y),
            layout?.ys,
          ),
        )
      }}
    >
      {(size) => {
        const m = layoutOf(size)
        if (m === null) return null
        const { plot } = size
        const room = active === null ? undefined : m.rooms[active]
        return (
          <g data-sport={sport}>
            <ChartXAxis
              ticks={m.xTicks}
              plot={plot}
              fontSize={axisFontSize(size.width)}
              grid={false}
            />
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
            {m.now === null || now === null ? null : (
              <g data-testid="fitness-now-mark">
                <line
                  className="fitness-years__now"
                  x1={plot.left}
                  x2={plot.right}
                  y1={m.now.y}
                  y2={m.now.y}
                />
                <text
                  className="annot__text annot__text--label"
                  x={plot.right - 4}
                  y={m.now.y - 4}
                  textAnchor="end"
                >
                  {`Now ${formatNative(sport, now, units)}`}
                </text>
              </g>
            )}
          </g>
        )
      }}
    </ChartFrame>
  )
}
