import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_CONFIG = fileURLToPath(
  new URL('../../apps/api/wrangler.toml', import.meta.url),
)
const GOOGLE_HOST = 'accounts.google.com'
const REQUEST_TIMEOUT_MS = 15_000
/** A build id as /api/health reports it: a short or full commit id, or `unknown` outside a release build. */
const SHA_SHAPE = /^(?:[0-9a-f]{7,40}|unknown)$/
/** The deep health check allows one call a minute, so a retry waits out the limiter. */
const DEEP_HEALTH_RETRY_DELAY_MS = 61_000

/** The public origin from wrangler.toml, which Google's redirect URI is built from. */
export function appUrlFromConfig(toml) {
  const match = toml.match(/^APP_URL\s*=\s*"([^"]+)"\s*(?:#.*)?$/m)
  if (!match) throw new Error('wrangler.toml does not set APP_URL.')
  return match[1]
}

async function get(origin, path, fetchImpl) {
  return fetchImpl(new URL(path, origin), {
    redirect: 'manual',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
}

/** The value of --expect-sha: a commit id of 7 to 40 hex digits. A missing or malformed one is an error. */
export function shaArgument(value) {
  if (value === undefined || !/^[0-9a-f]{7,40}$/.test(value)) {
    throw new Error(
      '--expect-sha needs a commit id of 7 to 40 hex digits, for example --expect-sha abc1234',
    )
  }
  return value
}

function expect(condition, message) {
  if (!condition) throw new Error(message)
}

/**
 * The checks run against the live origin. Each one throws with a short, non-sensitive reason. They
 * are all GET requests with no body: no mutating requests (the deep health check reserves a row in its
 * own budget). `expectSha` is the commit the deploy was built from, full or short; when given,
 * /api/health must report a build id and it must match. Without it a missing build id is a warning, so
 * the smoke test still passes against a Worker that predates the id, as after a rollback.
 */
export function smokeChecks(origin, appUrl, expectSha) {
  return [
    {
      name: expectSha ? 'GET /api/health reports the deployed commit' : 'GET /api/health',
      run: async (fetchImpl) => {
        const res = await get(origin, '/api/health', fetchImpl)
        expect(res.status === 200, `expected 200, got ${res.status}`)
        const body = await res.json()
        expect(body?.status === 'ok', 'health body is not {"status":"ok"}')
        const sha = typeof body.sha === 'string' ? body.sha : ''
        const hasSha = SHA_SHAPE.test(sha)
        if (expectSha) {
          expect(hasSha, 'health body has no build sha')
          expect(
            sha.startsWith(expectSha) || expectSha.startsWith(sha),
            `health reports build ${sha}, not ${expectSha.slice(0, 12)}`,
          )
        } else if (!hasSha) {
          console.warn('warning: /api/health reports no build sha (a Worker from before the id).')
        }
      },
    },
    {
      name: 'GET an unknown path answers 404 with the Worker security headers',
      run: async (fetchImpl) => {
        const res = await get(origin, '/smoke-check-no-such-page', fetchImpl)
        expect(res.status === 404, `expected 404, got ${res.status}`)
        expect(res.headers.get('x-content-type-options') === 'nosniff', 'nosniff header missing')
        expect(
          (res.headers.get('content-security-policy') ?? '').includes('frame-ancestors'),
          'Content-Security-Policy missing on the 404',
        )
      },
    },
    {
      name: 'GET /api/health/deep',
      delayMs: DEEP_HEALTH_RETRY_DELAY_MS,
      attempts: 2,
      run: async (fetchImpl) => {
        const res = await get(origin, '/api/health/deep', fetchImpl)
        expect(res.status === 200, `expected 200, got ${res.status}`)
      },
    },
    {
      name: 'GET / serves the HTML app with the CSP header',
      run: async (fetchImpl) => {
        const res = await get(origin, '/', fetchImpl)
        expect(res.status === 200, `expected 200, got ${res.status}`)
        expect(
          (res.headers.get('content-type') ?? '').startsWith('text/html'),
          'content-type is not text/html',
        )
        expect(
          (res.headers.get('content-security-policy') ?? '').includes("frame-ancestors 'none'"),
          'Content-Security-Policy from _headers is missing',
        )
        expect((await res.text()).includes('<div id="root">'), 'app shell not served')
      },
    },
    {
      name: 'GET /.well-known/security.txt serves plain text with Contact and Expires',
      run: async (fetchImpl) => {
        const res = await get(origin, '/.well-known/security.txt', fetchImpl)
        expect(res.status === 200, `expected 200, got ${res.status}`)
        expect(
          (res.headers.get('content-type') ?? '').startsWith('text/plain'),
          'content-type is not text/plain',
        )
        const body = await res.text()
        expect(body.includes('Contact:'), 'security.txt has no Contact: field')
        const expires = Date.parse(/^Expires:\s*(\S+)/m.exec(body)?.[1] ?? '')
        expect(Number.isFinite(expires), 'security.txt has no valid Expires: field')
        expect(expires > Date.now(), 'security.txt has expired')
      },
    },
    {
      name: 'GET /robots.txt returns 200',
      run: async (fetchImpl) => {
        const res = await get(origin, '/robots.txt', fetchImpl)
        expect(res.status === 200, `expected 200, got ${res.status}`)
      },
    },
    {
      name: 'GET /privacy serves HTML',
      run: async (fetchImpl) => {
        const res = await get(origin, '/privacy', fetchImpl)
        expect(res.status === 200, `expected 200, got ${res.status}`)
        expect(
          (res.headers.get('content-type') ?? '').startsWith('text/html'),
          'content-type is not text/html',
        )
      },
    },
    {
      name: 'GET /api/me answers a signed-out visitor with 200 and a null body',
      run: async (fetchImpl) => {
        const res = await get(origin, '/api/me', fetchImpl)
        const body = (await res.text()).trim()
        expect(
          res.status === 200 && body === 'null',
          `expected 200 with a null body, got ${res.status} ${body.slice(0, 80)}`,
        )
      },
    },
    {
      name: 'GET /api/auth/google redirects to Google with the expected redirect_uri',
      run: async (fetchImpl) => {
        const res = await get(origin, '/api/auth/google', fetchImpl)
        expect(res.status === 302, `expected 302, got ${res.status}`)
        const location = new URL(res.headers.get('location') ?? 'https://invalid.invalid/')
        expect(location.hostname === GOOGLE_HOST, 'redirect does not go to Google')
        expect(
          location.searchParams.get('redirect_uri') === `${appUrl}/api/auth/google/callback`,
          'redirect_uri does not match APP_URL + /api/auth/google/callback',
        )
      },
    },
  ]
}

/** Runs every check, retrying each one so a propagation delay does not look like a failure. */
export async function runSmoke({
  origin,
  appUrl,
  fetchImpl = fetch,
  expectSha,
  attempts = 5,
  delayMs = 6_000,
  sleep = (ms) => new Promise((done) => setTimeout(done, ms)),
}) {
  const normalise = (value) => new URL(value).origin
  expect(normalise(origin) === normalise(appUrl), 'the origin under test is not APP_URL')
  const failures = []
  for (const check of smokeChecks(origin, appUrl, expectSha)) {
    let lastError
    const tries = Math.min(attempts, check.attempts ?? attempts)
    for (let attempt = 1; attempt <= tries; attempt++) {
      try {
        await check.run(fetchImpl)
        lastError = undefined
        break
      } catch (error) {
        lastError = error
        if (attempt < tries) await sleep(check.delayMs ?? delayMs)
      }
    }
    if (lastError) failures.push(`${check.name}: ${lastError.message}`)
  }
  return failures
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const configPath = args.includes('--config') ? args[args.indexOf('--config') + 1] : DEFAULT_CONFIG
  try {
    const appUrl = appUrlFromConfig(await readFile(configPath, 'utf8'))
    const origin = args.includes('--origin') ? args[args.indexOf('--origin') + 1] : appUrl
    const expectSha = args.includes('--expect-sha')
      ? shaArgument(args[args.indexOf('--expect-sha') + 1])
      : undefined
    const failures = await runSmoke({ origin, appUrl, expectSha })
    if (failures.length) {
      console.error(`Smoke test failed for ${origin}:\n- ${failures.join('\n- ')}`)
      process.exitCode = 1
    } else {
      console.log(`Smoke test passed for ${origin}.`)
    }
  } catch (error) {
    console.error(`Smoke test could not run: ${error.message}`)
    process.exitCode = 1
  }
}
