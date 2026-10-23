import { EXPORT_GUIDES, EXPORT_GUIDES_HEADING_ID } from '../exportGuides'
import { WarningIcon } from './icons'
import './ExportGuides.css'

/** How to get the activity files out of each service. Each service is a closed details. */
export function ExportGuides() {
  return (
    <section className="export-guides" aria-labelledby={EXPORT_GUIDES_HEADING_ID}>
      <h2 id={EXPORT_GUIDES_HEADING_ID} tabIndex={-1}>
        How to get your files
      </h2>
      {EXPORT_GUIDES.map((guide) => (
        <details key={guide.service} className="export-guide">
          <summary>
            <span className="export-guide__name">{guide.service}</span>
          </summary>
          <div className="export-guide__body">
            <ol>
              {guide.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            {guide.verified ? null : (
              <p className="export-guide__note">
                <WarningIcon />
                These steps are general: menu names and delivery can differ by app version.
              </p>
            )}
            <p className="secondary">{guide.contains}</p>
            <a href={guide.helpUrl} rel="noopener noreferrer">
              {guide.helpLabel}
            </a>
          </div>
        </details>
      ))}
    </section>
  )
}
