import { accountScope, clearCheckinScope } from './checkinStore'
import { openManifestStore } from '../ui/importManifestStore'
import { clearWorkbenchScope } from './workbenchStore'

/**
 * Removes a signed-out account's detail recordings from this browser, so the next visitor to a shared
 * browser does not find them, and keeps the account's scope from taking new ones until it signs in
 * again. The sign-out has already happened, so a refused cleanup is returned as a notice, not thrown:
 * the recordings stay, and only this account's next sign-in can open them.
 */
export async function forgetAccountDetails(userId: string | undefined): Promise<string | null> {
  // An environment without IndexedDB could never have kept these recordings.
  if (userId === undefined || typeof indexedDB === 'undefined') return null
  // What the account's imports left in the check-in database (the index of files read) goes with its recordings.
  await clearCheckinScope(accountScope(userId)).catch(() => false)
  // The record of this account's imports names the files it was given: it goes with the recordings.
  await openManifestStore().forget(`account:${userId}`)
  const cleared = await clearWorkbenchScope({ kind: 'account', userId }).catch(() => false)
  return cleared
    ? null
    : 'You were signed out, but this account’s detail recordings could not be cleared from this browser. Clear this site’s browser data to remove them.'
}
