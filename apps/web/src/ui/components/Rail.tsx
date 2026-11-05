import type { ReactNode } from 'react'
import type { Route } from '../route'
import { hrefFor } from '../route'
import { SPORT_LABEL } from '../sports'
import { ariaCurrentOf, sectionOf } from './sectionOf'
import './Rail.css'

/** The rail's pages, in its order. History and Activities are the header's (Header.tsx). */
const SECTIONS: { label: string; page: 'balance' | 'run' | 'ride' }[] = [
  { label: 'Balance', page: 'balance' },
  { label: SPORT_LABEL.run, page: 'run' },
  { label: SPORT_LABEL.ride, page: 'ride' },
]

export interface RailProps {
  route: Route
  /** The period control's choices, on the pages the period moves; null on the others. */
  periods?: ReactNode
}

/** The shell under the header: the rail and the page beside it (or under it, below the rail's width). */
export function Shell({ route, periods = null, children }: RailProps & { children: ReactNode }) {
  return (
    <div className="shell">
      <Rail route={route} periods={periods} />
      <div className="shell__page">{children}</div>
    </div>
  )
}

/**
 * The text rail: Balance, Run and Ride, a rule, then the periods. The current page and period are ink and the others
 * the secondary ink, with no icon, box or bar. From the rail's width it is a column left of the page that stays in
 * view; below it, one row across the top of the page that scrolls sideways inside itself.
 */
export function Rail({ route, periods = null }: RailProps) {
  const current = sectionOf(route)
  return (
    <div className="rail">
      <nav className="rail__pages" aria-label="Pages">
        {SECTIONS.map(({ label, page }) => (
          <a
            key={page}
            className={current === page ? 'rail__link rail__link--current' : 'rail__link'}
            href={hrefFor({ page })}
            aria-current={ariaCurrentOf(route, page, current)}
          >
            {label}
          </a>
        ))}
      </nav>
      {periods === null ? null : <div className="rail__periods">{periods}</div>}
    </div>
  )
}
