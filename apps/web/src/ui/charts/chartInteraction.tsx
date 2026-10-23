import type { ReactNode } from 'react'
import { ChartTooltip } from './ChartTooltip'
import type { ChartSize, TooltipContent } from './chartTypes'
import { nearestByX, stepActive } from './hover'
import { PlotSurface } from './PlotSurface'
import { NARROW_WIDTH } from './ticks'

const MARKER_R = 4
const ACTIVE_MARKER_R = 6
/** Below NARROW_WIDTH, markers are 5 px across. */
const NARROW_MARKER_R = 2.5
const NARROW_ACTIVE_MARKER_R = 4

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
 */
export function plotSurface(
  size: ChartSize,
  xs: number[] | null,
  active: number | null,
  setActive: (index: number | null) => void,
): ReactNode {
  if (xs === null) return null
  return (
    <PlotSurface
      size={size}
      onPoint={(point) => setActive(point === null ? null : nearestByX(xs, point.x))}
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
      bounds={{ width: size.width, height: size.height }}
      content={content}
      id={size.tooltipId}
    />
  )
}
