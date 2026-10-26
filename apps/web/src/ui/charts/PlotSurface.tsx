import { useEffect, useRef } from 'react'
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import type { ChartSize, Point } from './chartTypes'
import './PlotSurface.css'

export type NavigationKey = 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End' | 'Escape'

export interface PlotSurfaceProps {
  size: ChartSize
  /** Pointer position in SVG pixels, or null when the pointer leaves or the touch ends. */
  onPoint: (point: Point | null) => void
  onKey: (key: NavigationKey) => void
  onBlur: () => void
}

/** The gap between the plot and its focus ring, in SVG pixels. */
const RING_GAP = 4

function isNavigationKey(key: string): key is NavigationKey {
  return ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(key)
}

/**
 * The focusable, interactive layer over the plot. It is a sibling of the static drawing rather
 * than part of it, so screen readers announce the chart image and the data separately. Its
 * description is the tooltip, which announces the values as they change.
 *
 * The tooltip follows the pointer over the plot. A mouse that leaves clears it. A touch keeps its
 * value after the finger lifts, so it can be read, until a tap elsewhere on the page, a cancelled
 * touch (the page scrolls), focus leaving the plot, or Escape clears it.
 */
export function PlotSurface({ size, onPoint, onKey, onBlur }: PlotSurfaceProps) {
  const { plot } = size
  const surface = useRef<SVGGElement>(null)

  // A tap anywhere outside the chart ends a touched tooltip, which has no hover to leave it.
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (surface.current !== null && !surface.current.contains(event.target as Node)) onPoint(null)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [onPoint])

  const pointAt = (event: ReactPointerEvent<SVGGElement>): Point | null => {
    const svg = event.currentTarget.ownerSVGElement
    if (svg === null) return null
    const box = svg.getBoundingClientRect()
    const scaleX = box.width > 0 ? size.width / box.width : 1
    const scaleY = box.height > 0 ? size.height / box.height : 1
    return { x: (event.clientX - box.left) * scaleX, y: (event.clientY - box.top) * scaleY }
  }

  const handleMove = (event: ReactPointerEvent<SVGGElement>) => {
    const point = pointAt(event)
    if (point !== null) onPoint(point)
  }

  const handleLeave = (event: ReactPointerEvent<SVGGElement>) => {
    if (event.pointerType !== 'touch') onPoint(null)
  }

  const clear = () => onPoint(null)

  const handleKeyDown = (event: KeyboardEvent<SVGGElement>) => {
    const { key } = event
    if (!isNavigationKey(key)) return
    event.preventDefault()
    onKey(key)
  }

  return (
    <g
      data-testid="plot-surface"
      className="plot-surface"
      role="group"
      tabIndex={0}
      ref={surface}
      aria-roledescription="chart"
      aria-label={`${size.title}. Use the left and right arrow keys to read values`}
      aria-describedby={size.tooltipId}
      onPointerDown={handleMove}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      onPointerCancel={clear}
      onKeyDown={handleKeyDown}
      onBlur={onBlur}
    >
      <rect
        className="plot-surface__hit"
        x={plot.left}
        y={plot.top}
        width={plot.right - plot.left}
        height={plot.bottom - plot.top}
      />
      <rect
        className="plot-surface__ring"
        x={plot.left - RING_GAP}
        y={plot.top - RING_GAP}
        width={plot.right - plot.left + 2 * RING_GAP}
        height={plot.bottom - plot.top + 2 * RING_GAP}
      />
    </g>
  )
}
