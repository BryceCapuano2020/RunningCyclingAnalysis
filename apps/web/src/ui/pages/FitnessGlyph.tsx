import type { ReactNode } from 'react'
import type { FitnessGlyphKey } from '../fitnessModel'
import './FitnessGlyph.css'

/** Each state's shape on a 24 unit grid: a line with a head for the way it is going, never a colour alone. */
const SHAPES: Record<FitnessGlyphKey, ReactNode> = {
  slipping: (
    <>
      <path d="M3.5 6.5l6 6 3.5-3.5 7 7" />
      <path d="M20.5 10.5v6h-6" />
    </>
  ),
  holding: (
    <>
      <path d="M3.5 12h16" />
      <path d="M15.5 7.5l4.5 4.5-4.5 4.5" />
    </>
  ),
  'holding-below': (
    <>
      <path className="fitness-glyph__old" d="M4 5.5h16" />
      <path d="M3.5 15h14" />
      <path d="M13.5 10.5l4.5 4.5-4.5 4.5" />
    </>
  ),
  recovering: (
    <>
      <path d="M3.5 7l5 9 4-4.5 7.5-7" />
      <path d="M14 4.5h6v6" />
    </>
  ),
  improving: (
    <>
      <path d="M3.5 17.5l6-6 4 4 7-8" />
      <path d="M14.5 7.5h6v6" />
    </>
  ),
  back: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M7.5 12.5l3 3 6-6.5" />
    </>
  ),
  waiting: (
    <>
      <circle className="fitness-glyph__old" cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 9 9" />
    </>
  ),
}

/** The state's shape, hidden from assistive technology: the label beside it says the state. */
export function FitnessGlyph({ glyph }: { glyph: FitnessGlyphKey }) {
  return (
    <svg
      className="fitness-glyph"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {SHAPES[glyph]}
    </svg>
  )
}
