/**
 * Ports for the e2e servers. The defaults are the ones CI and `npm run e2e` have always used.
 * Set E2E_WEB_PORT and E2E_API_PORT to run two suites on one machine, for example from two
 * worktrees. apps/api/package.json repeats the defaults in its e2e:api script, and
 * scripts/ops/e2e-ports.test.mjs fails if the two drift apart.
 */
export const DEFAULT_E2E_WEB_PORT = 4319
export const DEFAULT_E2E_API_PORT = 8787

function portFromEnv(name: string, fallback: number): number {
  const value = process.env[name]?.trim()
  if (value === undefined || value === '') return fallback
  if (!/^\d{1,5}$/.test(value) || Number(value) < 1 || Number(value) > 65535) {
    throw new Error(`${name} must be a TCP port number from 1 to 65535, got "${value}"`)
  }
  return Number(value)
}

/** The preview server that Playwright tests run against. */
export const e2eWebPort = portFromEnv('E2E_WEB_PORT', DEFAULT_E2E_WEB_PORT)

/** The `wrangler dev` API that the e2e web server proxies to and the worker suite runs against. */
export const e2eApiPort = portFromEnv('E2E_API_PORT', DEFAULT_E2E_API_PORT)

if (e2eWebPort === e2eApiPort) {
  throw new Error(`E2E_WEB_PORT and E2E_API_PORT must differ, both are ${e2eWebPort}`)
}
