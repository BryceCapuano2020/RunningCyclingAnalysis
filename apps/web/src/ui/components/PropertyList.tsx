import { MethodSectionLink } from './GradingLink'
import type { Property } from './property'
import './PropertyList.css'

/** Each row with a key that is its label, and its label and place when the label repeats. */
function keyed(rows: readonly Property[]): { key: string; row: Property }[] {
  const seen = new Map<string, number>()
  return rows.map((row) => {
    const count = seen.get(row.label) ?? 0
    seen.set(row.label, count + 1)
    return { key: `${row.label}#${count}`, row }
  })
}

/**
 * A detail panel (docs/design/system.md, Detail panels): one fact per row, the label in serif on the left and the value in
 * mono on the right, aligned down the panel. Method and caveat prose is not here: it lives on Method, and the panel ends
 * with one "Method" link to the section that explains it. Nothing is drawn when there are no rows.
 */
export function PropertyList({
  rows,
  method,
  methodName,
}: {
  rows: readonly Property[]
  /** The id of the Method section that explains these figures, from SECTION_ID. */
  method?: string
  /** What the link explains, said to a screen reader after "Method", so panels on one page are told apart. */
  methodName?: string
}) {
  if (rows.length === 0) return null
  return (
    <div className="props">
      <dl className="props__list">
        {keyed(rows).map(({ key, row }) => (
          <div key={key} className="props__row">
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      {method === undefined ? null : (
        <MethodSectionLink sectionId={method} className="props__method">
          Method
          {methodName === undefined ? null : <span className="sr-only">{`, ${methodName}`}</span>}
        </MethodSectionLink>
      )}
    </div>
  )
}
