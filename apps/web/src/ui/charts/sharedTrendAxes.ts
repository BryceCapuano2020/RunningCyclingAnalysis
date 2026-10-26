import type { AxisTick } from './chartTypes'
import type { SharedWeek } from './gradeTrend'
import type { SharedMeasure } from './sharedTrendText'
import { fitTicks } from './ticks'
import { trendDateTicks } from './trendTicks'

/** The x and y axis ticks of a shared trend, each fitted to the chart's width. */
export function axisTicksOf(
  weeks: readonly SharedWeek[],
  x: (value: number) => number,
  y: (value: number) => number,
  ticks: readonly number[],
  decimals: number,
  measure: SharedMeasure,
  width: number,
): { xTicks: AxisTick[]; yTicks: AxisTick[] } {
  return {
    xTicks: fitTicks(
      trendDateTicks(
        weeks.map((week) => week.endMs),
        x,
      ),
      { axis: 'x', width },
    ),
    yTicks: fitTicks(
      ticks.map((tick) => ({
        position: y(tick),
        label: measure === 'grade' ? `${tick.toFixed(decimals)}%` : tick.toFixed(decimals),
      })),
      { axis: 'y', width },
    ),
  }
}
