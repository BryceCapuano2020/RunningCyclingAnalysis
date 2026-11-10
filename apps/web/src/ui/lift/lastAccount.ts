const KEY = 'rca.lift.account.v1'

/**
 * The id of the account signed in on this browser, kept from sign-in until sign-out, so a lifter with no signal
 * (the account lookup cannot answer) still logs into their own scope. Storage that refuses holds nothing.
 */
export function lastLiftAccount(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

/** Called on every definite answer of the account lookup: the id when signed in, null when signed out. */
export function noteLiftAccount(userId: string | null): void {
  try {
    if (userId === null) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, userId)
  } catch {
    // Without it the log reopens as the device's until the lookup answers.
  }
}
