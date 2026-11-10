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
  /**
   * The accounts whose results are computed on the server (docs/design/server-compute.md): user ids, comma separated.
   * Empty or unset is off for everyone; the Queue producer, the consumer and `GET /api/state` all answer only for these.
   * Production ships it empty and binds no queue (the deploy-config check). See state/flag.ts.
   */
  SERVER_COMPUTE_USERS?: string
  /** The Queue the state job's messages go to. Bound only where SERVER_COMPUTE_USERS is not empty. */
  STATE_QUEUE?: Queue<StateMessage>
  /** HMAC key for session cookies. Worker secret in production; fixed in .dev.vars.example. */
  SESSION_SIGNING_KEY: string
  /** Cloudflare edge bindings; required outside local development. */
  API_RATE_LIMITER?: RateLimit
  AUTH_RATE_LIMITER?: RateLimit
  WRITE_RATE_LIMITER?: RateLimit
  HEALTH_RATE_LIMITER?: RateLimit
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
