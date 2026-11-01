import { useState } from 'react'
import type { Route } from '../route'
import type { UnitSystem } from '@rca/core/units'
import { sampleDescription } from '../sampleAthlete'

/** Said once at full width while the sample is loaded. It says the sample is not kept. */
const bannerText = (units: UnitSystem) =>
  `Sample athlete, ${sampleDescription(units)}. Not kept: add files to replace it.`
const PILL_LABEL = 'Sample athlete'

export interface SampleNoticeProps {
  /** The page on screen. The banner shows in full on the first page the sample is seen on. */
  page: Route['page']
  /** Whether the sample is loaded with a result on screen. */
  shown: boolean
  /** The units the visitor reads figures in, which the sample's weight is told in. */
  units: UnitSystem
}

/**
 * The sample athlete's notice: the full banner on the first page the sample appears on, and a small
 * pill on the other pages, so the sentence does not take a line of every page. The pill opens the
 * sentence again. The banner is part of the notice region, which announces it; the pill is not.
 */
export function useSampleNotice({ page, shown, units }: SampleNoticeProps) {
  const [firstPage, setFirstPage] = useState<Route['page'] | null>(null)
  const [open, setOpen] = useState(false)
  // Noted during render, as the notices note their changes, so the first frame already has the banner.
  if (shown && firstPage === null) setFirstPage(page)
  if (!shown && firstPage !== null) {
    setFirstPage(null)
    setOpen(false)
  }
  // The sentence is on the first page for as long as the sample is loaded; the pages after it carry the pill.
  const banner = shown && (firstPage === null || firstPage === page)
  return {
    banner: banner ? <p className="sample-banner">{bannerText(units)}</p> : null,
    pill:
      shown && !banner ? (
        <div className="sample-pill">
          <button
            type="button"
            className="sample-pill__button"
            aria-expanded={open}
            onClick={() => setOpen((was) => !was)}
          >
            {PILL_LABEL}
          </button>
          {open && <p className="sample-pill__text">{bannerText(units)}</p>}
        </div>
      ) : null,
  }
}
