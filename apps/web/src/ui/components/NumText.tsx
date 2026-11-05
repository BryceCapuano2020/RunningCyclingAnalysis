import { Fragment } from 'react'

/** A day as the app writes it, "3 Oct" or "27 Nov 2025", which is set as one figure. */
const DAY = '\\d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?: \\d{4})?\\b'
/** A number: digits with their separators, a sign and a decimal point, such as "−5", "3:40" or "1,234.5". */
const NUMBER = '[+−-]?\\d[\\d,.:]*\\d|[+−-]?\\d'
/** A figure inside a sentence: a day, or a number. One capture group, so split keeps the figures at the odd places. */
const FIGURE = new RegExp(`(${DAY}|${NUMBER})`)

/**
 * A sentence with each figure in it, a number or a day, set as `.num`, the mono with tabular figures (docs/design/system.md,
 * Type). The words are unchanged: this only marks where the figures are.
 */
export function NumText({ text }: { text: string }) {
  // Each part is keyed by where it starts in the sentence, and split's odd parts are the figures.
  const split = text.split(FIGURE)
  const parts = split.map((part, order) => ({
    part,
    start: split.slice(0, order).reduce((sum, before) => sum + before.length, 0),
    figure: order % 2 === 1,
  }))
  return (
    <>
      {parts.map(({ part, start, figure }) =>
        figure ? (
          <span key={start} className="num">
            {part}
          </span>
        ) : (
          <Fragment key={`text-${start}`}>{part}</Fragment>
        ),
      )}
    </>
  )
}
