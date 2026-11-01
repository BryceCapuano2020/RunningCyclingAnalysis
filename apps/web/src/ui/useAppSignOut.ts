import { forgetSeenNotes } from './aboutDataStore'
import { clearKeptPower } from './keptPowerStore'
import { forgetPreferences } from './preferencesStorage'
import type { useAccount } from './useAccount'
import type { CountedRunsController } from './useCountedRuns'
import { useSignOutWarning } from './useSignOutWarning'

/**
 * Signing out for the app: what this browser noted about the visitor's data goes with their session, and the runs
 * counted here, the rides kept and the profile values mirrored into this browser's preferences (weight, units, year
 * of birth, sex) go once the session has really ended (a failed sign-out leaves the visitor signed in). The next
 * person on a shared device starts from the defaults. It asks first when saves are waiting (see useSignOutWarning).
 */
export function useAppSignOut(
  account: Pick<ReturnType<typeof useAccount>, 'me' | 'signOut'>,
  countedRuns: Pick<CountedRunsController, 'clear'>,
) {
  return useSignOutWarning(account.me?.user.id, () => {
    // What this browser noted about the visitor's data goes with their session.
    forgetSeenNotes()
    // The runs counted here and the rides kept go once the session has really ended; a failed sign-out leaves
    // the visitor signed in.
    void account.signOut().then(
      () => {
        countedRuns.clear()
        clearKeptPower()
        forgetPreferences()
      },
      () => undefined,
    )
  })
}
