import { useMemo, useState } from 'react'
import type { Curve, Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { SPORT_FORMAT, SPORT_PLURAL } from '../sports'
import { sharedSourceOf } from './activityText'
import { carriedSpans, strokeSplit } from './carriedStretches'
import { ChartAnnotations } from './ChartAnnotations'
import { ChartFrame } from './ChartFrame'
import type { ChartLegendEntry } from './ChartLegend'
import { ChartXAxis } from './ChartXAxis'
import { ChartYAxis } from './ChartYAxis'
import { markerRadii, plotSurface, sizedOnce, tooltipAt, tooltipOverlay } from './chartInteraction'
import type { ChartSize } from './chartTypes'
import { Crosshair } from './Crosshair'
import { captionOf, columnsOf, tableRow } from './curveTable'
import type { View } from './curveTable'
import { areaPath, linePath } from './paths'
import { axisTitle } from './sportAxis'
import { curveMarks, noEffortLabel } from './sportCurveAnnotations'
import { keyOf } from './sportCurveKey'
import { curveTakeaway } from './sportCurveTakeaway'
import {
  buildRows,
  emphasisIndex,
  isRecordDuration,
  layout,
  startText,
  titleOf,
  tooltipFor,
} from './sportCurveModel'
import type { ThresholdLine } from './sportCurveModel'
import { axisFontSize } from './ticks'
import './ChartSeries.css'

export type { ThresholdLine } from './sportCurveModel'

/** The best efforts of the period before, and the label it is named by, such as "Previous 6 weeks". */
export interface PreviousCurve {
  curve: Curve
  label: string
}

/** A chart at least this wide, px, keeps a right gutter for the threshold's label and the series' end. */
const WIDE_CHART_PX = 800
const GUTTER_PX = 180

export interface SportCurveChartProps {
  sport: Sport
  /** Best value at each duration in the sport's own number: m/s for running, watts for cycling. */
  curve: Curve
  /** The same curve for the period before, drawn dashed. */
  previous: PreviousCurve | null
  /** Body mass in kg, for the W/kg in a cycling tooltip. */
  massKg: number
  units: UnitSystem
  /** Activity id to name. When given, tooltips and the table say which activity each value is from. */
  activityNames?: Record<string, string>
  /** Activity id to the body mass on its date, kg. When given, its W/kg uses that mass, not massKg. */
  activityMasses?: Record<string, number>
  /** The sport's threshold in its own number, drawn as a labelled line with its range as a band. */
  threshold?: ThresholdLine | null
  /** The level the best 20 minutes grades to, such as "Local", for the finding when there is no period before. */
  bestLevel?: string
}

/**
 * A sport's best efforts by duration, in its own unit: pace for running, faster up, and power for
 * cycling, on a wash of the sport's colour. The 5, 20 and 60 minute bests are called out with their
 * values, the threshold is a labelled line, and a stretch with no effort on file is drawn lighter and
 * labelled once. The period before is a dashed line when given.
 */
export function SportCurveChart({
  sport,
  curve,
  previous,
  massKg,
  units,
  activityNames,
  activityMasses,
  threshold = null,
  bestLevel,
}: SportCurveChartProps) {
  // Each is kept while its inputs are, so reading a point (which re-renders the chart) does not rebuild the layout.
  const rows = useMemo(
    () => buildRows(sport, curve, previous?.curve ?? []),
    [sport, curve, previous?.curve],
  )
  // The previous period is drawn, listed and tabled only when it has a value to show.
  const shown =
    previous !== null && rows.some((row) => Number.isFinite(row.previous)) ? previous : null
  const view: View = useMemo(
    () => ({
      sport,
      units,
      massKg,
      masses: activityMasses,
      previous: shown,
      names: activityNames,
      shared: sharedSourceOf(rows.map((row) => row.activityId)),
    }),
    [sport, units, massKg, activityMasses, shown, activityNames, rows],
  )
  const hasData = rows.filter((row) => Number.isFinite(row.value)).length >= 2
  const [active, setActive] = useState<number | null>(null)
  const emphasis = emphasisIndex(rows)
  const layoutOf = useMemo(
    () => sizedOnce((size: ChartSize) => layout(rows, view, size, threshold)),
    [rows, view, threshold],
  )
  const marksOf = useMemo(
    () =>
      sizedOnce((size: ChartSize) => {
        const m = layoutOf(size)
        return m === null ? null : curveMarks(rows, m, view, size, threshold)
      }),
    [layoutOf, rows, view, threshold],
  )
  const legend: ChartLegendEntry[] | undefined = hasData ? keyOf(sport, shown, previous) : undefined
  const noPrevious =
    previous && !shown && hasData
      ? `No ${SPORT_PLURAL[sport]} in the ${previous.label.toLowerCase()}`
      : undefined
  // The table says the stretch too, whether or not the width leaves room to draw its bracket.
  const noEffort = noEffortLabel(
    rows,
    carriedSpans(
      rows.map((row) => row.carried === true),
      rows.map((row) => Number.isFinite(row.value)),
    ),
  )
  const caption = captionOf(view)

  return (
    <ChartFrame
      title={titleOf(sport, units)}
      takeaway={
        hasData
          ? (curveTakeaway({
              sport,
              units,
              rows,
              previousLabel: shown?.label ?? null,
              threshold,
              level: bestLevel,
            }) ?? undefined)
          : undefined
      }
      description={`Best ${SPORT_FORMAT[sport].nativeLabel.toLowerCase()} for each duration. Duration is on a log scale.${shown ? ` Grey line: ${shown.label}.` : ''}`}
      legend={legend}
      keyNote={noPrevious}
      plotRightMargin={(width) => (width >= WIDE_CHART_PX ? GUTTER_PX : undefined)}
      table={{
        caption: noEffort === '' ? caption : `${caption} ${noEffort}.`,
        columns: columnsOf(view),
        rows: rows.map((row) => tableRow(row, view)),
        // The From column holds words, so it is set on the left.
        textColumns: view.shared === null ? [columnsOf(view).length - 1] : [],
      }}
      empty={
        hasData
          ? undefined
          : `Add ${SPORT_PLURAL[sport]} of ${startText(sport)} or more to see this curve`
      }
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
              return row ? tooltipFor(row, x, y, view) : null
            },
            layoutOf(size)?.ys,
          ),
        )
      }
    >
      {(size) => {
        const m = layoutOf(size)
        const marks = marksOf(size)
        if (m === null || marks === null) return null
        const { marker: markerR, active: activeR } = markerRadii(size.width)
        const activeX = active === null ? undefined : m.xs[active]
        const emphasised = m.points[emphasis] ?? null
        const activePoint = active === null ? null : (m.points[active] ?? null)
        const activeEarlier = active === null ? null : (m.earlier[active] ?? null)
        // A curve with no carried stretch draws as one path; otherwise the measured and the carried parts apart.
        const split = m.spans.length > 0 ? strokeSplit(m.points, m.carried) : null
        return (
          <>
            <ChartXAxis
              ticks={m.xTicks}
              plot={size.plot}
              title="Duration"
              fontSize={axisFontSize(size.width)}
            />
            <ChartYAxis
              ticks={m.yTicks}
              plot={size.plot}
              title={axisTitle(sport, units)}
              fontSize={axisFontSize(size.width)}
            />
            {activeX !== undefined ? <Crosshair x={activeX} plot={size.plot} /> : null}
            <path
              className={`chart-series__area chart-series__area--${sport}`}
              data-sport={sport}
              d={areaPath(m.points, size.plot.bottom)}
            />
            {shown ? (
              <path
                data-testid="sport-curve-previous"
                className="chart-series__line chart-series__line--previous"
                d={linePath(m.earlier)}
              />
            ) : null}
            <path
              data-testid="sport-curve-line"
              className={`chart-series__line chart-series__line--${sport}`}
              d={linePath(split === null ? m.points : split.measured)}
            />
            {split !== null ? (
              <path
                data-testid="sport-curve-carried"
                className={`chart-series__line chart-series__line--${sport} chart-series__line--carried`}
                d={linePath(split.carried)}
              />
            ) : null}
            <ChartAnnotations
              annotations={marks.annotations}
              size={size}
              obstacles={marks.obstacles}
            />
            {/* A measured point is a solid dot; a carried one is a hollow ring, since it is not this length's own best. */}
            {emphasised ? (
              <circle
                data-testid="sport-curve-emphasis"
                className={
                  m.carried[emphasis] === true
                    ? `chart-series__ring--${sport}`
                    : `chart-series__marker chart-series__marker--${sport}`
                }
                cx={emphasised.x}
                cy={emphasised.y}
                r={activeR}
              />
            ) : null}
            {m.points.map((point, index) =>
              point !== null &&
              index !== emphasis &&
              isRecordDuration(sport, rows[index]?.durationS ?? NaN) ? (
                <circle
                  key={rows[index]?.durationS}
                  data-testid="sport-curve-record"
                  className={
                    m.carried[index] === true
                      ? `chart-series__ring--${sport}`
                      : `chart-series__marker chart-series__marker--${sport}`
                  }
                  cx={point.x}
                  cy={point.y}
                  r={markerR}
                />
              ) : null,
            )}
            {activePoint ? (
              <circle
                className={
                  active !== null && m.carried[active] === true
                    ? `chart-series__ring--${sport}`
                    : `chart-series__marker chart-series__marker--${sport}`
                }
                cx={activePoint.x}
                cy={activePoint.y}
                r={activeR}
              />
            ) : null}
            {activeEarlier ? (
              <circle
                className="chart-series__marker chart-series__marker--previous"
                cx={activeEarlier.x}
                cy={activeEarlier.y}
                r={markerR}
              />
            ) : null}
          </>
        )
      }}
    </ChartFrame>
  )
}
