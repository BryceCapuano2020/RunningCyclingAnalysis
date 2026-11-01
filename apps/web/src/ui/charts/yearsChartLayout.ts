import type { HindsightFitness } from '@rca/core/lookback'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import type { AxisTick, ChartSize, Point } from './chartTypes'
import { linearScale } from './scale'
import { plottedValue, sportYAxis } from './sportAxis'
import { fitTicks } from './ticks'
import { trendDateTicks } from './trendTicks'

/** The least a run's axis spans, seconds of pace, so a plateau a few per cent off reads as small. */
const MIN_TIGHT_SPAN: Record<Sport, number> = { run: 30, ride: 0 }

export interface EpisodeSpan {
  kind: HindsightFitness['episodes'][number]['kind']
  x0: number
  x1: number
}

export interface YearsLayout {
  /** The level as steps: each plateau's start then its end, so the line rises and falls where a plateau changes. */
  line: Point[]
  upper: Point[]
  lower: Point[]
  spans: EpisodeSpan[]
  xTicks: AxisTick[]
  yTicks: AxisTick[]
}

/** Where the plateaus, their ranges and the episodes sit across the years the look-back tells. */
export function yearsLayout(
  years: HindsightFitness,
  sport: Sport,
  units: UnitSystem,
  size: ChartSize,
): YearsLayout | null {
  if (years.levels.length === 0 || years.toMs <= years.fromMs) return null
  const { plot, width } = size
  const x = linearScale([years.fromMs, years.toMs], [plot.left, plot.right])
  const at = (output: number) => plottedValue(sport, output, units)
  const values = years.levels.flatMap((l) => [at(l.low), at(l.high)])
  const { y, ticks } = sportYAxis(sport, values, plot, true, MIN_TIGHT_SPAN[sport])
  const ends = (pick: (l: HindsightFitness['levels'][number]) => number) =>
    years.levels.flatMap((l) => [
      { x: x(l.fromMs), y: pick(l) },
      { x: x(Math.min(l.toMs, years.toMs)), y: pick(l) },
    ])
  const edge = (pick: (a: number, b: number) => number) =>
    ends((l) => pick(y(at(l.low)), y(at(l.high))))
  return {
    line: ends((l) => y(at(l.value))),
    upper: edge(Math.min),
    lower: edge(Math.max),
    spans: years.episodes.map((e) => ({
      kind: e.kind,
      x0: x(e.fromMs),
      x1: x(e.toMs ?? years.toMs),
    })),
    xTicks: fitTicks(trendDateTicks([years.fromMs, years.toMs], x), { axis: 'x', width }),
    yTicks: fitTicks(ticks, { axis: 'y', width }),
  }
}
