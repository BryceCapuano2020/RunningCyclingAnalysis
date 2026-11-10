/**
 * The accounts whose results are computed on the server: the plain variable `SERVER_COMPUTE_USERS`, user ids separated by
 * commas. Empty or unset is off for everyone. `*` is everyone, for local tests and the e2e server only: the deploy-config
 * check refuses it in wrangler.toml. For an account not on the list nothing is sent, computed or served, so it behaves as it
 * did before the feature existed.
 */
export function serverStateAccounts(env: { SERVER_COMPUTE_USERS?: string }): ReadonlySet<string> {
  return new Set(
    String(env.SERVER_COMPUTE_USERS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id !== ''),
  )
}

/** Whether any account is on the list, which is what binds the Queue and serves the route at all. */
export function serverStateAnyone(env: { SERVER_COMPUTE_USERS?: string }): boolean {
  return serverStateAccounts(env).size > 0
}

/** Whether this account's results are computed on the server. */
export function serverStateFor(env: { SERVER_COMPUTE_USERS?: string }, userId: string): boolean {
  const accounts = serverStateAccounts(env)
  return accounts.has('*') || accounts.has(userId)
}

/**
 * The most activities the server computes for until the memory of a larger library is measured in workerd
 * (docs/design/server-compute.md, decision 11; apps/api/LIMITS.md records the figure). A bigger library computes in the browser.
 */
export const SERVER_STATE_MAX_ACTIVITIES = 2000
