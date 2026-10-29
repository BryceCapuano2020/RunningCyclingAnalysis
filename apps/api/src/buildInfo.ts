/**
 * The commit this Worker was built from. `npm run deploy:built` passes it to Wrangler as
 * `--define __BUILD_SHA__:"<sha>"`, which inlines it into the bundle. It is a public commit id, not a
 * secret. Anything that did not go through that script (tests, `wrangler dev`) reports `unknown`.
 */
declare const __BUILD_SHA__: string | undefined

const SHA = /^[0-9a-f]{7,40}$/

export const BUILD_SHA: string =
  typeof __BUILD_SHA__ === 'string' && SHA.test(__BUILD_SHA__) ? __BUILD_SHA__ : 'unknown'
