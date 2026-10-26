import { useId, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { EXPORT_GUIDES, GUIDES_CHECKED_ON } from '../exportGuides'
import type { ExportGuide } from '../exportGuides'
import { SampleButton } from './SampleButton'
import './ExportGuides.css'

/**
 * Where a guide's steps came from, and when they were checked. Only a guide checked on its own help
 * page names that page; the rest say published guides, so the line never claims more than it read.
 */
function sourceLine(guide: ExportGuide): string {
  const from = guide.verified ? `${guide.helpName}’s help` : 'published guides'
  return `Steps from ${from}, checked ${GUIDES_CHECKED_ON}; menus can change.`
}

export interface ExportGuidesProps {
  /**
   * Offers the sample at the wait step of a guide. Left out where the sample would replace the
   * visitor's own data, such as from a result.
   */
  sample?: { busy: boolean; onSample: () => void }
  /** Lets the page focus this section's heading, such as from a link in the drop zone. */
  headingRef?: RefObject<HTMLHeadingElement | null>
}

/**
 * How to get the activity files out of each service. One service shows at a time: its tile is
 * expanded and its steps fill the panel under the tiles. Opening a tile moves focus to the panel's
 * heading, so the steps are read from the top. The first service is open on arrival.
 */
export function ExportGuides({ sample, headingRef }: ExportGuidesProps) {
  const [index, setIndex] = useState(0)
  const headingId = useId()
  const panelId = useId()
  const panelHeadingId = useId()
  const panelHeadingRef = useRef<HTMLHeadingElement>(null)
  const guide = EXPORT_GUIDES[index]!

  function openService(position: number) {
    setIndex(position)
    panelHeadingRef.current?.focus()
  }

  return (
    <section className="export-guides" aria-labelledby={headingId}>
      <h2 id={headingId} ref={headingRef} tabIndex={-1}>
        How to get your files
      </h2>
      <div className="export-guides__tiles" role="group" aria-label="Services">
        {EXPORT_GUIDES.map((item, position) => (
          <button
            key={item.service}
            type="button"
            className="export-guides__tile"
            aria-expanded={position === index}
            aria-controls={panelId}
            onClick={() => openService(position)}
          >
            {item.service}
          </button>
        ))}
      </div>
      <div id={panelId} className="export-guide" role="region" aria-labelledby={panelHeadingId}>
        <h3 id={panelHeadingId} ref={panelHeadingRef} tabIndex={-1}>
          Steps for {guide.service}
        </h3>
        <ol className="export-guide__steps">
          {guide.steps.map((step, position) => (
            <li key={step}>
              {step}
              {sample && position === guide.waitStep ? (
                <SampleButton busy={sample.busy} onSample={sample.onSample}>
                  Try the sample while you wait
                </SampleButton>
              ) : null}
            </li>
          ))}
        </ol>
        <p className="secondary">{guide.contains}</p>
        {guide.alsoAvailable ? <p className="secondary">{guide.alsoAvailable}</p> : null}
        <p className="export-guide__checked secondary">{sourceLine(guide)}</p>
        <a href={guide.helpUrl} rel="noopener noreferrer">
          Open {guide.helpName}’s help
        </a>
      </div>
      <div className="export-guides__none">
        <h3>No files yet, or only a phone?</h3>
        <p className="secondary">
          Wahoo’s steps use its phone app. The other services’ steps are written for a computer:
          save the files there, then choose them here.
        </p>
      </div>
    </section>
  )
}
