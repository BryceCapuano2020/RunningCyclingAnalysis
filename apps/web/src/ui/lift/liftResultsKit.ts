import { liftResultsOf } from '@rca/core/lift'
import type { LiftResults, LiftSet } from '@rca/core/lift'
import type { AthleteSettings } from '@rca/core/athlete'

/** What the figures need beside the settings: the year of birth and sex, or none. */
type Profile = { birthYear: number; sex: 'male' | 'female' } | null

/** The lift results of a log for a test: core's `liftResultsOf`, the one function every lift figure comes from. */
export function resultsFor(
  sets: readonly LiftSet[],
  settings: AthleteSettings,
  profile: Profile,
  today = '2031-03-02',
): LiftResults {
  return liftResultsOf(
    sets,
    profile === null ? settings : { ...settings, birthYear: profile.birthYear, sex: profile.sex },
    today,
  )
}
