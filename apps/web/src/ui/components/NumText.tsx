import { Fragment } from 'react'

/** A figure inside a sentence: digits with their separators, a sign and a decimal point, such as "−5", "3:40" or "1,234.5". */
const FIGURE = /([+−-]?\d[\d,.:]*\d|[+−-]?\d)/

/**
 * A sentence with each figure in it set as `.num`, the mono with tabular figures (docs/design/system.md, Type). The
 * words are unchanged: this only marks where the numbers are.
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
