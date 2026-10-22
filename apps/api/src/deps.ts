import { createGoogleOAuth, type GoogleOAuth } from './auth/google.ts'
import type { Bindings } from './env.ts'

/** Everything nondeterministic or external. Tests replace these; the Worker uses systemDeps. */
export interface Deps {
  /** Epoch milliseconds. */
  now: () => number
  randomBytes: (length: number) => Uint8Array
  randomUUID: () => string
  /** Builds the Google OAuth client for this request's environment. */
  google: (env: Bindings) => GoogleOAuth
}

export const systemDeps: Deps = {
  now: () => Date.now(),
  randomBytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
  randomUUID: () => crypto.randomUUID(),
  google: createGoogleOAuth,
}
