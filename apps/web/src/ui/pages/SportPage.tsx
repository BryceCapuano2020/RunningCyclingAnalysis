import { useState } from 'react'
import { NumText } from '../components/NumText'
import { indoorSplitLine } from '../indoorCopy'
import { countSport } from '../records'
import { formLine } from '../sportForm'
import { SPORT_LABEL } from '../sports'
import { PAGE_HEADING_ID } from './pageHeading'
import { PageDetails } from './PageDetails'
import { FitnessSection } from './FitnessSection'
import { SectionNav } from './SectionNav'
import { SportAnswer } from './SportAnswer'
import type { SportPageProps } from './sportPageProps'
import { layoutOf } from './sportSections'
import './SportPage.css'

export type { SportPageProps } from './sportPageProps'

/**
 * One sport's page: the title with one ▸ Details under it (the last activity and the period's dates and counts), the answer, a row that jumps to each section, then the sections
 * as the rows of its list in sportSections give, each open to start with and each saying its finding on its row.
 * A section the library cannot fill yet is one line in its own place that says what to add: none leaves the page.
 */
export function SportPage(props: SportPageProps) {
  const {
    sport,
    result,
    weighted,
    controls,
    periodLine = null,
    periodCounts = false,
    footnote = null,
    inLibrary,
    units,
    fitness,
    library,
    onFile,
  } = props
  const count = countSport(result.activities, sport)
  // The time the page was opened at, read once so a later render does not move a record's age.
  const [openedAt] = useState(() => Date.now())
  // A ride's figures use the body mass, so the page holds them until the weight is entered.
  const held = sport === 'ride' && !weighted
  const { rows, nav } =
    held || count === 0 ? { rows: [], nav: [] } : layoutOf(sport, { ...props, count, openedAt })
  // The period's line gives the count when it has one, so the page's own line does not say it twice.
  const form =
    count === 0
      ? null
      : formLine(result.activities, sport, units, openedAt, periodCounts ? null : onFile)
  const split = count === 0 ? null : indoorSplitLine(result.activities, sport)
  return (
    <div className="page-stack sport-page" data-sport={sport}>
      <div className="sport-page__head">
        <h1 id={PAGE_HEADING_ID} tabIndex={-1} className="sport-page__title">
          {SPORT_LABEL[sport]}
        </h1>
        {inLibrary > 0 ? controls : null}
        {/* The last activity, the distance and the period's dates and counts are one press down, not lines under the title. */}
        <PageDetails>
          {form && !held ? <p className="meta sport-page__form">{form}</p> : null}
          {inLibrary > 0 ? periodLine : null}
          {/* The split between indoor and outdoor qualifies the answer, so it is said here, once. */}
          {split === null || held ? null : (
            <p data-testid="indoor-split">
              <NumText text={split} />
            </p>
          )}
        </PageDetails>
      </div>
      {/* The fitness status leads: it is the finding that moves, and it is library-wide, so it does not wait on the period. */}
      {fitness && !held && count > 0 ? (
        <FitnessSection fitness={fitness} units={units} library={library} sport={sport} />
      ) : null}
      <SportAnswer {...props} count={count} held={held} />
      <SectionNav items={nav} />
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
