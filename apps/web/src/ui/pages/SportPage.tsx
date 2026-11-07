import { useState } from 'react'
import { NO_ROWS } from '../components/property'
import type { Property } from '../components/property'
import { indoorSplitRow } from '../indoorCopy'
import { countSport } from '../records'
import { formRows } from '../sportForm'
import { SPORT_LABEL } from '../sports'
import { PAGE_HEADING_ID } from './pageHeading'
import { PageDetails } from './PageDetails'
import { FitnessSection } from './FitnessSection'
import { SportAnswer } from './SportAnswer'
import type { SportPageProps } from './sportPageProps'
import { layoutOf } from './sportSections'
import './SportPage.css'

export type { SportPageProps } from './sportPageProps'

/**
 * One sport's page: the title with its one ▸ Details (the last activity and the period's dates and counts), the
 * answer, then the sections as the rows of its list in sportSections give, each open to start with and each saying its finding on its row.
 * A section the library cannot fill yet is one line in its own place that says what to add: none leaves the page.
 */
export function SportPage(props: SportPageProps) {
  const {
    sport,
    result,
    weighted,
    controls,
    periodRows = NO_ROWS,
    footnote = null,
    inLibrary,
    units,
    fitness,
    library,
  } = props
  const count = countSport(result.activities, sport)
  // The time the page was opened at, read once so a later render does not move a record's age.
  const [openedAt] = useState(() => Date.now())
  // A ride's figures use the body mass, so the page holds them until the weight is entered.
  const held = sport === 'ride' && !weighted
  const rows = held || count === 0 ? [] : layoutOf(sport, { ...props, count, openedAt })
  // The Details under the title: the last activity and the distance, the period's rows (which give the count), and the
  // split between indoor and outdoor, which qualifies the answer, so it is said here, once.
  const split = count === 0 || held ? null : indoorSplitRow(result.activities, sport)
  const details: Property[] = [
    ...(count === 0 || held ? [] : formRows(result.activities, sport, units, openedAt)),
    ...(inLibrary > 0 ? periodRows : []),
    ...(split === null ? [] : [split]),
  ]
  return (
    <div className="page-stack sport-page" data-sport={sport}>
      <div className="sport-page__head">
        <h1 id={PAGE_HEADING_ID} tabIndex={-1} className="sport-page__title">
          {SPORT_LABEL[sport]}
        </h1>
        {inLibrary > 0 ? controls : null}
        <PageDetails rows={details} />
      </div>
      <SportAnswer {...props} count={count} held={held} />
      {/* The fitness status sits directly under the hero: it is library-wide, so it does not wait on the period. */}
      {fitness && !held && count > 0 ? (
        <FitnessSection fitness={fitness} units={units} library={library} sport={sport} />
      ) : null}
      {rows.map(({ key, cells }) => (
        <div key={key} className={cells.length > 1 ? 'sport-row sport-row--pair' : 'sport-row'}>
          {cells.map(({ id, node }) => (
            <div key={id} className="sport-row__cell">
              {node}
            </div>
          ))}
        </div>
      ))}
      {footnote}
    </div>
  )
}
