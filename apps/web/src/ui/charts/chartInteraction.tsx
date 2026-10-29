import type { ReactNode } from 'react'
import { ChartTooltip } from './ChartTooltip'
import type { ChartSize, TooltipContent } from './chartTypes'
import { nearestByX, stepActive } from './hover'
import type { PositionPick } from './hover'
import { PlotSurface } from './PlotSurface'
import { NARROW_WIDTH } from './ticks'

const MARKER_R = 4
const ACTIVE_MARKER_R = 6
/** Below NARROW_WIDTH, markers stay 8 px across, so that they still read as points. */
const NARROW_MARKER_R = 4
const NARROW_ACTIVE_MARKER_R = 5

export interface MarkerRadii {
  marker: number
  active: number
}

/** Radii of a chart's markers, and of the marker under the active point, at this width. */
export function markerRadii(width: number): MarkerRadii {
  return width < NARROW_WIDTH
    ? { marker: NARROW_MARKER_R, active: NARROW_ACTIVE_MARKER_R }
    : { marker: MARKER_R, active: ACTIVE_MARKER_R }
}

/**
 * The focusable plot layer shared by the line charts. xs holds the pixel x of each navigable
 * point, in the order the arrow keys step through them. Null xs means the chart has no layout.
 * The pointer picks a point with pick: the nearest, or for a stepped line the last at or before it.
 */
export function plotSurface(
  size: ChartSize,
  xs: number[] | null,
  active: number | null,
  setActive: (index: number | null) => void,
  pick: PositionPick = nearestByX,
): ReactNode {
  if (xs === null) return null
  return (
    <PlotSurface
      size={size}
      onPoint={(point) => setActive(point === null ? null : pick(xs, point.x))}
      onKey={(key) => {
        const next = stepActive(active, xs.length, key)
        if (next) setActive(next.index)
      }}
      onBlur={() => setActive(null)}
    />
  )
}

/** The tooltip for the active point, or an empty tooltip when content is null. */
export function tooltipOverlay(size: ChartSize, content: TooltipContent | null): ReactNode {
  return (
    <ChartTooltip
      bounds={{ width: size.width, height: size.height, plotTop: size.plot.top }}
      content={content}
      id={size.tooltipId}
    />
  )
}

/**
 * Moves values down, in order, so that each sits at least gap below the one above it. Returns the
 * values in their input order; a value already far enough from the one above does not move.
 */
export function spreadApart(ys: readonly number[], gap: number): number[] {
  const order = ys.map((y, index) => ({ y, index })).sort((a, b) => a.y - b.y)
  const placed = new Array<number>(ys.length).fill(0)
  let last = -Infinity
  for (const { y, index } of order) {
    const at = Math.max(y, last + gap)
    placed[index] = at
    last = at
  }
  return placed
}

/**
 * The tooltip of the active point, anchored beside it: at its pixel x, and at its pixel y when
 * ys gives one, else the middle of the plot. Null when there is no active point, or when the chart
 * has no positions to anchor it to.
 */
export function tooltipAt(
  size: ChartSize,
  xs: readonly number[] | null,
  active: number | null,
  contentFor: (index: number, x: number, y: number) => TooltipContent | null,
  ys?: readonly (number | null)[],
): TooltipContent | null {
  if (xs === null || active === null) return null
  const x = xs[active]
  if (x === undefined) return null
  const y = ys?.[active] ?? (size.plot.top + size.plot.bottom) / 2
  return contentFor(active, x, y)
}

/**
 * Computes a value once per chart render. ChartFrame passes the same size object to the drawing,
 * the surface and the overlay, so they share one layout instead of each building it.
 */
export function sizedOnce<T>(compute: (size: ChartSize) => T): (size: ChartSize) => T {
  let last: { size: ChartSize; value: T } | null = null
  return (size) => {
    if (last === null || last.size !== size) last = { size, value: compute(size) }
    return last.value
  }
}

/** A diamond of half-width r centred on (x, y), as a closed path: the shape of a ride's point. */
export function diamondPath(x: number, y: number, r: number): string {
  return `M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z`
}
