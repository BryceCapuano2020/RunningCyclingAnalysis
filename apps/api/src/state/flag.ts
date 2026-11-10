/** The two places the allowlist can be set. */
interface AllowlistEnv {
  SERVER_COMPUTE_USERS?: string
  SERVER_COMPUTE_ACCOUNTS?: string
  ENVIRONMENT?: string
}

/**
 * The accounts whose results are computed on the server: user ids separated by commas, from the Worker secret
 * `SERVER_COMPUTE_ACCOUNTS` when one is set (so the ids stay out of the public repository), else from the plain variable
 * `SERVER_COMPUTE_USERS`. The secret wins, even when it is empty, so an operator can switch everyone off without a deploy.
 * Empty or unset is off for everyone. `*` is everyone, for local tests and the e2e server only: the deploy-config
 * check refuses it in wrangler.toml, and the Worker ignores it in production (ENVIRONMENT "production"), from the secret
 * too, which no check before a deploy can read. For an account not on the list nothing is sent, computed or served, so it
 * behaves as it did before the feature existed.
 */
export function serverStateAccounts(env: AllowlistEnv): ReadonlySet<string> {
  const production = env.ENVIRONMENT === 'production'
  return new Set(
    String(env.SERVER_COMPUTE_ACCOUNTS ?? env.SERVER_COMPUTE_USERS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id !== '' && !(production && id === '*')),
  )
}

/** Whether any account is on the list, which is what binds the Queue and serves the route at all. */
export function serverStateAnyone(env: AllowlistEnv): boolean {
  return serverStateAccounts(env).size > 0
}

/** Whether this account's results are computed on the server. */
export function serverStateFor(env: AllowlistEnv, userId: string): boolean {
  const accounts = serverStateAccounts(env)
  return accounts.has('*') || accounts.has(userId)
}

/**
 * The most activities the server computes for until the memory of a larger library is measured in workerd
 * (docs/design/server-compute.md, decision 11; apps/api/LIMITS.md records the figure). A bigger library computes in the browser.
 */
export const SERVER_STATE_MAX_ACTIVITIES = 2000
