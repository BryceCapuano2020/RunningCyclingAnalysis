import type { KeyboardEvent, PointerEvent } from 'react'
import type { ChartSize, Point } from './chartTypes'
import './PlotSurface.css'

export type NavigationKey = 'ArrowLeft' | 'ArrowRight' | 'Escape'

export interface PlotSurfaceProps {
  size: ChartSize
  /** Names the plot for screen readers and says how to use the keyboard. */
  label: string
  /** Pointer position in SVG pixels, or null when the pointer leaves. */
  onPoint: (point: Point | null) => void
  onKey: (key: NavigationKey) => void
  onBlur: () => void
}

function isNavigationKey(key: string): key is NavigationKey {
  return key === 'ArrowLeft' || key === 'ArrowRight' || key === 'Escape'
}

/**
 * The transparent, focusable layer over the plot. It receives pointer and keyboard input, so
 * the marks underneath never need their own handlers. Sits last in the SVG so it is on top.
 */
export function PlotSurface({ size, label, onPoint, onKey, onBlur }: PlotSurfaceProps) {
  const { plot } = size

  const handleMove = (event: PointerEvent<SVGRectElement>) => {
    const svg = event.currentTarget.ownerSVGElement
    if (svg === null) return
    const box = svg.getBoundingClientRect()
    const scaleX = box.width > 0 ? size.width / box.width : 1
    const scaleY = box.height > 0 ? size.height / box.height : 1
    onPoint({ x: (event.clientX - box.left) * scaleX, y: (event.clientY - box.top) * scaleY })
  }

  const handleKeyDown = (event: KeyboardEvent<SVGRectElement>) => {
    const { key } = event
    if (!isNavigationKey(key)) return
    event.preventDefault()
    onKey(key)
  }

  return (
    <rect
      data-testid="plot-surface"
      className="plot-surface"
      x={plot.left}
      y={plot.top}
      width={plot.right - plot.left}
      height={plot.bottom - plot.top}
      tabIndex={0}
      role="group"
      aria-roledescription="chart"
      aria-label={label}
      onPointerMove={handleMove}
      onPointerLeave={() => onPoint(null)}
      onKeyDown={handleKeyDown}
      onBlur={onBlur}
    />
  )
}
