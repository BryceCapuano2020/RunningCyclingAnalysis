import { PropertyList } from '../components/PropertyList'
import type { LiftTileModel } from '../lift/liftTile'
import { hrefFor } from '../route'
import { DETAIL_TERM } from './ThresholdBasis'
import { StatTile } from './StatTile'

/**
 * Lifting as the third row under the hero: the projected one-rep max of the big three as the big number (the total with all
 * three, else the heaviest one, named), and each lift's grade and one-rep max in Details. With no estimate, the quiet line that
 * sends the athlete to the Lift page to log one.
 */
export function LiftTile({ tile }: { tile: LiftTileModel }) {
  if (tile.figure === null) {
    return (
      <StatTile heading={tile.heading}>
        <p className="stat-tile__line">
          <a className="stat-tile__link" href={hrefFor({ page: 'lift' })}>
            Log a squat, bench or deadlift
          </a>
        </p>
      </StatTile>
    )
  }
  return (
    <StatTile heading={tile.heading} figure={tile.figure}>
      <div className="stat-tile__source">
        <details className="disclosure">
          <summary>
            {DETAIL_TERM}
            <span className="sr-only">{' for the big three'}</span>
          </summary>
          <div className="disclosure__body">
            <PropertyList rows={tile.rows} />
          </div>
        </details>
      </div>
    </StatTile>
  )
}
