import type { PeriodDurabilityRow } from './durabilityPeriod'
import type { DriftPoint } from './driftTrend'
import type { Sport } from '../types'

/** What one sport's digests say about its late-effort output: best efforts after hours of work and drift. */
export interface LateEvidence {
  durability: PeriodDurabilityRow[]
  /** Every steady effort's drift, earliest first. */
  drift: DriftPoint[]
}

export type LateEvidenceBySport = Record<Sport, LateEvidence>

/** The evidence of a period with no activities. Types only are imported here, so the page can hold it without the digest code. */
export const NO_LATE_EVIDENCE: LateEvidenceBySport = {
  run: { durability: [], drift: [] },
  ride: { durability: [], drift: [] },
}
