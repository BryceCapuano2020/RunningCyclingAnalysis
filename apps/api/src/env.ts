import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { User } from '@rca/contract'
import type { Deps } from './deps.ts'
import type { schema } from './db/schema.ts'

/** Worker bindings and variables. Secrets live in .dev.vars locally and in `wrangler secret put`. */
export interface Bindings {
  DB: D1Database
  FILES?: R2Bucket
  /** Only exactly 'development' enables local-only routes (dev-login) and non-Secure cookies. */
  ENVIRONMENT?: string
  /** Public origin of the web app. OAuth redirects back here. */
  APP_URL: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  /** HMAC key for session cookies. Worker secret in production; fixed in .dev.vars.example. */
  SESSION_SIGNING_KEY: string
  /** Cloudflare edge bindings; required outside local development. */
  API_RATE_LIMITER?: RateLimit
  AUTH_RATE_LIMITER?: RateLimit
  WRITE_RATE_LIMITER?: RateLimit
  HEALTH_RATE_LIMITER?: RateLimit
}

export type Db = DrizzleD1Database<typeof schema>

export interface Variables {
  deps: Deps
  db: Db
  /** Set by requireUser; null when the request is not signed in. */
  user: User | null
}

export type AppEnv = { Bindings: Bindings; Variables: Variables }
