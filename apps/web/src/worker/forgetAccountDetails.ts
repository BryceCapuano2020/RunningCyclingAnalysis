import { clearWorkbenchScope } from './workbenchStore'

/**
 * Removes a signed-out account's detail recordings from this browser, so the next visitor to a shared
 * browser does not find them. Best effort: the sign-out has already happened, and a refused cleanup
 * leaves recordings that only this account's next sign-in can open.
 */
export async function forgetAccountDetails(userId: string | undefined): Promise<void> {
  // An environment without IndexedDB could never have kept these recordings.
  if (userId === undefined || typeof indexedDB === 'undefined') return
  await clearWorkbenchScope({ kind: 'account', userId }).catch(() => false)
}
