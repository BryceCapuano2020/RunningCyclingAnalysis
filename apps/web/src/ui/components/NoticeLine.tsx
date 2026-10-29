import type { ReactNode } from 'react'
import './NoticeLine.css'

export interface NoticeLineProps {
  /** The notice in a few words: the one line that shows. */
  short: string
  /** The full sentence, one press away under Details. */
  children: ReactNode
}

/**
 * A notice that takes one line, with its full sentence under Details. The pages that carry library
 * notices stack several of them on the first screen, so each says what it is in a few words and leaves
 * the explanation to whoever opens it. The Details label is decoration for the eye: the line's name is
 * its short text, and the disclosure's state is announced by the browser.
 */
export function NoticeLine({ short, children }: NoticeLineProps) {
  return (
    <details className="notice-line">
      <summary>
        <span className="notice-line__short">{short}</span>
        <span className="notice-line__more" aria-hidden="true">
          Details
        </span>
      </summary>
      <p className="notice-line__full">{children}</p>
    </details>
  )
}
