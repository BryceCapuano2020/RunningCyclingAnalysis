import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { User } from '@rca/contract'
import type { Deps } from './deps.ts'
import type { schema } from './db/schema.ts'
import type { StateMessage } from './state/message.ts'

/** Worker bindings and variables. Secrets live in .dev.vars locally and in `wrangler secret put`. */
export interface Bindings {
  DB: D1Database
  FILES?: R2Bucket
  /** Only exactly 'development' enables local-only routes (dev-login) and non-Secure cookies. */
  ENVIRONMENT?: string
  /** Public origin of the web app. OAuth redirects back here. */
  APP_URL: string
  GOOGLE_CLIENT_ID: string
  /** A Worker secret, never in the repository. */
  GOOGLE_CLIENT_SECRET: string
  /**
   * Worker secret: the email addresses that may create a new account, comma separated and
   * case-insensitive. Unset or blank closes sign-up outside local development; existing accounts
   * sign in whatever it holds. Never set in the repository (see docs/PRODUCTION.md).
   */
  ALLOWED_EMAILS?: string
  /**
   * Optional plain variable: the database size in MiB at which creates are refused. Unset keeps the
   * Workers Free cap of 450 MiB; set it only after moving to Workers Paid (see databaseGuard.ts).
   */
  DATABASE_SOFT_LIMIT_MIB?: string
  /**
   * Optional plain variable, the operator's read-only switch: "true", "1" or "on" refuses every request that would
   * change data with 503 `read_only` (see readOnly.ts and docs/PRODUCTION.md). Unset or anything else is off.
   */
  READ_ONLY?: string
  /** The Queue the state job's messages go to. Every signed-in account's results are computed on the server (docs/design/server-authority.md). */
  STATE_QUEUE?: Queue<StateMessage>
  /**
   * Garmin sync (docs/design/garmin-sync.md): "true", "1" or "on" lets athletes connect Garmin; unset is off, as
   * production ships until G6 (garmin/flag.ts). Off still lets a link be removed.
   */
  GARMIN_ENABLED?: string
  /** Garmin's OAuth client id, a plain variable once Garmin issues one. */
  GARMIN_CLIENT_ID?: string
  /** Garmin's OAuth client secret: a Worker secret, never in the repository. */
  GARMIN_CLIENT_SECRET?: string
  /**
   * Worker secret: the keys provider tokens are sealed with, `id:key` comma separated, each key 32 random bytes in
   * base64url; the first seals and every one listed opens (providers/tokens.ts). Kept apart from D1.
   */
  PROVIDER_TOKEN_KEY?: string
  /** HMAC key for session cookies. Worker secret in production; fixed in .dev.vars.example. */
  SESSION_SIGNING_KEY: string
  /** Cloudflare edge bindings; required outside local development. */
  API_RATE_LIMITER?: RateLimit
  AUTH_RATE_LIMITER?: RateLimit
  WRITE_RATE_LIMITER?: RateLimit
  HEALTH_RATE_LIMITER?: RateLimit
  /** Garmin's deregistration notice, per address (rateLimit.ts). */
  NOTICE_RATE_LIMITER?: RateLimit
}

/** Drizzle over D1, with the raw binding for batches and statements Drizzle cannot express. */
export type Db = DrizzleD1Database<typeof schema> & { $client: D1Database }

export interface Variables {
  deps: Deps
  db: Db
  /** Set by requireUser; null when the request is not signed in. */
  user: User | null
}

export type AppEnv = { Bindings: Bindings; Variables: Variables }
