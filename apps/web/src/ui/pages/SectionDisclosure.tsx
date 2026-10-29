import { useState } from 'react'
import type { ReactNode } from 'react'
import './SectionDisclosure.css'

export interface SectionDisclosureProps {
  /** The element id the page's "On this page" list scrolls to and opens. */
  id: string
  /** The section's name, in small capitals: what a collapsed row is called. */
  title: string
  /** What the section found, one sentence: the row says it while it is closed, so closed still tells something. */
  finding: string
  children: ReactNode
}

/**
 * A section behind a disclosure, closed until opened. Its summary is the section's name and its finding in
 * one line, so a closed section still says what it found. The body mounts the first time it opens, so a
 * chart is never measured while it is hidden and a closed section costs nothing. The wrapper is a named
 * region, so the page's outline has the section whether it is open or not.
 */
export function SectionDisclosure({ id, title, finding, children }: SectionDisclosureProps) {
  const [mounted, setMounted] = useState(false)
  return (
    <section className="sport-disclosure" aria-label={title}>
      <details
        id={id}
        className="sport-disclosure__details"
        onToggle={(event) => {
          if (event.currentTarget.open) setMounted(true)
        }}
      >
        <summary className="sport-disclosure__summary">
          <span className="sport-disclosure__title">{title}</span>
          <span className="sport-disclosure__finding">{finding}</span>
        </summary>
        <div className="sport-disclosure__body">{mounted ? children : null}</div>
      </details>
    </section>
  )
}
