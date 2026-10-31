import type { HindsightFitness } from '@rca/core/lookback'
import { monthYear } from '@rca/core/lookback'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { ChartFrame } from './ChartFrame'
import { ChartXAxis } from './ChartXAxis'
import { ChartYAxis } from './ChartYAxis'
import { bandPath, linePath } from './paths'
import { PLOT_BOTTOM_WITHOUT_X_TITLE } from './plotBox'
import { FITNESS_WORDS } from '../fitnessWords'
import { axisTitle, formatNative, nativeLabel } from './sportAxis'
import { axisFontSize } from './ticks'
import { yearsLayout } from './yearsChartLayout'
import './ChartSeries.css'
import './YearsChart.css'

export interface YearsChartProps {
  sport: Sport
  years: HindsightFitness
  /** The heart rate (bpm) or null the level is read at, for the chart's name. */
  referenceHr: number | null
  units: UnitSystem
}

/** What an episode is called on the chart and in the table, one word, so the mark is shape and word, not colour. */
const SPAN_WORD: Record<HindsightFitness['episodes'][number]['kind'], string> = {
  'slip-back': 'Slip',
  'slip-partly-back': 'Slip',
  'slip-open': 'Slip',
  improvement: 'Rise',
  'after-break': 'Break',
}

/** The narrowest an episode's span can be, px, and still carry its word. */
const WORD_ROOM_PX = 34

const upper = (text: string) => `${text[0]!.toUpperCase()}${text.slice(1)}`

const OUTPUT: Record<Sport, string> = { run: 'Pace', ride: 'Power' }

/**
 * The level over the years the look-back tells, as plateaus: a step line with the 90% range of each plateau as a band,
 * and the episodes as shaded spans with their word. The table twin lists the plateaus. Drawn only when opened, with the
 * section that holds it.
 */
export function YearsChart({ sport, years, referenceHr, units }: YearsChartProps) {
  const at = referenceHr === null ? 'the same heart rate' : `${referenceHr} bpm`
  const name = `${OUTPUT[sport]} at ${at} over the years`
  return (
    <ChartFrame
      plotBottomMargin={PLOT_BOTTOM_WITHOUT_X_TITLE}
      title={name}
      description={`${nativeLabel(sport)} at ${at} as plateaus from ${monthYear(years.fromMs)} to ${monthYear(years.toMs)}, each with its 90% range, and the slips and rises between them.`}
      table={{
        columns: [
          'Period',
          nativeLabel(sport),
          '90% range',
          upper(FITNESS_WORDS[sport].steadyPlural),
        ],
        rows: years.levels.map((l) => [
          `${monthYear(l.fromMs)} to ${monthYear(l.toMs)}`,
          formatNative(sport, l.value, units),
          `${formatNative(sport, l.low, units)} to ${formatNative(sport, l.high, units)}`,
          String(l.runs),
        ]),
        caption: `${OUTPUT[sport]} at ${at} by plateau, from ${monthYear(years.fromMs)} to ${monthYear(years.toMs)}.`,
        textColumns: [0],
        phoneHidden: [3],
      }}
      empty={years.levels.length < 2 ? 'Not enough plateaus to draw' : undefined}
    >
      {(size) => {
        const m = yearsLayout(years, sport, units, size)
        if (m === null) return null
        const { plot } = size
        return (
          <g data-sport={sport}>
            <ChartXAxis ticks={m.xTicks} plot={plot} fontSize={axisFontSize(size.width)} />
            <ChartYAxis
              ticks={m.yTicks}
              plot={plot}
              title={axisTitle(sport, units)}
              fontSize={axisFontSize(size.width)}
            />
            {m.spans.map((span) => (
              <g key={`${span.kind}-${span.x0}`} data-testid="years-span">
                <rect
                  className={`years-chart__span years-chart__span--${span.kind}`}
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
              data-testid="years-band"
              className="chart-series__area chart-series__area--trend"
              d={bandPath(m.upper, m.lower)}
            />
            <path
              data-testid="years-line"
              className={`chart-series__line chart-series__line--${sport}`}
              d={linePath(m.line)}
            />
          </g>
        )
      }}
    </ChartFrame>
  )
}
