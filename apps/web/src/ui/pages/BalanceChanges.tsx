import { CheckIcon } from '../components/icons'
import { MAX_CHANGES, TAG_TEXT, noChangeText, notComparedText } from './balanceChangeItems'
import type { BalanceChangesResult, ChangeItem, ChangeTag } from './balanceChangeItems'
import './BalanceChanges.css'

export interface BalanceChangesProps {
  /** What moved since the previous period; null when the period has no previous one, so the strip is left out. */
  changes: BalanceChangesResult | null
  /** "Previous 12 weeks": the period the changes are against. */
  previousLabel: string | null
}

const ARROWS = {
  up: 'M12 18V6M6 11l6-6 6 6',
  down: 'M12 6v12M6 13l6 6 6-6',
} as const

/** An arrow for a change's direction, drawn on a 24 unit grid in the text's own colour. */
function Arrow({ direction }: { direction: ChangeItem['direction'] }) {
  return (
    <span className="balance-changes__icon" aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={ARROWS[direction]} />
      </svg>
    </span>
  )
}

/** The evidence tag: a recorded best is checked, and an estimate is hollow. */
function Tag({ tag }: { tag: ChangeTag }) {
  return (
    <span className={`balance-changes__tag balance-changes__tag--${tag}`}>
      {tag === 'recorded' ? <CheckIcon /> : null}
      {TAG_TEXT[tag]}
    </span>
  )
}

/**
 * What changed against the previous period: at most four items, each with an arrow, a title, a line and a tag
 * that says whether it is a recording or an estimate. An item is listed only where the change test calls it. With
 * nothing called, the strip says so in one line; where the previous period lacks the efforts to compare, it says
 * that instead; with no previous period it is left out.
 */
export function BalanceChanges({ changes, previousLabel }: BalanceChangesProps) {
  if (changes === null || previousLabel === null) return null
  const { items, notes, compared } = changes
  return (
    <section className="balance-changes" aria-labelledby="balance-changes-title">
      <h2 id="balance-changes-title" className="balance-changes__title">
        {`What changed · vs the ${previousLabel.toLowerCase()}`}
      </h2>
      {items.length === 0 && notes.length === 0 ? (
        <p className="balance-changes__empty">
          {compared ? noChangeText(previousLabel) : notComparedText(previousLabel)}
        </p>
      ) : (
        <>
          {items.length === 0 ? null : (
            <ul className="balance-changes__list" data-count={Math.min(items.length, MAX_CHANGES)}>
              {items.map((item) => (
                <li key={item.key} className="balance-changes__item">
                  <Arrow direction={item.direction} />
                  <div>
                    <p className="balance-changes__head">{item.title}</p>
                    <p className="balance-changes__body">{item.body}</p>
                    <Tag tag={item.tag} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {notes.map((note) => (
            <p key={note} className="balance-changes__empty">
              {note}
            </p>
          ))}
        </>
      )}
    </section>
  )
}
