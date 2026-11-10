import { clearScope, liftsExist, openLiftStore } from './liftStore'
import { defaultLocks, FLUSH_LOCK } from './liftSync'
import type { LockProvider } from './liftSync'

/**
 * Sign-out, an expired session, an account switch and another tab's sign-out all end here: the account's confirmed
 * lifting sets go and its unsent ones stay for its next sign-in. It waits for a flush in flight, so a send cannot
 * answer into rows that are being removed. Best effort; never rejects.
 */
export async function signOutLifts(
  userId: string,
  locks: LockProvider = defaultLocks(),
): Promise<void> {
  // A visitor who never logged a set has no database, and looking must not make one.
  if (!(await liftsExist())) return
  const store = openLiftStore(userId)
  try {
    await locks.request(FLUSH_LOCK, () => store.signOut())
  } catch {
    // The rows stay until the next sign-out or sweep.
  } finally {
    store.close()
  }
}

/** A deleted account's whole scope goes, unsent sets included. Best effort; never rejects. */
export async function dropLiftScope(
  userId: string,
  locks: LockProvider = defaultLocks(),
): Promise<void> {
  try {
    if (!(await liftsExist())) return
    await locks.request(FLUSH_LOCK, () => clearScope(userId))
  } catch {
    // The next sign-in of another account sweeps it.
  }
}
