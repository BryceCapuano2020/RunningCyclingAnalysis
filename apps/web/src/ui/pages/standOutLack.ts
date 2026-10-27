import { PROFILE_UNFIT_TEXT } from '@rca/core/profile'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import { profileNeedsText, profileOf } from '../durationProfile'
import { lackLine } from './lackLine'

/** The finding's name in the page's "Not enough yet" list, since it has no heading of its own. */
const FINDING_NAME = 'Where your bests stand out'

/**
 * Why a sport's bests cannot be compared with each other yet, as a "Not enough yet" line, or null when
 * they can be.
 */
export function standOutLack(sport: Sport, result: AnalysisResult): string | null {
  const profile = profileOf(result, sport)
  if (profile.status === 'ready') return null
  return lackLine(
    FINDING_NAME,
    profile.status === 'missing' ? profileNeedsText(sport, profile.missing) : PROFILE_UNFIT_TEXT,
  )
}
