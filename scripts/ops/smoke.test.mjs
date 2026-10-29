import assert from 'node:assert/strict'
import { test } from 'node:test'
import { appUrlFromConfig, runSmoke, shaArgument, smokeChecks } from './smoke.mjs'

const ORIGIN = 'https://rca-api.example.workers.dev'
const GOOGLE_URL = (redirectUri) =>
  `https://accounts.google.com/o/oauth2/v2/auth?client_id=x&redirect_uri=${encodeURIComponent(redirectUri)}`

/** A healthy origin: every route answers the way the deployed Worker must. */
function healthyFetch(overrides = {}) {
  const routes = {
    '/api/health': () => Response.json({ status: 'ok', sha: 'abc1234' }),
    '/api/health/deep': () => new Response('{}', { status: 200 }),
    '/': () =>
      new Response('<html><body><div id="root"></div></body></html>', {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
        },
      }),
    '/api/me': () =>
      new Response('null', { status: 200, headers: { 'content-type': 'application/json' } }),
    '/api/auth/google': () =>
      new Response(null, {
        status: 302,
        headers: { location: GOOGLE_URL(`${ORIGIN}/api/auth/google/callback`) },
      }),
    '/.well-known/security.txt': () =>
      new Response('Contact: mailto:security@example.com\nExpires: 2030-01-01T00:00:00Z\n', {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      }),
    '/robots.txt': () =>
      new Response('User-agent: *\nAllow: /\n', {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      }),
    '/privacy': () =>
      new Response('<html><body>Privacy</body></html>', {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    ...overrides,
  }
  return async (url, init) => {
    assert.equal(init.redirect, 'manual', 'smoke requests must not follow redirects')
    const handler = routes[new URL(url).pathname]
    if (!handler) {
      return new Response('missing', {
        status: 404,
        headers: {
          'x-content-type-options': 'nosniff',
          'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
        },
      })
    }
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

test('a /api/me that answers with a signed-in body fails the smoke test', async () => {
  const failures = await runSmoke({
    origin: ORIGIN,
    appUrl: ORIGIN,
    attempts: 1,
    fetchImpl: healthyFetch({ '/api/me': () => new Response('{}', { status: 200 }) }),
    sleep: noSleep,
  })
  assert.match(
    failures.join('\n'),
    /GET \/api\/me answers a signed-out visitor with 200 and a null body: expected 200 with a null body, got 200 \{\}/,
  )
})

test('a 401 for an anonymous /api/me fails the smoke test, since a signed-out visitor gets a null body', async () => {
  const failures = await runSmoke({
    origin: ORIGIN,
    appUrl: ORIGIN,
    attempts: 1,
    fetchImpl: healthyFetch({ '/api/me': () => new Response('{}', { status: 401 }) }),
    sleep: noSleep,
  })
  assert.match(failures.join('\n'), /expected 200 with a null body, got 401/)
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
  assert.equal(names.length, 9)
  assert.ok(names.some((name) => name.includes('/api/auth/google')))
  assert.ok(names.some((name) => name.includes('/.well-known/security.txt')))
  assert.ok(names.some((name) => name.includes('/robots.txt')))
  assert.ok(names.some((name) => name.includes('/privacy')))
})

test('security.txt without an Expires field fails the smoke test', async () => {
  const failures = await runSmoke({
    origin: ORIGIN,
    appUrl: ORIGIN,
    attempts: 1,
    fetchImpl: healthyFetch({
      '/.well-known/security.txt': () =>
        new Response('Contact: mailto:security@example.com\n', {
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        }),
    }),
    sleep: noSleep,
  })
  assert.equal(failures.length, 1)
  assert.match(failures[0], /security\.txt.*has no valid Expires: field/)
})

test('an expired security.txt fails the smoke test', async () => {
  const failures = await runSmoke({
    origin: ORIGIN,
    appUrl: ORIGIN,
    attempts: 1,
    fetchImpl: healthyFetch({
      '/.well-known/security.txt': () =>
        new Response('Contact: mailto:security@example.com\nExpires: 2020-01-01T00:00:00Z\n', {
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        }),
    }),
    sleep: noSleep,
  })
  assert.equal(failures.length, 1)
  assert.match(failures[0], /security\.txt has expired/)
})

test('the committed security.txt stays valid for at least 60 days', async () => {
  const { readFile } = await import('node:fs/promises')
  const body = await readFile(
    new URL('../../apps/web/public/.well-known/security.txt', import.meta.url),
    'utf8',
  )
  const expires = Date.parse(/^Expires:\s*(\S+)/m.exec(body)?.[1] ?? '')
  assert.ok(Number.isFinite(expires), 'security.txt has no valid Expires field')
  // Renew the Expires date (at most a year ahead, RFC 9116) before this starts failing CI.
  assert.ok(expires - Date.now() > 60 * 24 * 60 * 60 * 1000, 'security.txt expires within 60 days')
})

test('security.txt served as HTML fails the smoke test', async () => {
  const failures = await runSmoke({
    origin: ORIGIN,
    appUrl: ORIGIN,
    attempts: 1,
    fetchImpl: healthyFetch({
      '/.well-known/security.txt': () =>
        new Response('Contact: mailto:a@example.com\nExpires: 2030-01-01T00:00:00Z\n', {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
    }),
    sleep: noSleep,
  })
  assert.equal(failures.length, 1)
  assert.match(failures[0], /content-type is not text\/plain/)
})

test('a missing security.txt, robots.txt or privacy page fails with its status', async () => {
  const failures = await runSmoke({
    origin: ORIGIN,
    appUrl: ORIGIN,
    attempts: 1,
    fetchImpl: healthyFetch({
      '/.well-known/security.txt': () => new Response('missing', { status: 404 }),
      '/robots.txt': () => new Response('missing', { status: 404 }),
      '/privacy': () => new Response('missing', { status: 404 }),
    }),
    sleep: noSleep,
  })
  assert.equal(failures.length, 3)
  assert.match(failures.join('\n'), /security\.txt.*expected 200, got 404/)
  assert.match(failures.join('\n'), /GET \/robots\.txt returns 200: expected 200, got 404/)
  assert.match(failures.join('\n'), /GET \/privacy.*expected 200, got 404/)
})

test('a privacy page served as plain text fails the smoke test', async () => {
  const failures = await runSmoke({
    origin: ORIGIN,
    appUrl: ORIGIN,
    attempts: 1,
    fetchImpl: healthyFetch({
      '/privacy': () => new Response('Privacy', { headers: { 'content-type': 'text/plain' } }),
    }),
    sleep: noSleep,
  })
  assert.equal(failures.length, 1)
  assert.match(failures[0], /content-type is not text\/html/)
})

test('with an expected commit, /api/health must report that build', async () => {
  const run = (expectSha) =>
    runSmoke({
      origin: ORIGIN,
      appUrl: ORIGIN,
      attempts: 1,
      expectSha,
      fetchImpl: healthyFetch(),
      sleep: noSleep,
    })
  assert.deepEqual(await run('abc1234'), [])
  assert.deepEqual(await run('abc1234def5678901234567890123456789abcd'), [])
  const stale = (await run('fff0000')).join('\n')
  assert.match(stale, /reports build abc1234, not fff0000/)
})

test('an unknown path must answer 404 with the Worker security headers', async () => {
  const failures = await runSmoke({
    origin: ORIGIN,
    appUrl: ORIGIN,
    attempts: 1,
    fetchImpl: healthyFetch({
      '/smoke-check-no-such-page': () => new Response('<html>app</html>', { status: 200 }),
    }),
    sleep: noSleep,
  })
  assert.match(
    failures.join('\n'),
    /answers 404 with the Worker security headers: expected 404, got 200/,
  )
})

test('every smoke request is a bodyless GET, so a run sends no mutating request', async () => {
  const seen = []
  const fetchImpl = healthyFetch()
  await runSmoke({
    origin: ORIGIN,
    appUrl: ORIGIN,
    expectSha: 'abc1234',
    fetchImpl: async (url, init) => {
      seen.push(init)
      return fetchImpl(url, init)
    },
    sleep: noSleep,
  })
  assert.ok(seen.length >= 9)
  for (const init of seen) {
    assert.ok(init.method === undefined || init.method === 'GET')
    assert.equal(init.body, undefined)
  }
})

test('a Worker with no build id still passes without --expect-sha, and fails with it', async () => {
  const old = healthyFetch({ '/api/health': () => Response.json({ status: 'ok' }) })
  const run = (expectSha) =>
    runSmoke({
      origin: ORIGIN,
      appUrl: ORIGIN,
      attempts: 1,
      expectSha,
      fetchImpl: old,
      sleep: noSleep,
    })
  assert.deepEqual(await run(undefined), [])
  assert.match((await run('abc1234')).join('\n'), /has no build sha/)
})

test('a retry of the deep health check waits out its one-a-minute limiter', async () => {
  const waits = []
  let calls = 0
  const healthy = healthyFetch()
  const failures = await runSmoke({
    origin: ORIGIN,
    appUrl: ORIGIN,
    fetchImpl: async (url, init) => {
      if (new URL(url).pathname === '/api/health/deep' && calls++ === 0) {
        return new Response('slow down', { status: 429 })
      }
      return healthy(url, init)
    },
    sleep: async (ms) => waits.push(ms),
  })
  assert.deepEqual(failures, [])
  assert.deepEqual(waits, [61_000])
})

test('--expect-sha needs a commit id', () => {
  assert.equal(shaArgument('abc1234'), 'abc1234')
  for (const bad of [undefined, '', '--config', 'xyz', 'abc12']) {
    assert.throws(() => shaArgument(bad), /--expect-sha needs a commit id/)
  }
})
