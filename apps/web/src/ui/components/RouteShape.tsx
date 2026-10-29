import { useEffect, useRef } from 'react'
import type { RouteShape as Outline } from '@rca/core/route/routeShape'
import type { Sport } from '@rca/core/types'
import { keyByContent } from '../contentKeys'
import { SPORT_LABEL } from '../sports'
import './RouteShape.css'

/** The box the outline sits in is kept between these aspect ratios, so a straight track still has room. */
const MIN_BOX_ASPECT = 0.8
const MAX_BOX_ASPECT = 2
/** A segment's stroke runs from the first to the second of these widths, in px, from its slowest to its fastest. */
const SLOW_WIDTH_PX = 2.5
const FAST_WIDTH_PX = 4.5

export interface RouteShapeProps {
  /** The outline to draw. Null draws nothing, as for an indoor activity. */
  shape: Outline | null
  sport: Sport
  /** Takes focus once drawn, for a route the visitor asked for, so focus is not lost with the button. */
  takeFocus?: boolean
  /**
   * How fast each segment was, from 0 (slow) to 1 (fast), one for each segment of the outline. With it the
   * line is coloured by pace and has a key; without it, or when it does not fit the outline, it is the sport's colour.
   */
  segmentPace?: readonly number[] | null
}

/** The path of a dot at one point: a zero-length stroke with round caps, so its size is in px at any scale. */
function dotAt([x, y]: readonly [number, number]): string {
  return `M ${x} ${y} L ${x} ${y}`
}

/** The outline of an outdoor track. It carries no position, so nothing here can be located. */
export function RouteShape({
  shape,
  sport,
  takeFocus = false,
  segmentPace = null,
}: RouteShapeProps) {
  const figureRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (takeFocus) figureRef.current?.focus()
  }, [takeFocus])
  if (shape === null) return null
  const { aspect, points } = shape
  const box = Math.min(MAX_BOX_ASPECT, Math.max(MIN_BOX_ASPECT, aspect))
  const paced = segmentPace !== null && segmentPace.length === points.length - 1
  const start = points[0]!
  const finish = points[points.length - 1]!
  return (
    <figure ref={figureRef} className="route-shape" style={{ aspectRatio: box }} tabIndex={-1}>
      <svg
        role="img"
        aria-label={`Route shape of this ${SPORT_LABEL[sport].toLowerCase()}${paced ? ', coloured by pace' : ''}`}
        viewBox={`0 0 ${Math.min(1, aspect)} ${Math.min(1, 1 / aspect)}`}
        preserveAspectRatio="xMidYMid meet"
        overflow="visible"
        className="route-shape__svg"
      >
        {paced ? (
          keyByContent(
            points
              .slice(1)
              .map(([x, y], i) => ({ from: points[i]!, to: [x, y], share: segmentPace[i]! })),
            ({ from, to }) => `${from.join(',')}-${to.join(',')}`,
          ).map(({ key, item }) => (
            <path
              key={key}
              className="route-shape__segment"
              d={`M ${item.from[0]} ${item.from[1]} L ${item.to[0]} ${item.to[1]}`}
              vectorEffect="non-scaling-stroke"
              style={{
                stroke: `color-mix(in oklab, var(--ch-pace) ${Math.round(item.share * 100)}%, var(--ch-heartrate))`,
                strokeWidth: SLOW_WIDTH_PX + item.share * (FAST_WIDTH_PX - SLOW_WIDTH_PX),
              }}
            />
          ))
        ) : (
          <polyline
            points={points.map(([x, y]) => `${x},${y}`).join(' ')}
            vectorEffect="non-scaling-stroke"
            className={`route-shape__line route-shape__line--${sport}`}
            data-sport={sport}
          />
        )}
        <path
          className="route-shape__start-ring"
          d={dotAt(start)}
          vectorEffect="non-scaling-stroke"
        />
        <path
          className="route-shape__start-fill"
          d={dotAt(start)}
          vectorEffect="non-scaling-stroke"
        />
        <path
          className="route-shape__finish-halo"
          d={dotAt(finish)}
          vectorEffect="non-scaling-stroke"
        />
        <path className="route-shape__finish" d={dotAt(finish)} vectorEffect="non-scaling-stroke" />
      </svg>
      {paced && (
        <figcaption className="route-shape__key">
          <span>Slower</span>
          <span className="route-shape__ramp" aria-hidden="true" />
          <span>Faster</span>
        </figcaption>
      )}
    </figure>
  )
}
