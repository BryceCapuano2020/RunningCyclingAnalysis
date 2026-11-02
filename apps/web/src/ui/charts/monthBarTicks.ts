import { formatMonth } from '../format/date'
import type { AxisTick, PlotBox } from './chartTypes'
import { axisFontSize, rootScale } from './ticks'
import { TICK_LABEL_GAP_PX, labelExtent, utcDayLocal } from './trendTicks'

/** The month a bar stands for, with its year so a label names its bar alone: a bar is dated at its month's last week. */
export const monthBarLabel = (endMs: number): string => formatMonth(utcDayLocal(endMs), true)

/**
 * The x ticks of bars that are months. Each label sits at its bar's own x and names that bar's month, never the
 * month that starts after it. Every bar is labelled when the labels clear one another, as the axis draws them;
 * otherwise every second, third or later bar, counted back from the last, so the labels are evenly spaced and
 * the latest month, a partial one included, is always named.
 */
export function monthBarTicks(
  endsMs: readonly number[],
  xs: readonly number[],
  size: { width: number; plot: PlotBox },
): AxisTick[] {
  const all = endsMs.map((ms, i): AxisTick => ({ position: xs[i]!, label: monthBarLabel(ms) }))
  const last = all.length - 1
  const fontPx = axisFontSize(size.width)
  const scale = rootScale()
  const clear = (ticks: AxisTick[]) => {
    const extents = ticks.map((tick) => labelExtent(tick, size.plot, fontPx, scale))
    return extents.every(
      (extent, i) => i === 0 || extents[i - 1]![1] + TICK_LABEL_GAP_PX <= extent[0],
    )
  }
  for (let step = 1; step <= last; step++) {
    const kept = all.filter((_, i) => (last - i) % step === 0)
    if (clear(kept)) return kept
  }
  return all.slice(last)
}
