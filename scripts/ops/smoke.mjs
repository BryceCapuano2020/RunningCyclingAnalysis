import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_CONFIG = fileURLToPath(
  new URL('../../apps/api/wrangler.toml', import.meta.url),
)
const GOOGLE_HOST = 'accounts.google.com'
const REQUEST_TIMEOUT_MS = 15_000

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

function expect(condition, message) {
  if (!condition) throw new Error(message)
}

/** The checks run against the live origin. Each one throws with a short, non-sensitive reason. */
export function smokeChecks(origin, appUrl) {
  return [
    {
      name: 'GET /api/health',
      run: async (fetchImpl) => {
        const res = await get(origin, '/api/health', fetchImpl)
        expect(res.status === 200, `expected 200, got ${res.status}`)
        const body = await res.json()
        expect(body?.status === 'ok', 'health body is not {"status":"ok"}')
      },
    },
    {
      name: 'GET /api/health/deep',
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
      name: 'GET /api/me is unauthenticated',
      run: async (fetchImpl) => {
        const res = await get(origin, '/api/me', fetchImpl)
        expect(res.status === 401, `expected 401, got ${res.status}`)
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
  attempts = 5,
  delayMs = 6_000,
  sleep = (ms) => new Promise((done) => setTimeout(done, ms)),
}) {
  const normalise = (value) => new URL(value).origin
  expect(normalise(origin) === normalise(appUrl), 'the origin under test is not APP_URL')
  const failures = []
  for (const check of smokeChecks(origin, appUrl)) {
    let lastError
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        await check.run(fetchImpl)
        lastError = undefined
        break
      } catch (error) {
        lastError = error
        if (attempt < attempts) await sleep(delayMs)
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
    const failures = await runSmoke({ origin, appUrl })
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
