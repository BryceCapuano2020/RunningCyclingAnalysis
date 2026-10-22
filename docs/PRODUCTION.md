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

## Live verification — 22 October 2026

The application is deployed at <https://rca-api.nutritioncoachapp.workers.dev>. The application
code at `493ce15` is served by Worker version `1143a60d-5562-43c2-95a2-4807b9073c93` with production
D1, the private Standard-class `rca-files` bucket, rate-limit bindings and Google secrets. Public
`r2.dev` access is disabled. Workers and D1 remain on their Free plans.

The live Chrome smoke used the repository's synthetic `one-run.fit`, not real device data:

- Real Google sign-in, sign-out and sign-in again restored the same account and library. OAuth
  state/verifier cookies carried Secure, HttpOnly, SameSite=Lax and the restricted OAuth path.
- Importing with retention off saved one summary. Enabling retention and re-importing the exact
  file preserved its activity id and stored its original without a duplicate activity. The upload
  charged 65,536 lifetime bytes for a 31,433-byte file, as intended.
- The authenticated original download matched the fixture byte for byte. Signed-out original
  requests returned 401, and the development-login POST returned 404 in production. Actual HTML,
  module-worker assets, CSP and API no-store/request-id headers were checked.
- Retention opt-out cleared file metadata while preserving the summary, and the R2 object was
  confirmed absent. The synthetic summary was then removed with an id/hash-guarded operator
  cleanup. The account remains, retention is back to its default off, and the deployment ledger
  still records 65,536 lifetime bytes and four application R2 operations. Cleanup did not refund it.
- A populated D1 export and a matching original were restored into isolated local D1/R2. The
  restored app authenticated locally and returned identical original bytes. No production database
  was overwritten. The original child-before-parent export failed this drill; the schema-first
  preparation helper below corrected the restore order.
- Production was rolled back to the preceding release and then returned to the fixed release.
  Sign-in and the saved library survived. Both releases use the same schema/model revision; this
  does not establish compatibility with future migrations or model revisions.

A $0.01 R2 billing alert was saved for the account owner. This is a notification, not a spending
cap. Application code budgets still cover only traffic through this Worker. Google Auth remains
External + Testing; only the owner's login was exercised. See [DEPLOY.md](DEPLOY.md) for Google's
basic-identity Testing exception and the separate public-brand requirements.

## Backup and isolated restore

Use Node 22.17 or later for the offline preparation helper. Run these commands from the repository
root. The temporary directory is an example for validation, not durable backup storage:

```bash
umask 077
RCA_BACKUP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/rca-backup.XXXXXX")"
npm exec -w @rca/api -- wrangler d1 export rca --remote \
  --output "$RCA_BACKUP_DIR/database.sql" > "$RCA_BACKUP_DIR/export.log" 2>&1
node apps/api/scripts/prepare-d1-restore.mjs \
  "$RCA_BACKUP_DIR/database.sql" "$RCA_BACKUP_DIR/restore.sql"
npm exec -w @rca/api -- wrangler d1 execute rca --local \
  --config wrangler.local.toml --persist-to "$RCA_BACKUP_DIR/validation-state" \
  --file "$RCA_BACKUP_DIR/restore.sql"
```

Keep exports and logs private: they can contain identity data, session hashes and a temporary
signed export URL. The helper accepts only trusted SQL exports of this application's known schema,
up to 64 MiB. It checks integrity and foreign keys in an isolated SQLite database, creates all tables
before rows, orders rows by foreign-key dependencies, and preserves migration and budget data.
It does not disable foreign keys in its output. It rejects unknown tables, dependency cycles and
existing output paths, and creates the new output with mode 0600. Larger exports need a separately
validated procedure. Do not execute arbitrary third-party SQL with this helper.

D1 exports do not contain R2 originals. Capture matching originals separately through authenticated
app downloads or private operator access, preserve their object keys, and verify their SHA-256
against `activities.file_hash`. Coordinate writes/deletions while taking a matching snapshot;
a database dump and an uncoordinated bucket copy are not an atomic backup. Restore originals to
isolated local R2 and verify them through the restored app, as in the smoke above. Move verified
backups to private durable storage according to an explicit retention/deletion policy; no recurring
backup job has been configured.

Before any production cutover, validate schema/model compatibility and the matching originals.
**Never rewind the global R2 budget ledger to an older snapshot.** Preserve the higher live lifetime
counter and relevant monthly capacity usage. If post-snapshot usage cannot be established, treat
file capacity as exhausted until an operator reviews it. Restoring an old ledger is an operator
change outside the application's admission protection. Worker rollback does not undo D1 migrations
or R2 changes.

## Evidence still required before a broader launch

- Test representative real device exports, including pauses, multisport, indoor rides, missing
  sensors and corrupt files. Synthetic fixtures establish internal consistency, not manufacturer
  compatibility or model accuracy on athletes.
- Measure large-library behavior on actual target phones and production Worker CPU. The
  [Node benchmark](PERFORMANCE.md) is a baseline, not a mobile or free-tier guarantee.
- Validate larger backups and coordinated multi-user recovery, define durable backup retention,
  and test future schema/model rollback compatibility. The populated recovery drill covered one
  synthetic activity, not maximum database size or disaster recovery of an active multi-user service.
- Complete Google's public-brand requirements before representing the app as a verified public
  production brand. Continue checking Cloudflare usage/errors; code caps and alerts do not cap
  traffic from other bucket clients or account-level charges.
