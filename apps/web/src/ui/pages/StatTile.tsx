import type { ReactNode } from 'react'
import type { Sport } from '@rca/core/types'
import { Definition } from '../components/Definition'
import './StatTile.css'

/** What kind of evidence a tile's figure is: a model's estimate, a held floor, an equivalent, or recorded. */
export type TileBasis = 'estimated' | 'recorded' | 'equivalent' | 'floor'

const BASIS_TEXT: Record<TileBasis, string> = {
  estimated: 'Estimated',
  recorded: 'Recorded',
  equivalent: 'As running',
  floor: 'At least',
}

/**
 * The chip that says what kind of evidence a figure is, a ring for an estimate and a dot for what was recorded. A
 * `label` names the figure itself, such as "Best 12 min", in place of the kind's word.
 */
export function BasisChip({ basis, label }: { basis: TileBasis; label?: string }) {
  return (
    <span className={`tag tag--ink tag--small stat-tile__basis stat-tile__basis--${basis}`}>
      {label ?? BASIS_TEXT[basis]}
    </span>
  )
}

export interface StatTileProps {
  /** The sport whose figure this is, which sets its dot and its range track's colour; none for a figure of both. */
  sport?: Sport
  heading: string
  /** A word in the heading to define in place, such as "threshold", and what it means. */
  definition?: { term: string; meaning: string }
  /** One line under the heading that says what the figure is, such as how long it could be held. */
  gloss?: string
  /** What kind of evidence the figure is; left out where the tile has no figure to give evidence for. */
  basis?: TileBasis
  /** The chip's words when the figure is named by what it is, such as "Best 12 min", rather than by its kind. */
  basisLabel?: string
  /** The tile's figure, set large, with its unit and a second reading beside it. */
  figure?: { number: string; unit: string; side?: string }
  /** The range shape under the figure, when the figure has a range to draw. */
  track?: ReactNode
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
 * One headline number: a sport dot, its name, an evidence chip, the figure at display size, the range as a
 * shape, and a line that says what it rests on. The chip is a shape as well as a word: a ring for an
 * estimate, a solid dot for a recorded figure.
 */
export function StatTile({
  sport,
  heading,
  definition,
  gloss,
  basis,
  basisLabel,
  figure,
  track,
  children,
}: StatTileProps) {
  return (
    <article className="stat-tile" data-sport={sport} aria-label={heading}>
      <div className="stat-tile__head">
        <span className="stat-tile__dot" aria-hidden="true" />
        <h3 className="tag stat-tile__name">
          <HeadingText heading={heading} definition={definition} />
        </h3>
        {basis === undefined ? null : <BasisChip basis={basis} label={basisLabel} />}
      </div>
      {gloss === undefined ? null : <p className="stat-tile__gloss">{gloss}</p>}
      {figure === undefined ? null : (
        <p className="stat-tile__figure">
          <span className="display stat-tile__number">{figure.number}</span>
          <span className="stat-tile__unit">{figure.unit}</span>
          {figure.side === undefined ? null : (
            <span className="stat-tile__side">{figure.side}</span>
          )}
        </p>
      )}
      {track}
      {children}
    </article>
  )
}
