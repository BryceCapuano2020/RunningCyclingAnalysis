import { useState } from 'react'
import { countSport } from '../records'
import { formLine } from '../sportForm'
import { SPORT_LABEL } from '../sports'
import { PAGE_HEADING_ID } from './pageHeading'
import { FitnessSection } from './FitnessSection'
import { SectionNav } from './SectionNav'
import { SportAnswer } from './SportAnswer'
import type { SportPageProps } from './sportPageProps'
import { layoutOf } from './sportSections'
import './SportPage.css'

export type { SportPageProps } from './sportPageProps'

/**
 * One sport's page: the answer, the period control under it, a row that jumps to each section, then the sections
 * as the rows of its list in sportSections give, each open to start with and each saying its finding on its row.
 * A section the library cannot fill yet is one line in its own place that says what to add: none leaves the page.
 */
export function SportPage(props: SportPageProps) {
  const {
    sport,
    result,
    weighted,
    controls,
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
  const form = count === 0 ? null : formLine(result.activities, sport, units, openedAt, onFile)
  return (
    <div className="page-stack sport-page" data-sport={sport}>
      <div className="sport-page__head">
        <h1 id={PAGE_HEADING_ID} tabIndex={-1} className="sport-page__title">
          {SPORT_LABEL[sport]}
        </h1>
        {form && !held && <p className="meta sport-page__form">{form}</p>}
        {inLibrary > 0 ? controls : null}
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
