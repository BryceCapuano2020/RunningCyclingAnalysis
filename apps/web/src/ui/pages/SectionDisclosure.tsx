import { useState } from 'react'
import type { ReactNode } from 'react'
import './SectionDisclosure.css'

export interface SectionDisclosureProps {
  /** The element id the page's "On this page" list scrolls to and opens. */
  id: string
  /** The section's name, in small capitals: what a collapsed row is called. */
  title: string
  /** What the section found, one sentence: the row says it while it is closed, so closed still tells something. A section with nothing to add to its name has none. */
  finding?: string
  /** Set when the body says the finding already, so the row says it only while the section is closed. */
  restated?: boolean
  children: ReactNode
}

/**
 * A section with content, open to start with: nothing the library can say is behind a press. Its summary is the
 * section's name and its finding in one line, so a section the reader folds still says what it found. Open, it is a
 * band like every other section; folded, it is the card of one row. The body stays mounted when folded. The wrapper
 * is a named region, so the page's outline has the section whether it is open or not.
 */
export function SectionDisclosure({
  id,
  title,
  finding,
  restated = false,
  children,
}: SectionDisclosureProps) {
  const [open, setOpen] = useState(true)
  return (
    <section
      className={`${open ? 'band' : 'panel'} sport-disclosure`}
      aria-label={title}
      data-restated={restated ? '' : undefined}
    >
      <details
        id={id}
        open
        className="sport-disclosure__details"
        onToggle={(event) => setOpen(event.currentTarget.open)}
      >
        <summary className="sport-disclosure__summary">
          <span className="sport-disclosure__title">{title}</span>
          {finding !== undefined && <span className="sport-disclosure__finding">{finding}</span>}
        </summary>
        <div className="sport-disclosure__body">{children}</div>
      </details>
    </section>
  )
}
