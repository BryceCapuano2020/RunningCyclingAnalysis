import { applyPatch, athleteValuesOf, profileFields } from './profilePatch'
import type { AthleteValues, ProfilePatch } from './profilePatch'
import type { useAccount } from './useAccount'
import type { Preferences } from './useSettings'

/**
 * Saves a change to the athlete. Signed in, the account stores it first, and the preferences then take the values it
 * stored; signed out, the preferences are the only copy. A refused change rejects and is not kept anywhere on this
 * device. The preferences mirror the athlete's values while signed in; a sign-out or a deleted account clears them.
 */
export function saveAnswersFor(
  signedIn: boolean,
  athleteValues: AthleteValues,
  preferences: Preferences,
  setPreferences: (next: Preferences) => void,
  updateProfile: ReturnType<typeof useAccount>['updateProfile'],
) {
  const keepInPreferences = (values: AthleteValues, setupDone?: boolean) =>
    setPreferences({ ...values, setupDone: setupDone ?? preferences.setupDone })

  return async (next: ProfilePatch) => {
    const fields = profileFields(next)
    if (!signedIn || Object.keys(fields).length === 0) {
      keepInPreferences(applyPatch(athleteValues, next), next.setupDone)
      return
    }
    keepInPreferences(athleteValuesOf(await updateProfile(fields)), next.setupDone)
  }
}
