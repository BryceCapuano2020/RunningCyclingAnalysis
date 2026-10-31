import { openOutbox } from './outbox'
import { clearWorkbenchScope } from './workbenchStore'

/**
 * Removes a signed-out account's detail recordings from this browser, so the next visitor to a shared
 * browser does not find them, and keeps the account's scope from taking new ones until it signs in
 * again. The sign-out has already happened, so a refused cleanup is returned as a notice, not thrown:
 * the recordings stay, and only this account's next sign-in can open them.
 */
export async function forgetAccountDetails(
  userId: string | undefined,
  /** A session that ended on its own keeps the saves it had waiting, for the account's next sign-in. */
  keepSaves = false,
): Promise<string | null> {
  // An environment without IndexedDB could never have kept these recordings.
  if (userId === undefined || typeof indexedDB === 'undefined') return null
  // Activities still waiting to be saved are the account's data too: a signed-out browser must not keep them.
  if (!keepSaves) await openOutbox(userId).forget()
  const cleared = await clearWorkbenchScope({ kind: 'account', userId }).catch(() => false)
  return cleared
    ? null
    : 'You were signed out, but this account’s detail recordings could not be cleared from this browser. Clear this site’s browser data to remove them.'
}
