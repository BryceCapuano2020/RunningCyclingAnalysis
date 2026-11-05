import type { ReactNode } from 'react'
import type { Sport } from '@rca/core/types'
import { Definition } from '../components/Definition'
import '../components/RowList.css'
import './StatTile.css'

export interface StatTileProps {
  /** The sport whose figure this is, whose ink its row's index takes; none for a figure of both. */
  sport?: Sport
  heading: string
  /** A word in the heading to define in place, such as "threshold", and what it means. */
  definition?: { term: string; meaning: string }
  /** The figure at the right of the title, with its unit and a second reading beside it. */
  figure?: { number: string; unit: string; side?: string }
  children?: ReactNode
}

/** The heading, with the one word that is defined in place set as a defined term. */
function HeadingText({ heading, definition }: Pick<StatTileProps, 'heading' | 'definition'>) {
  const at = definition === undefined ? -1 : heading.indexOf(definition.term)
  if (definition === undefined || at < 0) return <>{heading}</>
  return (
    <>
      {heading.slice(0, at)}
      <Definition meaning={definition.meaning}>{definition.term}</Definition>
      {heading.slice(at + definition.term.length)}
    </>
  )
}

/**
 * One headline number as a row's cells: the serif title and the lines that say what it rests on, then the figure in mono,
 * its second reading and the trend column, each in the row's own column, so the figures line up down the list. It carries no chip and no range shape: the title says what the figure is, and a range is said
 * in words.
 */
export function StatTile({ sport, heading, definition, figure, children }: StatTileProps) {
  return (
    <article className="stat-tile" data-sport={sport} aria-label={heading}>
      <div className="row__body stat-tile__body">
        <h3 className="row__title">
          <HeadingText heading={heading} definition={definition} />
        </h3>
        {children}
      </div>
      {/* The figure, its second reading and the (empty) trend column line up with the rows above and below. */}
      <p className="row__figure stat-tile__figure">
        {figure === undefined ? null : (
          <>
            <span className="stat-tile__number">{figure.number}</span>
            {'\u00a0'}
            <span className="row__unit stat-tile__unit">{figure.unit}</span>
          </>
        )}
      </p>
      <span className="row__sub stat-tile__side">{figure?.side}</span>
      <span className="row__spark" />
    </article>
  )
}
