import { useEffect, useRef } from 'react'
import type { RouteShape as Outline } from '@rca/core/route/routeShape'
import type { Sport } from '@rca/core/types'
import { SPORT_LABEL } from '../sports'
import './RouteShape.css'

/** The box the outline sits in is kept between these aspect ratios, so a straight track still has room. */
const MIN_BOX_ASPECT = 0.8
const MAX_BOX_ASPECT = 2

export interface RouteShapeProps {
  /** The outline to draw. Null draws nothing, as for an indoor activity. */
  shape: Outline | null
  sport: Sport
  /** Takes focus once drawn, for a route the visitor asked for, so focus is not lost with the button. */
  takeFocus?: boolean
}

/** The outline of an outdoor track. It carries no position, so nothing here can be located. */
export function RouteShape({ shape, sport, takeFocus = false }: RouteShapeProps) {
  const figureRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (takeFocus) figureRef.current?.focus()
  }, [takeFocus])
  if (shape === null) return null
  const { aspect, points } = shape
  const box = Math.min(MAX_BOX_ASPECT, Math.max(MIN_BOX_ASPECT, aspect))
  return (
    <figure ref={figureRef} className="route-shape" style={{ aspectRatio: box }} tabIndex={-1}>
      <svg
        role="img"
        aria-label={`Route shape of this ${SPORT_LABEL[sport].toLowerCase()}`}
        viewBox={`0 0 ${Math.min(1, aspect)} ${Math.min(1, 1 / aspect)}`}
        preserveAspectRatio="xMidYMid meet"
        overflow="visible"
        className="route-shape__svg"
      >
        <polyline
          points={points.map(([x, y]) => `${x},${y}`).join(' ')}
          vectorEffect="non-scaling-stroke"
          className={`route-shape__line route-shape__line--${sport}`}
          data-sport={sport}
        />
      </svg>
    </figure>
  )
}
