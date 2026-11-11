import type { Profile } from '@rca/contract'
import { bodyMassOn } from '@rca/core/athlete'
import { ageProfileOf } from './grades'
import { datedWeightActions } from './datedWeight'
import { athleteValuesOf } from './profilePatch'
import type { AthleteValues } from './profilePatch'
import { saveAnswersFor } from './saveAnswers'
import type { AccountController } from './useAccount'
import { useAnalysisSettings } from './useAnalysisSettings'
import { useMeasurements } from './useMeasurements'
import { useNow } from './useNow'
import { usePreferences } from './useSettings'

/**
 * The athlete the app runs on: the profile values (the saved profile signed in, local preferences signed out), the dated
 * weights, the settings the analysis takes, and the actions that change them.
 */
export function useAthlete(
  account: AccountController,
  profile: Profile | null,
  countedRuns: readonly string[],
  keptPower: readonly string[],
) {
  const [preferences, setPreferences] = usePreferences()
  const signedIn = profile !== null
  // Signed in, the saved profile is the source of truth; signed out, local preferences are.
  const athleteValues: AthleteValues = profile
    ? athleteValuesOf(profile)
    : {
        settings: preferences.settings,
        units: preferences.units,
        birthYear: preferences.birthYear,
        sex: preferences.sex,
      }
  const measurements = useMeasurements(account.status, account.me?.user.id ?? null)
  // The weight today is the dated weight in effect today, whatever the saved profile holds, so a weight
  // dated for a later day takes effect on that day with no edit. Without dated weights it is the profile's.
  const now = useNow()
  const settings = {
    ...athleteValues.settings,
    massKg: bodyMassOn(athleteValues.settings.massKg, measurements.entries, now),
  }
  // The analysis and the results take a body mass even before one is entered; see analysisSettings.
  // Memoised on what it reads: an equal settings object built anew must not redraw the share preview.
  const analysisAthlete = useAnalysisSettings(
    settings,
    measurements.entries,
    athleteValues.birthYear,
    countedRuns,
    keptPower,
    athleteValues.sex,
  )
  const saveAnswers = saveAnswersFor(
    signedIn,
    athleteValues,
    preferences,
    setPreferences,
    account.updateProfile,
  )
  const { saveProfile, addSetting, removeSetting } = datedWeightActions({
    measurements,
    now,
    profileKg: athleteValues.settings.massKg,
    saveAnswers,
  })
  return {
    preferences,
    athleteValues,
    measurements,
    now,
    settings,
    analysisAthlete,
    // The year of birth and sex the grades need, or null while either is missing.
    ageProfile: ageProfileOf(athleteValues.birthYear, athleteValues.sex),
    saveProfile,
    addSetting,
    removeSetting,
  }
}
