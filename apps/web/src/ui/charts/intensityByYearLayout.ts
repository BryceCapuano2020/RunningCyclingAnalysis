import type { IntensityRow, IntensityShares } from '@rca/core/history'
import type { Sport } from '@rca/core/types'
import type { AxisTick, ChartSize, PlotBox } from './chartTypes'
import { linearScale } from './scale'
import type { Scale } from './scale'
import { fitTicks } from './ticks'
import { MAX_BAR_PX } from './weeklyVolumeLayout'
import { BANDS, BAND_LABEL } from './intensityByYearText'
import type { Band } from './intensityByYearText'

/** The share of a year's room that its bar fills. */
const BAR_FILL = 0.6
/** The gap between two bands, px, shared half to each: a 2 px surface gap between stacked fills. */
const BAND_GAP = 2
/** The gridlines of the share axis, from the foot of the bars up. */
const AXIS_SHARES = [0, 0.5, 1]

/** The key above the plot: a chip for each band and its name, measured from the plot's left edge. */
const KEY_CHIP = 10
const KEY_CHIP_GAP = 6
const KEY_CHAR_PX = 8
const KEY_SPACING = 18
const KEY_CHIP_TOP = 18
const KEY_TEXT_BASELINE = 8

export interface BandSegment {
  band: Band
  /** The top of the segment and its height, in SVG px. */
  y: number
  height: number
}

export interface IntensityBar {
  x: number
  width: number
  /** The bands from the foot of the bar up. Empty for a year with no heart-rate time. */
  segments: BandSegment[]
}

export interface KeySlot {
  band: Band
  label: string
  /** The chip's top left corner and its side, and the label's baseline start, in SVG px. */
  chipX: number
  chipY: number
  chip: number
  textX: number
  textY: number
}

export interface IntensityLayout {
  /** The pixel x of each year's bar, centred in its room. */
  xs: number[]
  bars: IntensityBar[]
  /** Where each year's tooltip sits: at the top of its bar, or at the plot's foot for a year with no time. */
  ys: number[]
  xTicks: AxisTick[]
  yTicks: AxisTick[]
}

/** One year's bar: each band's share of its time, stacked from the foot up. */
function barOf(shares: IntensityShares, x: number, width: number, y: Scale): IntensityBar {
  const segments: BandSegment[] = []
  if (shares.seconds > 0) {
    let base = 0
    for (const band of BANDS) {
      const share = shares[band]
      if (share <= 0) continue
      const top = base + share
      segments.push({
        band,
        y: y(top) + BAND_GAP / 2,
        height: Math.max(0, y(base) - y(top) - BAND_GAP),
      })
      base = top
    }
  }
  return { x: x - width / 2, width, segments }
}

/**
 * One equal room for each calendar year, with its bar in the middle, so a year with no heart rate is an empty room.
 * Null without years.
 */
export function intensityLayout(
  years: readonly IntensityRow[],
  sport: Sport,
  size: ChartSize,
): IntensityLayout | null {
  if (years.length === 0) return null
  const { plot, width } = size
  const room = (plot.right - plot.left) / years.length
  const xs = years.map((_, i) => plot.left + room * (i + 0.5))
  const y = linearScale([0, 1], [plot.bottom, plot.top])
  const barWidth = Math.min(MAX_BAR_PX, Math.max(1, room * BAR_FILL))
  const bars = years.map((row, i) => barOf(row.sports[sport], xs[i]!, barWidth, y))
  return {
    xs,
    bars,
    ys: bars.map((bar) => bar.segments.at(-1)?.y ?? plot.bottom),
    xTicks: fitTicks(
      years.map((row, i) => ({ position: xs[i]!, label: String(row.year) })),
      { axis: 'x', width },
    ),
    yTicks: fitTicks(
      AXIS_SHARES.map((share) => ({ position: y(share), label: `${Math.round(share * 100)}%` })),
      { axis: 'y', width },
    ),
  }
}

/** The key's slots, one after another from the plot's left edge, above the plot. */
export function keyOf(plot: PlotBox): KeySlot[] {
  let x = plot.left
  return BANDS.map((band) => {
    const label = BAND_LABEL[band]
    const slot = {
      band,
      label,
      chipX: x,
      chipY: plot.top - KEY_CHIP_TOP,
      chip: KEY_CHIP,
      textX: x + KEY_CHIP + KEY_CHIP_GAP,
      textY: plot.top - KEY_TEXT_BASELINE,
    }
    x += KEY_CHIP + KEY_CHIP_GAP + label.length * KEY_CHAR_PX + KEY_SPACING
    return slot
  })
}
