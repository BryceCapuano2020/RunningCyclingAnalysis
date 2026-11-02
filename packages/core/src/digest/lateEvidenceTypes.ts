import type { PeriodDurabilityRow } from './durabilityPeriod'
import type { DriftPoint } from './driftTrend'
import type { Sport } from '../types'

/** What one sport's digests say about its late-effort output: best efforts after hours of work and drift. */
export interface LateEvidence {
  /** Late bests of every session of the sport that has them; the ruler says how hard those sessions were. */
  durability: PeriodDurabilityRow[]
  /** Every steady effort's drift, earliest first. */
  drift: DriftPoint[]
  /** How hard the sessions behind the durability were; null without a reference or any such session. */
  ruler?: EffortRuler | null
  /** Set when the period held too few long sessions and the durability rows are the whole library's. Absent: the period's. */
  durabilityPooled?: true
  /** Set when the period held too few steady efforts and the drift is the whole library's. Absent: the period's. */
  driftPooled?: true
}

/** The sessions behind a figure, and how hard they were: the lowest and highest peak heart rate over the reference. */
export interface EffortRuler {
  sessions: number
  lowShare: number
  highShare: number
}

export type LateEvidenceBySport = Record<Sport, LateEvidence>

/** The evidence of a period with no activities. Types only are imported here, so the page can hold it without the digest code. */
export const NO_LATE_EVIDENCE: LateEvidenceBySport = {
  run: { durability: [], drift: [], ruler: null },
  ride: { durability: [], drift: [], ruler: null },
}
