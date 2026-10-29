import { profileSentence } from '@rca/core/profile'
import type { ReadyProfile } from '@rca/core/profile'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import { profileOf } from '../durationProfile'
import { effortLabel } from '../records'

/** What the bests say once they can be compared, or null while they cannot; standOutLack says why. */
export function standOutOf(result: AnalysisResult, sport: Sport): ReadyProfile | null {
  const profile = profileOf(result, sport)
  return profile.status === 'ready' ? profile : null
}

/** The closed row's finding: where a best stands out from the rest of the athlete's own curve. */
export function standOutFinding(profile: ReadyProfile): string {
  return profileSentence(profile, effortLabel)
}
