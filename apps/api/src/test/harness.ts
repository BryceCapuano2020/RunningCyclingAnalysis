import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/d1'
import { migrate } from 'drizzle-orm/d1/migrator'
import { getPlatformProxy, type PlatformProxy } from 'wrangler'
import { createApp } from '../app.ts'
import type { Deps } from '../deps.ts'
import type { GoogleOAuth } from '../auth/google.ts'
import type { Bindings } from '../env.ts'
import { deleteByPrefix } from '../storage.ts'
import { toHex } from '../util.ts'

const APP_DIR = fileURLToPath(new URL('../..', import.meta.url))
const START_MS = Date.UTC(2026, 0, 15, 12, 0, 0)
/** Shared by every harness in a test file so that two apps never reuse a token or id. */
let randomCounter = 0
let uuidCounter = 0
export const TEST_CLIENT_ID = 'test-client-id.apps.googleusercontent.com'

type Proxy = PlatformProxy<Bindings>
let proxy: Proxy | undefined

/** Starts Miniflare with real local D1 and R2 bindings and applies the migrations. */
export async function startTestEnv(): Promise<void> {
  proxy = await getPlatformProxy<Bindings>({
    configPath: `${APP_DIR}wrangler.toml`,
    persist: false,
    remoteBindings: false,
  })
  await migrate(drizzle(proxy.env.DB), { migrationsFolder: `${APP_DIR}migrations` })
}

export async function stopTestEnv(): Promise<void> {
  await proxy?.dispose()
  proxy = undefined
}

export function testEnv(overrides: Partial<Bindings> = {}): Bindings {
  if (!proxy) throw new Error('startTestEnv() has not run')
  return {
    DB: proxy.env.DB,
    FILES: proxy.env.FILES,
    ENVIRONMENT: 'development',
    APP_URL: 'http://localhost:5183',
    GOOGLE_CLIENT_ID: TEST_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: 'test-secret',
    ...overrides,
  }
}

/** Empties every table and the R2 bucket. Runs before each test. */
export async function resetTestEnv(): Promise<void> {
  const env = testEnv()
  await env.DB.batch(
    ['activities', 'sessions', 'oauth_accounts', 'profiles', 'users'].map((table) =>
      env.DB.prepare(`DELETE FROM ${table}`),
    ),
  )
  await deleteByPrefix(env.FILES, '')
}

export interface FakeGoogle extends GoogleOAuth {
  exchanges: { code: string; codeVerifier: string }[]
}

/** Stands in for Google's token endpoint. Set `fail` to simulate a failed code exchange. */
export function fakeGoogle(options: { idToken?: string; fail?: boolean } = {}): FakeGoogle {
  const exchanges: FakeGoogle['exchanges'] = []
  return {
    exchanges,
    authorizationUrl: async (state) =>
      new URL(`https://accounts.google.test/o/oauth2/v2/auth?state=${state}`),
    async exchangeCode(code, codeVerifier) {
      exchanges.push({ code, codeVerifier })
      if (options.fail) throw new Error('token endpoint unavailable')
      return options.idToken ?? ''
    },
  }
}

function base64Url(text: string): string {
  const binary = String.fromCharCode(...new TextEncoder().encode(text))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Builds an unsigned JWT with the given claims. The API does not verify signatures (see auth/google.ts). */
export function fakeIdToken(claims: Record<string, unknown>): string {
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  return `${header}.${base64Url(JSON.stringify(claims))}.signature`
}

/** Claims of a valid Google ID token for the test client, relative to START_MS. */
export function googleClaims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: 'https://accounts.google.com',
    aud: TEST_CLIENT_ID,
    exp: START_MS / 1000 + 3600,
    sub: 'google-sub-1',
    email: 'Rider@Example.com',
    email_verified: true,
    name: 'Rider Example',
    picture: 'https://lh3.example.test/photo.jpg',
    ...overrides,
  }
}

export interface Harness {
  app: ReturnType<typeof createApp>
  env: Bindings
  clock: { now: number }
  /** Sends a request. Non-GET requests carry the CSRF header unless csrf is false. */
  send(req: RequestSpec): Promise<Response>
  /** Signs in through dev-login and returns the session token. */
  signIn(email?: string, name?: string): Promise<string>
}

export interface RequestSpec {
  method?: string
  path: string
  json?: unknown
  raw?: Uint8Array
  cookies?: Record<string, string>
  headers?: Record<string, string>
  csrf?: boolean
}

/** A fresh app with deterministic clock, randomness and Google stub. */
export function createHarness(
  overrides: Partial<Deps> = {},
  envOverrides: Partial<Bindings> = {},
): Harness {
  const clock = { now: START_MS }
  const deps: Deps = {
    now: () => clock.now,
    randomBytes: (length) => {
      randomCounter += 1
      const bytes = new Uint8Array(length)
      new DataView(bytes.buffer).setUint32(0, randomCounter)
      return bytes
    },
    randomUUID: () => {
      uuidCounter += 1
      return `00000000-0000-4000-8000-${String(uuidCounter).padStart(12, '0')}`
    },
    google: () => fakeGoogle(),
    ...overrides,
  }
  const app = createApp(deps)
  const env = testEnv({ ENVIRONMENT: 'development', ...envOverrides })

  const send = (spec: RequestSpec): Promise<Response> => {
    const method = spec.method ?? 'GET'
    const headers = new Headers(spec.headers)
    if (method !== 'GET' && spec.csrf !== false) headers.set('X-RCA-Client', 'web')
    if (spec.cookies) {
      headers.set(
        'cookie',
        Object.entries(spec.cookies)
          .map(([k, v]) => `${k}=${v}`)
          .join('; '),
      )
    }
    let body: BodyInit | undefined
    if (spec.json !== undefined) {
      headers.set('content-type', 'application/json')
      body = JSON.stringify(spec.json)
    } else if (spec.raw !== undefined) {
      if (!headers.has('content-type')) headers.set('content-type', 'application/octet-stream')
      body = spec.raw
    }
    return Promise.resolve(app.request(spec.path, { method, headers, body }, env))
  }

  const signIn = async (email = 'rider@example.com', name = 'Rider') => {
    const res = await send({ method: 'POST', path: '/api/auth/dev-login', json: { email, name } })
    if (res.status !== 200) throw new Error(`dev-login failed: ${res.status}`)
    const token = sessionCookie(res)
    if (!token) throw new Error('dev-login set no session cookie')
    return token
  }

  return { app, env, clock, send, signIn }
}

/** Extracts the rca_session value from a response's Set-Cookie headers. */
export function sessionCookie(res: Response): string | undefined {
  for (const line of res.headers.getSetCookie()) {
    const match = /^(?:__Host-)?rca_session=([^;]*)/.exec(line)
    if (match?.[1]) return match[1]
  }
  return undefined
}

export async function sha256Token(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return toHex(new Uint8Array(digest))
}

/** A valid ActivityDigest as JSON-ready data, with fields overridden as given. */
export function digestFixture(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    version: 1,
    id: 'source-1',
    name: 'Morning ride',
    sport: 'ride',
    startMs: START_MS,
    durationS: 3600,
    distanceM: 40000,
    elevationGainM: 500,
    hasHeartRate: true,
    indoor: false,
    powerSource: 'measured',
    flags: [],
    flagCounts: {},
    maxHeartRate: 178,
    curve: [
      {
        durationS: 60,
        value: 350,
        startIndex: 10,
        windowS: 60,
        heartRate: 160,
        terms: null,
      },
      {
        durationS: 300,
        value: Number.NaN,
        startIndex: 0,
        windowS: 300,
        heartRate: null,
        terms: { gravityAccel: 1.5, rolling: 0.2, aero: Number.NaN },
      },
    ],
    hrBlocks: [{ heartRate: 150, value: 210, terms: null }],
    calibration: null,
    climbSections: [],
    ...overrides,
  }
}

export const START = START_MS

/** Wraps a D1 binding and counts calls that reach the database. */
export function countingDb(target: D1Database): { db: D1Database; count(): number; reset(): void } {
  let calls = 0
  const counted = new Set(['prepare', 'batch', 'exec', 'dump'])
  const db = new Proxy(target, {
    get(obj, prop) {
      const value: unknown = Reflect.get(obj, prop, obj)
      if (typeof prop === 'string' && counted.has(prop) && typeof value === 'function') {
        return (...args: unknown[]) => {
          calls += 1
          return Reflect.apply(value, obj, args)
        }
      }
      return typeof value === 'function' ? value.bind(obj) : value
    },
  })
  return { db, count: () => calls, reset: () => (calls = 0) }
}

/** Runs onFirstDelete once, right after the first R2 delete: a stand-in for an upload that races it. */
export function racingBucket(target: R2Bucket, onFirstDelete: () => Promise<void>): R2Bucket {
  let fired = false
  return new Proxy(target, {
    get(obj, prop) {
      const value: unknown = Reflect.get(obj, prop, obj)
      if (prop === 'delete' && typeof value === 'function') {
        return async (keys: string | string[]) => {
          const result: unknown = await Reflect.apply(value, obj, [keys])
          if (!fired) {
            fired = true
            await onFirstDelete()
          }
          return result
        }
      }
      return typeof value === 'function' ? value.bind(obj) : value
    },
  })
}
