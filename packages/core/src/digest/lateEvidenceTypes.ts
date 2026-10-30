import type { PeriodDurabilityRow } from './durabilityPeriod'
import type { DriftPoint } from './driftTrend'
import type { Sport } from '../types'

/** What one sport's digests say about its late-effort output: best efforts after hours of work and drift. */
export interface LateEvidence {
  /** Late bests of the sessions that reached a hard heart rate (see `EffortRuler`); all sessions without a reference. */
  durability: PeriodDurabilityRow[]
  /** Every steady effort's drift, earliest first. */
  drift: DriftPoint[]
  /** How hard the sessions behind the durability were; null without a reference or any such session. */
  ruler?: EffortRuler | null
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
