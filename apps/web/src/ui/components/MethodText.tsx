import type { ReactNode } from 'react'
import './MethodText.css'

/**
 * A section's prose, set in columns at the reading measure: two on a wide page, one where they do not fit.
 * Charts and their disclosures stay outside it, at the full width.
 */
export function MethodText({ children }: { children: ReactNode }) {
  return <div className="method__text">{children}</div>
}
