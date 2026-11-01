import {
  PROFILE_FULL_LEVEL_ACTIVITIES,
  PROFILE_UNFIT_TEXT,
  profileSentence,
} from '@rca/core/profile'
import type { ReadyProfile } from '@rca/core/profile'
import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import type { Curve, Sport } from '@rca/core/types'
import { libraryProfileOf, profileNeedsText, profileOf } from '../durationProfile'
import { countSport, effortLabel } from '../records'

/** What the best durations say: a profile and whether it is the whole library's, or the one line that says what to add. */
export type StandOut = { profile: ReadyProfile; allTime: boolean } | { lack: string }

/**
 * Where a sport's bests stand out from the rest of its curve. The period's own profile answers when it holds
 * PROFILE_FULL_LEVEL_ACTIVITIES activities of the sport; short of that, or without a profile of its own, the bests of
 * the whole library are read when it holds more (`libraryBests`), and the answer says so. Only when neither
 * can be compared is there a lack, the first thing to add.
 */
export function standOutFor(
  result: AnalysisResult,
  sport: Sport,
  libraryBests: Curve | null,
  library: readonly ActivitySummary[],
  inLibrary: number,
): StandOut {
  const own = profileOf(result, sport)
  const held = countSport(result.activities, sport)
  const wider = libraryBests !== null && inLibrary > held
  const preferAll = wider && (own.status !== 'ready' || held < PROFILE_FULL_LEVEL_ACTIVITIES)
  const all = preferAll ? libraryProfileOf(libraryBests, library, sport, inLibrary) : null
  if (all?.status === 'ready') return { profile: all, allTime: true }
  if (own.status === 'ready') return { profile: own, allTime: false }
  const failed = all ?? own
  return {
    lack:
      failed.status === 'missing' ? profileNeedsText(sport, failed.missing) : PROFILE_UNFIT_TEXT,
  }
}

/** The closed row's finding: where a best stands out from the rest of the athlete's own curve. */
export function standOutFinding(profile: ReadyProfile): string {
  return profileSentence(profile, effortLabel)
}
