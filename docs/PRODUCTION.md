# Production operation and release verification

This document records the operational behavior and the remaining release evidence. It is not a
claim of perfect reliability or of validated physiological accuracy.

## Release gate

Install dependencies with `npm ci`, then install browser engines with
`npm exec -w @rca/web -- playwright install chromium webkit`. Run `npm run verify:release`.
It checks formatting, lint, all package types, unit coverage, deployment configuration tests,
the production build, Chromium and WebKit browser behavior, and the Worker-served application.
The last test exercises the actual static-asset security policy, module worker, and same-origin
API together; a Vite preview alone cannot verify Cloudflare's `_headers` behavior.

`npm run deploy` runs the release gate before deployment. The manual GitHub deployment workflow
runs the reusable CI checks against the selected commit, then downloads the exact verified static
build. It deploys only from `main`; Cloudflare credentials are scoped to migration/deployment steps.
Actions are pinned by commit, and a retried/flaky browser test fails CI rather than being hidden.

The initial `npm run deploy:bootstrap` is an explicit exception for discovering the Worker address.
It builds assets and requires a valid D1 id, but allows the initial unconfigured `APP_URL`.
Normal deployment additionally requires a real HTTPS origin and production mode. Follow
[DEPLOY.md](DEPLOY.md) for credentials, migrations, origin setup and smoke tests.

## Request isolation and limits

Current browser requests carry `X-RCA-User` for the account that initiated the operation. The API
compares it with the session user and returns `409 account_changed` on a mismatch. This matters
because session cookies are shared across tabs and can change while an import is queued. Changing
accounts also terminates the old browser worker. Compatibility clients may omit the header; it is
an intent binding, not a replacement for session authentication or owner-scoped database queries.

Cloudflare rate-limit bindings apply outside local development:

| Binding              | Threshold per minute | Key                                        |
| -------------------- | -------------------: | ------------------------------------------ |
| `API_RATE_LIMITER`   |                1,200 | Cloudflare-supplied client address         |
| `AUTH_RATE_LIMITER`  |                   30 | Client address, OAuth/sign-in routes       |
| `WRITE_RATE_LIMITER` |                  600 | Authenticated user id, account data writes |

Counters are approximate and local to a Cloudflare location; they are abuse controls, not strict
billing quotas. Requests denied by the limiter return `429` and `Retry-After: 60`. Missing or failing
production bindings return `503` with a retry delay. Namespace identifiers in `wrangler.toml`
should be unique within the deployment account. Shared IP addresses can share the public/auth
limits. See Cloudflare's [rate-limit binding documentation](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

Strict per-account quotas remain atomic D1 operations: 5,000 activities and 1 GiB of original-file
reservations. An upload reserves bytes before R2 writes; a failed upload retains that reservation
until the same-file retry, activity deletion, or file-retention opt-out. This prevents simultaneous
retries from freeing quota that another upload still needs. The activity response reports a stored
file only after finalization. Original uploads are capped at 50 MiB. Body reads have a 15-second
idle timeout and a two-minute total limit, and release readers on all exit paths.

Application-wide R2 admission limits are separate from per-account quotas. All users share a
4 GiB lifetime PUT charge budget and a 100,000-operation budget per UTC calendar month. Each PUT
attempt reserves `max(actual body bytes, 64 KiB)` and one monthly operation atomically before
calling R2. Failed attempts and retries keep their byte and operation charges; nothing is refunded
or automatically reset in the lifetime ledger. A fresh ledger therefore allows at most 65,536 PUT
attempts, and fewer when objects are larger than 64 KiB. The migration initializes the ledger from
the sum of recorded activity file sizes. This includes rows that may only be reservations for
failed older uploads, but it cannot reconstruct repeated historical retries or identify untracked
R2 objects that predate the ledger; the starting ledger may undercount prior PUT charges and
existing objects. Each get/list attempt consumes one monthly operation
when admitted. Ordinary puts and gets stop at 90,000 operations, reserving the final 10,000 for
prefix-list cleanup; list calls share the same total and may use that headroom. Deletes and aborts do
not consume operations. Exhausted byte or operation capacity returns `429
storage_budget_exhausted`; cleanup refuses before changing D1 state if its list budget is exhausted.
Monthly capacity returns at the next UTC month. These limits cover calls through this Worker only. Keep
`rca-files` private and dedicated: direct bucket/API access, other clients and dashboard operations
can bypass the application limits, and Cloudflare may bill R2 usage above its free allowance.

Activity listing uses at most 25 records per page, a 1 MiB digest JSON budget and 64 KiB envelope
headroom. The API scans small metadata before fetching the selected digests. Cursors are based on
delivered rows so byte-limited pages do not skip activities. Browser readers bound JSON/download
sizes and network time, reject malformed/repeated cursors, and do not retry write requests blindly.
Metadata requests have a 15-second deadline; original-file transfers have two minutes, including
body consumption. The activity table renders at most 20 activities at a time with accessible paging.

## Browser and data recovery

- Stop analysis terminates queued work. Saved activities are reloaded for a signed-in user; unsaved
  local files must be re-imported. The notice makes that loss of local progress explicit.
- A failed worker restarts once automatically. Repeated startup failures require manual restart,
  preventing an endless resource-consuming loop.
- Failed saves remain locally analyzable and are counted. Re-importing the original retries them.
  A digest saved without a requested original is a partial failure. Originals above 50 MiB require
  turning off file retention before retrying; they can still be analysed locally within import limits.
- Digest schema version and model revision are separate. Revision 2 contains the corrected sensor
  validity/timer handling. Missing revision means legacy revision 1. Older analyses are excluded
  and can be rebuilt from retained original files; missing originals need re-importing. Newer
  revisions are excluded with a separate compatibility notice.
- Upgrades require the same sport/start dedupe identity and SHA-256 of the exact original bytes.
  They retain the activity id and stored-file metadata. Different file contents conflict rather
  than silently replacing an activity, and older clients cannot downgrade newer stored summaries.
- Browser/server state after an interrupted rebuild may be partial. Successful upgrades remain
  usable; unresolved entries retain their stale status and can be retried.

## Security headers and diagnostics

Static assets use a Content Security Policy allowing same-origin code/workers/connections and
no dynamic code generation. Inline styles are allowed because charts use positioned styles.
Objects and embedding are blocked. The API is `no-store`, including errors, with attachment-only
file downloads. Both surfaces set nosniff, framing and referrer controls. Header behavior is
covered by the Worker browser smoke test. See Cloudflare's
[static-asset headers documentation](https://developers.cloudflare.com/workers/static-assets/headers/).

API responses include `X-Request-ID`. Unexpected-error logs contain that id and the exception
class; they do not include request bodies, query strings, original files, tokens, or raw database
error messages. Use the id to correlate a reported failure with Worker logs. Do not enable verbose
request/body logging around personal activity files or OAuth callbacks.

An export of the empty production D1 database was restored into an isolated local Miniflare
database. The restore retained all three applied migrations and reported zero users, zero activities,
and a zeroed R2 budget ledger. This verifies an empty-database export/restore path only; it does not
verify recovery of retained user data or R2 objects, nor a Worker rollback against production data.

## Evidence still required before public launch

- Configure the actual Cloudflare resources, Google client, secrets and HTTPS origin. Exercise a
  real Google sign-in and cookie lifecycle on that origin. Local development login does not prove
  the external OAuth integration.
- Test representative real device exports, including pauses, multisport, indoor rides, missing
  sensors and corrupt files. Synthetic fixtures establish internal consistency, not device
  compatibility across manufacturers or model accuracy on athletes.
- Measure large-library behavior on actual target phones and production Worker CPU. The
  [Node benchmark](PERFORMANCE.md) is a useful baseline, not a mobile or free-tier guarantee.
- Verify a backup/restore procedure and a deployment rollback against retained data. D1 migrations
  are not automatically rolled back with Worker code. Test revisions newer than a rolled-back app.
- Set an operating budget and monitor Cloudflare usage/errors before opening sign-up. Per-user
  quotas do not cap aggregate storage across an unlimited number of accounts.
