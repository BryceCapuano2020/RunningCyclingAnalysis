import { useState } from 'react'
import { SportIcon } from '../components/icons'
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

/** Why some sections have nothing to show yet, in one muted list, so an empty section has no heading. */
function NotEnoughYet({ lacks }: { lacks: readonly string[] }) {
  if (lacks.length === 0) return null
  return (
    <section className="section" aria-labelledby="not-enough-yet">
      <h2 id="not-enough-yet" className="eyebrow">
        Not enough yet
      </h2>
      <ul className="muted sport-page__lacks">
        {lacks.map((lack) => (
          <li key={lack}>{lack}</li>
        ))}
      </ul>
    </section>
  )
}

/**
 * One sport's page: the answer, the period control under it, a row that jumps to each section, then the sections
 * as the rows of its list in sportSections give: the open ones, then the closed ones, each of which says its
 * finding on its closed row. A section with nothing to show leaves no card; its reason is in the list at the end.
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
  } = props
  const count = countSport(result.activities, sport)
  // The time the page was opened at, read once so a later render does not move a record's age.
  const [openedAt] = useState(() => Date.now())
  // A ride's figures use the body mass, so the page holds them until the weight is entered.
  const held = sport === 'ride' && !weighted
  const { rows, nav, lacks } =
    held || count === 0
      ? { rows: [], nav: [], lacks: [] }
      : layoutOf(sport, { ...props, count, openedAt })
  const form = count === 0 ? null : formLine(result.activities, sport, units, openedAt)
  return (
    <div className="page-stack sport-page" data-sport={sport}>
      <div className="page-head">
        <h1 id={PAGE_HEADING_ID} tabIndex={-1} className="sport-page__title">
          <SportIcon sport={sport} />
          {SPORT_LABEL[sport]}
        </h1>
        {form && !held && <p className="muted sport-page__form">{form}</p>}
      </div>
      {/* The fitness status leads: it is the finding that moves, and it is library-wide, so it does not wait on the period. */}
      {fitness && !held && count > 0 ? (
        <FitnessSection fitness={fitness} units={units} library={library} sport={sport} />
      ) : null}
      {/* The answer is one slot, and the period control the next child in every state, so the control keeps
          its parent and place, and its focus, when a pick takes the sport to or from zero activities. */}
      <SportAnswer {...props} count={count} held={held} />
      {inLibrary > 0 ? controls : null}
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
      <NotEnoughYet lacks={lacks} />
      {footnote}
    </div>
  )
}
