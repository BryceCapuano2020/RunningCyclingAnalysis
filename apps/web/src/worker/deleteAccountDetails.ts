import { openManifestStore } from '../ui/importManifest'
import { deleteWorkbenchScope } from './workbenchStore'

/** Server deletion has succeeded; a refused local cleanup must be reported separately. */
export async function deleteAccountDetails(userId: string | undefined): Promise<string | null> {
  // An environment without IndexedDB could never have kept these recordings.
  if (userId === undefined || typeof indexedDB === 'undefined') return null
  await openManifestStore().forget(`account:${userId}`)
  const removed = await deleteWorkbenchScope({ kind: 'account', userId }).catch(() => false)
  return removed
    ? null
    : 'Your account was deleted, but its detail recordings could not be removed from this browser. Clear this site’s browser data to remove them.'
}
