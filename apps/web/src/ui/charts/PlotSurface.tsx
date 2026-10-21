import type { KeyboardEvent, PointerEvent } from 'react'
import type { ChartSize, Point } from './chartTypes'
import './PlotSurface.css'

export type NavigationKey = 'ArrowLeft' | 'ArrowRight' | 'Escape'

export interface PlotSurfaceProps {
  size: ChartSize
  /** Pointer position in SVG pixels, or null when the pointer leaves. */
  onPoint: (point: Point | null) => void
  onKey: (key: NavigationKey) => void
  onBlur: () => void
}

const LABEL = 'Chart data. Use left and right arrow keys to read values'

function isNavigationKey(key: string): key is NavigationKey {
  return key === 'ArrowLeft' || key === 'ArrowRight' || key === 'Escape'
}

/**
 * The focusable, interactive layer over the plot. It is a sibling of the static drawing rather
 * than part of it, so screen readers announce the chart image and the data separately. Its
 * description is the tooltip, which announces the values as they change.
 */
export function PlotSurface({ size, onPoint, onKey, onBlur }: PlotSurfaceProps) {
  const { plot } = size

  const handleMove = (event: PointerEvent<SVGGElement>) => {
    const svg = event.currentTarget.ownerSVGElement
    if (svg === null) return
    const box = svg.getBoundingClientRect()
    const scaleX = box.width > 0 ? size.width / box.width : 1
    const scaleY = box.height > 0 ? size.height / box.height : 1
    onPoint({ x: (event.clientX - box.left) * scaleX, y: (event.clientY - box.top) * scaleY })
  }

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
      aria-roledescription="chart"
      aria-label={LABEL}
      aria-describedby={size.tooltipId}
      onPointerMove={handleMove}
      onPointerLeave={() => onPoint(null)}
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
    </g>
  )
}
