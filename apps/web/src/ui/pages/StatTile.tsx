import type { ReactNode } from 'react'
import type { Sport } from '@rca/core/types'
import { Definition } from '../components/Definition'
import './StatTile.css'

export interface StatTileProps {
  /** The sport whose figure this is, which sets its dot's colour; none for a figure of both. */
  sport?: Sport
  heading: string
  /** A word in the heading to define in place, such as "threshold", and what it means. */
  definition?: { term: string; meaning: string }
  /** The tile's figure, set large, with its unit and a second reading beside it. */
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
 * One headline number: a sport dot, its name, the figure at display size, and the lines that say what it rests on. It carries
 * no chip and no range shape: the name says what the figure is, and a range is said in words.
 */
export function StatTile({
  sport,
  heading,
  definition,
  figure,
  children,
}: StatTileProps) {
  return (
    <article className="stat-tile" data-sport={sport} aria-label={heading}>
      <div className="stat-tile__head">
        <span className="stat-tile__dot" aria-hidden="true" />
        <h3 className="tag stat-tile__name">
          <HeadingText heading={heading} definition={definition} />
        </h3>
      </div>
      {figure === undefined ? null : (
        <p className="stat-tile__figure">
          <span className="display stat-tile__number">{figure.number}</span>
          <span className="stat-tile__unit">{figure.unit}</span>
          {figure.side === undefined ? null : (
            <span className="stat-tile__side">{figure.side}</span>
          )}
        </p>
      )}
      {children}
    </article>
  )
}
