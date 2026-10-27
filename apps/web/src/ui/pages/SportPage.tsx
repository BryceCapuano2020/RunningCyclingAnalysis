import { Fragment, useState } from 'react'
import { SportIcon } from '../components/icons'
import { countSport } from '../records'
import { SPORT_LABEL } from '../sports'
import { PAGE_HEADING_ID } from './pageHeading'
import { SportAnswer } from './SportAnswer'
import type { SportPageProps } from './sportPageProps'
import { sectionsOf } from './sportSections'
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
 * One sport's page: the answer, the period control under it, then the sport's sections in the order its
 * list in sportSections gives. A section with nothing to show leaves no heading; its reason is in the list
 * at the end.
 */
export function SportPage(props: SportPageProps) {
  const { sport, result, weighted, controls, footnote = null, inLibrary } = props
  const count = countSport(result.activities, sport)
  // The time the page was opened at, read once so a later render does not move a record's age.
  const [openedAt] = useState(() => Date.now())
  // A ride's figures use the body mass, so the page holds them until the weight is entered.
  const held = sport === 'ride' && !weighted
  const sections = held || count === 0 ? [] : sectionsOf(sport, { ...props, count, openedAt })
  return (
    <div className="page-stack">
      <div className="page-head">
        <h1 id={PAGE_HEADING_ID} tabIndex={-1} className="sport-page__title">
          <SportIcon sport={sport} />
          {SPORT_LABEL[sport]}
        </h1>
      </div>
      {/* The answer is one slot, and the period control the next child in every state, so the control keeps
          its parent and place, and its focus, when a pick takes the sport to or from zero activities. */}
      <SportAnswer {...props} count={count} held={held} />
      {inLibrary > 0 ? controls : null}
      {sections.map(({ id, content }) => (
        <Fragment key={id}>{content}</Fragment>
      ))}
      <NotEnoughYet lacks={sections.flatMap(({ lack }) => (lack === null ? [] : [lack]))} />
      {footnote}
    </div>
  )
}
