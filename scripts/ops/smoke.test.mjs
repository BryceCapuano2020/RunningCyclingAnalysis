import assert from 'node:assert/strict'
import { test } from 'node:test'
import { appUrlFromConfig, runSmoke, smokeChecks } from './smoke.mjs'

const ORIGIN = 'https://rca-api.example.workers.dev'
const GOOGLE_URL = (redirectUri) =>
  `https://accounts.google.com/o/oauth2/v2/auth?client_id=x&redirect_uri=${encodeURIComponent(redirectUri)}`

/** A healthy origin: every route answers the way the deployed Worker must. */
function healthyFetch(overrides = {}) {
  const routes = {
    '/api/health': () => Response.json({ status: 'ok' }),
    '/api/health/deep': () => new Response('{}', { status: 200 }),
    '/': () =>
      new Response('<html><body><div id="root"></div></body></html>', {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
        },
      }),
    '/api/me': () => new Response('{}', { status: 401 }),
    '/api/auth/google': () =>
      new Response(null, {
        status: 302,
        headers: { location: GOOGLE_URL(`${ORIGIN}/api/auth/google/callback`) },
      }),
    ...overrides,
  }
  return async (url, init) => {
    assert.equal(init.redirect, 'manual', 'smoke requests must not follow redirects')
    const handler = routes[new URL(url).pathname]
    if (!handler) return new Response('missing', { status: 404 })
    return handler()
  }
}

const noSleep = async () => {}

test('a healthy origin passes every check', async () => {
  const failures = await runSmoke({
    origin: ORIGIN,
    appUrl: ORIGIN,
    fetchImpl: healthyFetch(),
    sleep: noSleep,
  })
  assert.deepEqual(failures, [])
})

test('a Google redirect with the wrong redirect_uri fails the smoke test', async () => {
  const failures = await runSmoke({
    origin: ORIGIN,
    appUrl: ORIGIN,
    attempts: 1,
    fetchImpl: healthyFetch({
      '/api/auth/google': () =>
        new Response(null, {
          status: 302,
          headers: { location: GOOGLE_URL('https://other.example/api/auth/google/callback') },
        }),
    }),
    sleep: noSleep,
  })
  assert.equal(failures.length, 1)
  assert.match(failures[0], /redirect_uri does not match/)
})

test('an authenticated-looking /api/me response fails the smoke test', async () => {
  const failures = await runSmoke({
    origin: ORIGIN,
    appUrl: ORIGIN,
    attempts: 1,
    fetchImpl: healthyFetch({ '/api/me': () => new Response('{}', { status: 200 }) }),
    sleep: noSleep,
  })
  assert.match(failures.join('\n'), /GET \/api\/me is unauthenticated: expected 401, got 200/)
})

test('a transient failure is retried before the check is reported', async () => {
  let calls = 0
  const flaky = healthyFetch()
  const failures = await runSmoke({
    origin: ORIGIN,
    appUrl: ORIGIN,
    attempts: 3,
    fetchImpl: async (url, init) => {
      if (new URL(url).pathname === '/api/health/deep' && calls++ === 0) {
        return new Response('down', { status: 503 })
      }
      return flaky(url, init)
    },
    sleep: noSleep,
  })
  assert.equal(calls, 2)
  assert.deepEqual(failures, [])
})

test('refuses to test an origin other than APP_URL', async () => {
  await assert.rejects(
    runSmoke({ origin: 'https://evil.example', appUrl: ORIGIN, fetchImpl: healthyFetch() }),
    /not APP_URL/,
  )
})

test('reads APP_URL from the Wrangler configuration', () => {
  const toml =
    'name = "rca-api"\n[vars]\nENVIRONMENT = "production"\nAPP_URL = "https://a.example"\n'
  assert.equal(appUrlFromConfig(toml), 'https://a.example')
  assert.throws(() => appUrlFromConfig('name = "x"'), /does not set APP_URL/)
})

test('lists one check per production route that must stay reachable', () => {
  const names = smokeChecks(ORIGIN, ORIGIN).map((check) => check.name)
  assert.equal(names.length, 5)
  assert.ok(names.some((name) => name.includes('/api/auth/google')))
})
