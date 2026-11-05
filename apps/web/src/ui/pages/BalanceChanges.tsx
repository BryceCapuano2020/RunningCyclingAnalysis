import { withThe } from '../previousLabel'
import { MAX_CHANGES, noChangeText } from './balanceChangeItems'
import type { BalanceChangesResult } from './balanceChangeItems'
import { RowIndex } from '../components/RowList'
import './BalanceChanges.css'
import { NumText } from '../components/NumText'

export interface BalanceChangesProps {
  /** What moved since the previous period; null when the period has no previous one, so the section is left out. */
  changes: BalanceChangesResult | null
  /** What the changes are against: "Previous 12 weeks", or the months of an earlier window such as "Jan to Mar". */
  previousLabel: string | null
}

/**
 * What changed against the previous period, or against the latest earlier window that held enough to compare: a
 * heading, what it is against as a meta line (left out when the one sentence of no change says it), and at most four numbered rows, each a title and a line. An item is
 * listed only where the change test calls it. With nothing called, the section says so in one line; with nothing to
 * compare, and under all time, it is left out.
 */
export function BalanceChanges({ changes, previousLabel }: BalanceChangesProps) {
  if (changes === null || previousLabel === null) return null
  const { items } = changes
  // With nothing called, the sentence names what it is against, so no meta line says it first.
  const against = items.length > 0
  return (
    <section
      className="section balance-changes"
      aria-labelledby={
        against ? 'balance-changes-title balance-changes-against' : 'balance-changes-title'
      }
    >
      <div className="section__head">
        <h2 id="balance-changes-title">What changed</h2>
        {against && (
          <p id="balance-changes-against" className="meta">{`vs ${withThe(previousLabel)}`}</p>
        )}
      </div>
      {items.length === 0 ? (
        <p className="balance-changes__empty">
          <NumText text={noChangeText(previousLabel)} />
        </p>
      ) : (
        <ol className="rows" data-count={Math.min(items.length, MAX_CHANGES)}>
          {items.map((item, index) => (
            <li key={item.key} className="row" data-sport={item.sport}>
              <RowIndex index={index} />
              <div className="row__body">
                <h3 className="row__title">
                  <NumText text={item.title} />
                </h3>
                <p className="row__line">
                  <NumText text={item.body} />
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
