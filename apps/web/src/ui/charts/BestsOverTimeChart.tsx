import { useMemo, useState } from 'react'
import type { TrendPoint } from '@rca/core/digest'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { formatWkg } from '@rca/core/units'
import { effortLabel } from '../records'
import { SPORT_PLURAL } from '../sports'
import { ChartFrame } from './ChartFrame'
import { ChartXAxis } from './ChartXAxis'
import { ChartYAxis } from './ChartYAxis'
import { Crosshair } from './Crosshair'
import { OLD_BELOW, bestDots, dotRadius, dotsLayout } from './bestsOverTime'
import type { BestDot } from './bestsOverTime'
import { markerRadii, plotSurface, sizedOnce, tooltipAt, tooltipOverlay } from './chartInteraction'
import type { ChartSize, TooltipContent } from './chartTypes'
import { useChartHeight } from './chartHeight'
import { nearestByX } from './hover'
import { idleFrom } from './idleReadout'
import { PLOT_BOTTOM_WITHOUT_X_TITLE } from './plotBox'
import { axisTitle, formatNative, nativeLabel } from './sportAxis'
import { axisFontSize } from './ticks'
import { activityDate } from './trendTicks'
import './ChartHeadings.css'
import './ChartSeries.css'
import './BestsOverTimeChart.css'

export interface BestsOverTimeChartProps {
  sport: Sport
  /** The weekly points of the period: the efforts that led their windows are the dots. */
  points: readonly TrendPoint[]
  /** Body mass in kg, for the W/kg of a cycling value. */
  massKg: number
  units: UnitSystem
  /** The effort length each dot is the best of, in seconds. */
  effortS: number
  /** The finding the change test makes about this length against the period before, or null where it makes none. */
  takeaway: string | null
  /** The period the finding compares with, such as "Previous 12 weeks", which the line under the title names; null where none. */
  comparedWith: string | null
}

/** The line under a finding: what the dots are, and what the finding compares them with. */
function ledeOf(described: string, comparedWith: string | null): string {
  return comparedWith === null
    ? described
    : `${described}. The finding compares this period's best with the ${comparedWith.toLowerCase()}.`
}

/** A dot's tooltip: the day, the value, and for a ride its W/kg. */
function tooltipFor(
  dots: readonly BestDot[],
  index: number,
  x: number,
  y: number,
  sport: Sport,
  units: UnitSystem,
): TooltipContent | null {
  const dot = dots[index]
  if (dot === undefined) return null
  return {
    x,
    y,
    title: activityDate(dot.atMs),
    rows: [
      {
        kind: sport,
        label: nativeLabel(sport),
        value: formatNative(sport, dot.value, units),
        note: dot.wkg === null ? undefined : formatWkg(dot.wkg),
      },
    ],
  }
}

/**
 * A sport's best efforts of one length as dated dots: each is an effort that was the best of its stretch, on the day it
 * was done, in the sport's own unit, on an axis fitted to them. Older dots are fainter. No line joins them, because
 * the days between hold no reading: a line would claim a level for every week. The title is the change test's finding
 * about this length against the period before, when it makes one.
 */
export function BestsOverTimeChart({
  sport,
  points,
  massKg,
  units,
  effortS,
  takeaway,
  comparedWith,
}: BestsOverTimeChartProps) {
  const dots = useMemo(() => bestDots(points, sport, massKg), [points, sport, massKg])
  const hasData = dots.length >= 2
  const [active, setActive] = useState<number | null>(null)
  const height = useChartHeight()
  const layoutOf = sizedOnce((size: ChartSize) => dotsLayout(dots, sport, units, size))
  const effort = effortLabel(effortS)
  const described = `Best ${effort} ${SPORT_PLURAL[sport]} by day`
  return (
    <ChartFrame
      height={height}
      plotBottomMargin={PLOT_BOTTOM_WITHOUT_X_TITLE}
      title={hasData && takeaway !== null ? takeaway : described}
      lede={hasData && takeaway !== null ? ledeOf(described, comparedWith) : undefined}
      description={`${described}. Each dot is an effort of ${effort} or longer that was the best of its stretch, as ${nativeLabel(sport).toLowerCase()}. Older dots are fainter.${comparedWith === null ? '' : ` The finding compares this period's best with the ${comparedWith.toLowerCase()}.`}`}
      idleReadout={
        hasData ? idleFrom(tooltipFor(dots, dots.length - 1, 0, 0, sport, units)) : undefined
      }
      note={
        hasData
          ? 'Each dot is a best, not a typical effort: a day with no dot has no best, not a poor one.'
          : undefined
      }
      table={{
        columns: ['Day', nativeLabel(sport)],
        rows: dots.map((dot) => [activityDate(dot.atMs), formatNative(sport, dot.value, units)]),
        caption: `The efforts of ${effort} or longer that were the best of their stretch, oldest first.`,
      }}
      empty={
        hasData ? undefined : `Add ${SPORT_PLURAL[sport]} on more than one day to see them here`
      }
      surface={(size) =>
        plotSurface(size, layoutOf(size)?.xs ?? null, active, setActive, nearestByX)
      }
      overlay={(size) =>
        tooltipOverlay(
          size,
          tooltipAt(
            size,
            layoutOf(size)?.xs ?? null,
            active,
            (index, x, y) => tooltipFor(dots, index, x, y, sport, units),
            layoutOf(size)?.ys,
          ),
        )
      }
    >
      {(size) => {
        const m = layoutOf(size)
        if (m === null) return null
        const { plot } = size
        const activeX = active === null ? undefined : m.xs[active]
        return (
          <>
            <ChartXAxis ticks={m.xTicks} plot={plot} fontSize={axisFontSize(size.width)} />
            <ChartYAxis
              ticks={m.yTicks}
              plot={plot}
              title={axisTitle(sport, units)}
              fontSize={axisFontSize(size.width)}
            />
            {activeX !== undefined ? <Crosshair x={activeX} plot={plot} /> : null}
            {m.points.map((point, i) => (
              <circle
                key={dots[i]!.atMs}
                data-testid={i === dots.length - 1 ? 'bests-latest' : 'bests-dot'}
                className={`chart-series__marker chart-series__marker--${sport}${m.opacities[i]! < OLD_BELOW ? ' bests-dot--old' : ''}`}
                cx={point.x}
                cy={point.y}
                r={i === active ? markerRadii(size.width).active : dotRadius(size.width)}
                fillOpacity={m.opacities[i]}
              />
            ))}
          </>
        )
      }}
    </ChartFrame>
  )
}
