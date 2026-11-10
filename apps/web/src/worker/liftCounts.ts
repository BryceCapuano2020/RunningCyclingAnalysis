import { DEVICE_SCOPE } from './liftTransitions'
import { liftsExist, openLiftStore } from './liftStore'

/** The rows of one scope, read and closed. 0 rows where the database does not exist: counting must not make it. */
async function rowsOf(scope: string) {
  if (!(await liftsExist())) return []
  const store = openLiftStore(scope)
  try {
    return await store.list()
  } finally {
    store.close()
  }
}

/** Sets an account's scope holds that the server has not confirmed: what sign-out names. */
export async function unsentLifts(userId: string): Promise<number> {
  return (await rowsOf(userId)).filter((row) => row.state !== 'synced').length
}

/** Sets this browser kept signed out, which the offer adds to the account. */
export async function deviceLiftCount(): Promise<number> {
  return (await rowsOf(DEVICE_SCOPE)).filter((row) => row.state === 'put').length
}
