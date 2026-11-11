import { createGoogleOAuth, type GoogleOAuth } from './auth/google.ts'
import { createGarminOAuth, type GarminOAuth } from './garmin/oauth.ts'
import type { Bindings } from './env.ts'

/** Everything nondeterministic or external. Tests replace these; the Worker uses systemDeps. */
export interface Deps {
  /** Epoch milliseconds. */
  now: () => number
  randomBytes: (length: number) => Uint8Array
  randomUUID: () => string
  /** Builds the Google OAuth client for this request's environment. */
  google: (env: Bindings) => GoogleOAuth
  /** Builds the Garmin OAuth client; the API test harness gives a fake Garmin. */
  garmin: (env: Bindings) => GarminOAuth
}

export const systemDeps: Deps = {
  now: () => Date.now(),
  randomBytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
  randomUUID: () => crypto.randomUUID(),
  google: createGoogleOAuth,
  garmin: createGarminOAuth,
}
