import { Fragment } from 'react'
import { NumText } from './NumText'
import { paragraphsOf } from './paragraphs'

/**
 * Method lines as paragraphs. Each line stays one sentence in a span of its own, so a test or a reader of
 * the source finds the lines one by one, and a run of them reads as text.
 */
export function MethodLines({ lines }: { lines: readonly string[] }) {
  return (
    <>
      {paragraphsOf(lines).map((paragraph) => (
        <p key={paragraph[0]} className="secondary">
          {paragraph.map((line, index) => (
            <Fragment key={line}>
              {index > 0 && ' '}
              <span className="method__line">
                <NumText text={line} />
              </span>
            </Fragment>
          ))}
        </p>
      ))}
    </>
  )
}
