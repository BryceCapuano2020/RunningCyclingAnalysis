import type { CSSProperties } from 'react'
import { TRIANGLE_SPORTS, triangleGeometry } from '@rca/core/standing'
import type { Point, TriangleCorner, TriangleSport } from '@rca/core/standing'
import { NO_GRADE_TEXT, TRIANGLE_HREF, TRIANGLE_TITLE } from '../triangleSports'
import type { TriangleView } from '../triangleSports'
import './LevelTriangle.css'

/** The plot is one square of this many units, the same the share canvas reads `triangleGeometry` at. */
const SIZE = 300

const f = (value: number): string => value.toFixed(1)
const pointsOf = (points: readonly Point[]): string =>
  points.map((p) => `${f(p.x)},${f(p.y)}`).join(' ')

/** The corner as a link's words, screen readers' text included: "61%", "Local", and the range kept to them. */
function Words({ corner, note }: { corner: TriangleCorner; note: string | undefined }) {
  if (corner.percent === null)
    return <span className="level-triangle__none">{note ?? NO_GRADE_TEXT}</span>
  return (
    <>
      <span className="level-triangle__figure num">{corner.percent}%</span>{' '}
      <span className="level-triangle__level">{corner.level}</span>
      {note === undefined ? null : <span className="level-triangle__covers">{note}</span>}
      {corner.range === null ? null : (
        <span className="sr-only">{`, range ${corner.range.low} to ${corner.range.high}`}</span>
      )}
    </>
  )
}

/**
 * The balance between the sports as a figure: three axes from the centre, one per sport, each corner at that sport's age grade
 * (0 at the centre, 100% at the outer corner), the shape through the three dots in neutral ink. Nothing is summed or averaged.
 * A sport with no grade keeps its axis, with a cap and no dot, so the figure claims nothing about it. The SVG is decoration and
 * hidden from assistive technology: the corners are real links over it, in the rail's order, so each reads "Running 61% Local".
 */
export function LevelTriangle({
  view,
  linked = true,
}: {
  view: TriangleView
  /** False where the figure is an example, so its corners are plain text and lead nowhere. */
  linked?: boolean
}) {
  const shape = triangleGeometry(view.grades, SIZE)
  const { corners, rings, centre } = shape
  return (
    <div className="level-triangle" role="group" aria-label="Level in each sport">
      <svg className="level-triangle__plot" viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
        {rings.map((ring, order) => (
          <polygon
            key={ring.percent}
            className={`level-triangle__ring${order === 0 ? ' level-triangle__ring--outer' : ''}`}
            points={pointsOf(ring.points)}
          />
        ))}
        {TRIANGLE_SPORTS.map((sport) => {
          const corner = corners[sport]
          return (
            <g key={sport} data-sport={sport}>
              <line
                className={`level-triangle__axis${corner.dot === null ? ' level-triangle__axis--empty' : ''}`}
                x1={f(centre.x)}
                y1={f(centre.y)}
                x2={f(corner.tip.x)}
                y2={f(corner.tip.y)}
              />
              {corner.cap === null ? null : (
                <line
                  className="level-triangle__cap"
                  x1={f(corner.cap[0].x)}
                  y1={f(corner.cap[0].y)}
                  x2={f(corner.cap[1].x)}
                  y2={f(corner.cap[1].y)}
                />
              )}
            </g>
          )
        })}
        {shape.shape.points.length < 2 ? null : shape.shape.closed ? (
          <polygon className="level-triangle__shape" points={pointsOf(shape.shape.points)} />
        ) : (
          <polyline className="level-triangle__line" points={pointsOf(shape.shape.points)} />
        )}
        {TRIANGLE_SPORTS.map((sport) => {
          const { band, dot } = corners[sport]
          if (dot === null) return null
          return (
            <g key={sport} data-sport={sport}>
              {band === null
                ? null
                : [0, 1].map((layer) => (
                    <line
                      key={layer}
                      className="level-triangle__band"
                      x1={f(band[0].x)}
                      y1={f(band[0].y)}
                      x2={f(band[1].x)}
                      y2={f(band[1].y)}
                    />
                  ))}
              <circle className="level-triangle__dot" cx={f(dot.x)} cy={f(dot.y)} r="6" />
            </g>
          )
        })}
      </svg>
      {TRIANGLE_SPORTS.map((sport) => {
        const corner = corners[sport]
        const place = {
          '--x': `${(corner.tip.x / SIZE) * 100}%`,
          '--y': `${(corner.tip.y / SIZE) * 100}%`,
        } as CSSProperties
        const props = {
          className: 'level-triangle__corner',
          'data-sport': sport satisfies TriangleSport,
          'data-at': corner.tip.y < centre.y ? 'top' : 'bottom',
          style: place,
        }
        const body = (
          <>
            <span className="level-triangle__label">{TRIANGLE_TITLE[sport]}</span>{' '}
            <Words corner={corner} note={view.notes[sport]} />
          </>
        )
        const href = linked ? TRIANGLE_HREF[sport] : null
        return href === null ? (
          <span key={sport} {...props}>
            {body}
          </span>
        ) : (
          <a key={sport} {...props} href={href}>
            {body}
          </a>
        )
      })}
    </div>
  )
}
