import { useState } from 'react'
import type { Route } from '../route'
import { SAMPLE_DESCRIPTION } from '../sampleAthlete'

/** Said once at full width while the sample is loaded. It says the sample is not kept. */
export const SAMPLE_BANNER = `Sample athlete, ${SAMPLE_DESCRIPTION}. Not kept: add files to replace it.`
const PILL_LABEL = 'Sample athlete'

export interface SampleNoticeProps {
  /** The page on screen. The banner shows in full on the first page the sample is seen on. */
  page: Route['page']
  /** Whether the sample is loaded with a result on screen. */
  shown: boolean
}

/**
 * The sample athlete's notice: the full banner on the first page the sample appears on, then a small
 * pill on the pages after it, so the sentence does not take a line of every page. The pill opens the
 * sentence again. The banner is part of the notice region, which announces it; the pill is not.
 */
export function useSampleNotice({ page, shown }: SampleNoticeProps) {
  const [firstPage, setFirstPage] = useState<Route['page'] | null>(null)
  const [open, setOpen] = useState(false)
  // Noted during render, as the notices note their changes, so the first frame already has the banner.
  if (shown && firstPage === null) setFirstPage(page)
  if (!shown && firstPage !== null) {
    setFirstPage(null)
    setOpen(false)
  }
  const banner = shown && (firstPage === null || firstPage === page)
  return {
    banner: banner ? <p className="sample-banner">{SAMPLE_BANNER}</p> : null,
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
          {open && <p className="sample-pill__text">{SAMPLE_BANNER}</p>}
        </div>
      ) : null,
  }
}
