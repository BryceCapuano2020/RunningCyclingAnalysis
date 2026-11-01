import { useMemo, useState } from 'react'
import type { SportYearCurves } from '@rca/core/history'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { formatDuration } from '@rca/core/units'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import { SPORT_LABEL, SPORT_PLURAL } from '../sports'
import { ChartFrame } from './ChartFrame'
import { ChartXAxis } from './ChartXAxis'
import { ChartYAxis } from './ChartYAxis'
import { Crosshair } from './Crosshair'
import { markerRadii, plotSurface, sizedOnce, tooltipAt, tooltipOverlay } from './chartInteraction'
import type { ChartSize, TooltipContent } from './chartTypes'
import { idleFrom } from './idleReadout'
import { linePath } from './paths'
import { PLOT_BOTTOM_WITHOUT_X_TITLE } from './plotBox'
import { formatNative } from './sportAxis'
import { SportMark } from './SportMark'
import { axisFontSize } from './ticks'
import { useChartHeight } from './chartHeight'
import {
  curveCell,
  curvesAxisTitle,
  curvesDescription,
  curvesTitle,
  isCrowded,
  labelledYears,
  yearCurvesModel,
} from './yearCurvesModel'
import type { YearCurvesModel, YearLine } from './yearCurvesModel'
import { endLabelRoom, yearCurvesLayout } from './yearCurvesLayout'
import type { LineLayout } from './yearCurvesLayout'
import './ChartSeries.css'
import './YearCurvesChart.css'

export interface YearCurvesChartProps {
  sport: Sport
  /** The sport's best curve in each calendar year (core's `yearCurves`). */
  curves: SportYearCurves
  units: UnitSystem
}

/** The faintest an older year's line is drawn, and how much the newest of them gains over it. */
const OLDEST_OPACITY = 0.4
const OPACITY_RANGE = 0.35

/** A duration's tooltip: the value of each labelled year, and whether the 20 minute best was hard. */
function tooltipFor(
  model: YearCurvesModel,
  units: UnitSystem,
  i: number,
  x: number,
  y: number,
): TooltipContent | null {
  const durationS = model.durations[i]
  if (durationS === undefined) return null
  const named = new Set(labelledYears(model))
  const rows = model.lines
    .filter((line) => named.has(line.year) && line.values[i] !== null)
    .reverse()
    .map((line) => ({
      kind: model.sport,
      label: String(line.year),
      value: formatNative(model.sport, line.values[i]!, units),
      note: noteOf(model, line, i),
    }))
  return { x, y, title: formatDuration(durationS), rows }
}

/** How a line is drawn: named (heavier), grey, in colour at its age's opacity and labelled, or in colour at its age's opacity. */
type LineKind = 'named' | 'grey' | 'coloured' | 'faint'

const kindOf = (line: LineLayout): LineKind =>
  line.named ? 'named' : line.grey ? 'grey' : line.labelled ? 'coloured' : 'faint'

const TEST_ID: Record<LineKind, string> = {
  named: 'year-curve-named',
  grey: 'year-curve-grey',
  coloured: 'year-curve-coloured',
  faint: 'year-curve',
}
const LAYER: Record<LineKind, number> = { grey: 0, faint: 1, coloured: 1, named: 2 }
const layerOf = (line: LineLayout): number => LAYER[kindOf(line)]

/** What a value says beside it: that it is estimated, and that the 20 minute best was not confirmed hard. */
function noteOf(model: YearCurvesModel, line: YearLine, i: number): string | undefined {
  const parts = [
    line.estimated[i] ? 'Estimated' : null,
    model.durations[i] === HEADLINE_DURATION_S && !line.hard ? 'Not confirmed hard' : null,
  ].filter((part) => part !== null)
  return parts.length === 0 ? undefined : parts.join(', ')
}

/**
 * A sport's best curve of every calendar year on one set of axes: duration on a log scale and the pace or power of the sport
 * page's own curve. Older years are fainter on one ramp; the newest year and the best year are in the sport's colour and
 * named at their ends, with a mark at the 20 minute best, hollow when heart rate does not show it was hard. The title is the
 * finding about the 20 minute best.
 */
export function YearCurvesChart({ sport, curves, units }: YearCurvesChartProps) {
  const model = useMemo(() => yearCurvesModel(sport, curves), [sport, curves])
  const [active, setActive] = useState<number | null>(null)
  const height = useChartHeight()
  const layoutOf = sizedOnce((size: ChartSize) =>
    model === null ? null : yearCurvesLayout(model, units, size),
  )
  if (model === null || model.lines.length < 2) {
    return (
      <ChartFrame
        title={`${SPORT_LABEL[sport]} best curve by year`}
        description={`Your ${SPORT_PLURAL[sport]}' best efforts, one line for each year.`}
        empty={`Add ${SPORT_PLURAL[sport]} from more than one year to compare them`}
        table={{ columns: [], rows: [] }}
      >
        {() => null}
      </ChartFrame>
    )
  }
  const title = curvesTitle(model)
  const axisTitle = curvesAxisTitle(sport, units)
  const idle = model.focus ?? model.durations.length - 1
  return (
    <ChartFrame
      title={title}
      description={curvesDescription(sport)}
      height={height}
      plotBottomMargin={PLOT_BOTTOM_WITHOUT_X_TITLE}
      plotRightMargin={endLabelRoom}
      legend={[]}
      keyNote={isCrowded(model) ? 'Other years are grey' : 'Older years are fainter'}
      idleReadout={idleFrom(tooltipFor(model, units, idle, 0, 0), 'Best')}
      table={{
        caption: `${SPORT_LABEL[sport]} best at each duration, by year. At least marks a 20 minute best not confirmed hard.`,
        columns: ['Year', ...model.durations.map(formatDuration)],
        rows: [...model.lines]
          .reverse()
          .map((line) =>
            [String(line.year)].concat(
              model.durations.map((_, i) => curveCell(model, line, i, units)),
            ),
          ),
      }}
      surface={(size) => plotSurface(size, layoutOf(size)?.xs ?? null, active, setActive)}
      overlay={(size) =>
        tooltipOverlay(
          size,
          tooltipAt(size, layoutOf(size)?.xs ?? null, active, (i, x, y) =>
            tooltipFor(model, units, i, x, y),
          ),
        )
      }
    >
      {(size) => {
        const m = layoutOf(size)
        if (m === null) return null
        const fontSize = axisFontSize(size.width)
        const { active: activeR } = markerRadii(size.width)
        // The grey years go down first, then the other years in colour, and the named years last, so they lie over the rest.
        const drawn = [...m.lines].sort((a, b) => layerOf(a) - layerOf(b))
        return (
          <>
            <ChartXAxis ticks={m.xTicks} plot={size.plot} fontSize={fontSize} />
            <ChartYAxis ticks={m.yTicks} plot={size.plot} title={axisTitle} fontSize={fontSize} />
            {active === null ? null : <Crosshair x={m.xs[active]!} plot={size.plot} />}
            {drawn.map((line) => (
              <path
                key={line.year}
                data-testid={TEST_ID[kindOf(line)]}
                data-year={line.year}
                className={
                  line.named
                    ? 'year-curve year-curve--named'
                    : line.grey
                      ? 'year-curve year-curve--grey'
                      : 'year-curve'
                }
                data-sport={sport}
                strokeOpacity={
                  line.named || line.grey
                    ? undefined
                    : OLDEST_OPACITY + OPACITY_RANGE * line.recency
                }
                d={linePath(line.points)}
              />
            ))}
            {m.headline.map(({ year, hollow, point }) => (
              <SportMark
                key={year}
                sport={sport}
                x={point.x}
                y={point.y}
                r={activeR}
                hollow={hollow}
                testId="year-curve-mark"
              />
            ))}
            {m.labels.map((label) => (
              <text
                key={label.year}
                data-testid="year-curve-label"
                className="chart-series__label"
                x={label.x}
                y={label.y}
                dominantBaseline="central"
              >
                {label.year}
              </text>
            ))}
          </>
        )
      }}
    </ChartFrame>
  )
}
