# Production operation and release verification

This document records the operational behavior, the release and migration rules, backups, and the
remaining release evidence. It is not a claim of perfect reliability or of validated physiological
accuracy.

**Release state, 22 October 2026:** the running Worker was verified at code commit `493ce15`
and version `1143a60d-5562-43c2-95a2-4807b9073c93`. The current `main` tree is `310264a` and
contains follow-on operations documentation without runtime changes. The hardening branch has not
been deployed; its new limits, signed sessions, deletion retries, and model revision are source
behavior until a gated deployment succeeds.

## Release gate

Install dependencies with `npm ci`, then install browser engines with
`npm exec -w @rca/web -- playwright install chromium webkit`. Run `npm run verify:release`.
It checks formatting, lint, all package types, unit coverage, deployment configuration and
operations tests, the production build, Chromium and WebKit browser behavior, and the
Worker-served application.
The last test exercises the actual static-asset security policy, module worker, and same-origin
API together; a Vite preview alone cannot verify Cloudflare's `_headers` behavior.

The hardening branch defines a gated **Deploy** workflow (`.github/workflows/deploy.yml`) with this
intended order:

1. **Guard.** The run must start from `refs/heads/main`. Any other ref fails before anything else.
2. **Release gate.** `npm run verify:release` runs on the exact commit. Its static build is kept
   and is the only build that is deployed.
3. **Approval.** The `production` GitHub environment requires approval from the owner.
4. **Migrations.** Pending D1 migrations are applied to the production database before the new
   Worker code runs. See [Migrations: order of operations](#migrations-order-of-operations).
5. **Deploy.** `wrangler deploy` uploads the Worker. Its version carries the commit SHA as its tag
   and message.
6. **Smoke test.** `scripts/ops/smoke.mjs` checks the live origin: `GET /api/health` returns
   `{"status":"ok"}`, `GET /api/health/deep` returns 200, `GET /` serves HTML with the
   Content-Security-Policy header, `GET /api/me` returns 401, and `GET /api/auth/google` returns a
   302 to `accounts.google.com` whose `redirect_uri` is `APP_URL` plus `/api/auth/google/callback`.
   Each check is retried briefly to allow for propagation.
7. **Rollback.** If the smoke test fails, the workflow runs `wrangler rollback` to the previous
   Worker version and the run fails. Database migrations are not reversed by a rollback.

`npm run deploy` runs locally and must start from a clean checkout of `main` identical to
`origin/main` (`scripts/ops/check-release.mjs`). It then runs the release gate and deploys. It is
the same release, without the approval and smoke-test steps, so use the workflow for production.

Actions are pinned by commit SHA with the release tag in a comment. At review time the pins were
checked against the upstream tags for `actions/checkout` v7.0.1, `actions/setup-node` v7.1.0,
`actions/upload-artifact` v7.0.2 and `actions/download-artifact` v8.0.2. Dependabot proposes
updates weekly, grouped. A retried or flaky browser test fails CI rather than being hidden.

The initial `npm run deploy:bootstrap` is an explicit exception for discovering the Worker address.
It builds assets and requires a valid D1 id, but allows the initial unconfigured `APP_URL`.
Normal deployment additionally requires a real HTTPS origin and production mode. Follow
[DEPLOY.md](DEPLOY.md) for credentials, environment settings, origin setup and smoke tests.

### Repository settings checklist (owner)

These settings live in GitHub, not in the repository. Apply them when the repository becomes public.
The status-check names are the job names shown on pull requests and must match exactly.

**Branch protection rule for `main`:**

- Require a pull request before merging. Required approvals: 1 once a second reviewer exists. With
  the owner as the only writer, GitHub does not count an author's own approval; keep the review
  requirement and rely on the required checks until then.
- Require review from Code Owners (`.github/CODEOWNERS` assigns every path to the owner).
- Dismiss stale approvals when new commits are pushed.
- Require status checks to pass before merging, and require branches to be up to date. Add these
  checks: `Lint, typecheck, unit tests, build`, `End-to-end (Playwright)`, `Dependency audit`.
- Require conversation resolution before merging.
- Do not allow force pushes or deletion of `main`. Include administrators in these rules.

**Actions:**

- Settings, Actions, General. Allow actions created by GitHub and selected actions only, and require
  every action to be pinned to a full commit SHA (`actions/*` is the only publisher in use).
- Workflow permissions: read repository contents by default. Do not allow Actions to create or approve
  pull requests.
- Fork pull requests: require approval for all outside collaborators before their workflows run.

**Environments** (Settings, Environments):

- `production`: required reviewer is the owner. Deployment branches: selected branches, `main` only.
  Secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (the deploy token needs Workers
  Scripts Edit, D1 Edit and Account Settings Read).
- `backup`: no reviewers, because scheduled runs cannot wait for approval. Deployment branches:
  `main` only. Secrets: `CLOUDFLARE_BACKUP_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
  `R2_BACKUP_ACCESS_KEY_ID` and `R2_BACKUP_SECRET_ACCESS_KEY`.
- No secrets belong at repository level, so workflows on other branches cannot read them.

**Security and maintenance:**

- Enable private vulnerability reporting. `apps/web/public/.well-known/security.txt` points reporters
  to the repository's security advisory form.
- Enable Dependabot alerts and security updates. Version updates are configured in
  `.github/dependabot.yml`.
- Turn on notifications for failed workflow runs and for issues labelled `outage`.
- Scheduled workflows run only from the default branch. The branch's backup and uptime source files
  are not active jobs; configure them after merge before relying on them. GitHub disables scheduled
  workflows in public repositories after 60 days without repository activity. Check configured
  schedules to confirm they still run.

## Migrations: order of operations

The Deploy workflow applies migrations **before** it deploys the new Worker, and a rollback
restores the previous Worker against the schema that is already applied. Both facts drive one
rule:

> **Expand, then deploy, then contract.**

- **Expand** (any release): additive changes only. Create new tables, add columns that are nullable
  or have a default, add indexes. The Worker that is still live must keep working, since it will
  run against the expanded schema. It does not name the new columns, so its inserts must still
  succeed.
- **Deploy**: ship the code that uses the expanded schema. It must also tolerate rows written by
  the previous Worker.
- **Contract** (a later release): drop or rename columns, add `NOT NULL` without a default, or
  delete tables. Do this only after no supported rollback target reads the old shape. Record in the
  release notes which Worker version is the earliest rollback target.

Migrations only move forward. There are no down migrations: a mistake is fixed by a new migration.
`wrangler d1 migrations apply` stops at a failing migration and rolls that one back, which stops the
workflow before the deploy. Wrangler also captures a backup of the database when it applies
migrations, as its help text describes. That copy is held by Cloudflare and is not the off-platform
backup below.

Each existing migration was reviewed against this rule:

| Migration                       | What it does                                                                                                                                    | Why it is safe to run before the code that reads it                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0000_init`                     | Creates `users`, `oauth_accounts`, `sessions`, `profiles`, `activities` and their indexes.                                                      | Baseline for an empty database. It only creates tables, so every earlier Worker can use it. Production already has it applied.                                                                                                                                                                                                                                                                                                                           |
| `0001_session_created_at`       | Adds `sessions.created_at` with default `0` and `NOT NULL`, and an index on `activities(user_id, created_at)`.                                  | Older Workers insert sessions without naming the column, so the default fills it and their inserts still succeed. Side effect: a session created by an older Worker after this migration has `created_at = 0`, which the current Worker treats as already past its 90-day absolute lifetime. Those users sign in again. That is a forced sign-in, not data loss. Shipping the Worker promptly keeps that window short.                                   |
| `0002_r2_storage_budget`        | Creates `r2_storage_budget` and inserts one ledger row initialized from the sum of `activities.file_size`.                                      | Older Workers never read or write the table, so it is invisible to them. Limitation: an original uploaded through an older Worker after this migration and before the new Worker is live is not counted in the ledger. The Deploy workflow applies the migration and deploys in one run, so the window is minutes. The ledger also cannot reconstruct historical PUT retries; [Request isolation and limits](#request-isolation-and-limits) covers that. |
| `0003_budgets_deletion_indexes` | Adds daily budgets, upload leases, account-deletion tombstones, per-user activity counters, bounded health-probe counters, and cleanup indexes. | Additive columns and tables let the currently running Worker continue to read its existing schema. The first signed-session Worker deployment also requires `SESSION_SIGNING_KEY`; unsigned cookies from the prior runtime become invalid, so users sign in again.                                                                                                                                                                                       |

## Limits

Service limits (per-account quotas, byte caps, edge rate limits and the application-wide R2
budgets) are listed in [apps/api/LIMITS.md](../apps/api/LIMITS.md). This document describes how
they behave in production; the limits page is the reference for values.

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
The branch's per-user UTC daily budgets allow 2,000 new activities and 2,000 original-file uploads,
with a separate 1,000 authenticated reads, 50 profile writes, 50 activity deletes and 50 file
downloads. Contract constants and detailed behavior are listed in
[LIMITS.md](../apps/api/LIMITS.md).

Application-wide R2 admission limits are separate from per-account quotas. In the hardening branch,
all users share a 2 GiB PUT-charge budget and a 100,000-operation budget per UTC month. Each PUT
attempt reserves `max(actual body bytes, 64 KiB)` and one operation atomically before calling R2.
Failed attempts and retries keep their monthly charges. The monthly byte and operation counters
reset at the next UTC month; `lifetime_put_bytes` remains an audit total and does not block uploads.
The migration initializes the byte ledger from the sum of recorded activity file sizes. This
includes rows that may only be reservations for failed older uploads, but it cannot reconstruct
repeated historical retries or identify untracked R2 objects that predate the ledger; the starting
ledger may undercount prior monthly PUT charges and existing objects. Deep-health `HEAD` probes use
a separate global budget of 300 per UTC day and 9,300 per UTC month, in addition to a one-per-minute
per-address limiter. Ordinary puts and gets stop at 90,000 monthly operations, preserving 10,000
for cleanup LIST calls; list calls share that total and may use the cleanup headroom. Deletes and
aborts do not consume operations. Exhausted capacity returns `429 storage_budget_exhausted`; cleanup
refuses before changing D1 state if its reserved list headroom is exhausted. These values describe
the hardening branch; they are not the limits of the currently deployed runtime. The limits cover
calls through this Worker only. Keep `rca-files` private and dedicated: direct bucket/API access,
other clients and dashboard operations can bypass application limits, and Cloudflare may bill R2
usage above its free allowance.

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
- Digest schema version and model revision are separate. Revision 3 contains the corrected sensor
  validity/timer handling and preserves long run efforts across short unpaused stops. Missing
  revision means legacy revision 1. Older analyses are excluded and can be rebuilt from retained
  original files; missing originals need re-importing. Newer revisions are excluded with a
  separate compatibility notice.
- Upgrades require the same sport/start dedupe identity and SHA-256 of the exact original bytes.
  They retain the activity id and stored-file metadata. Different file contents conflict rather
  than silently replacing an activity, and older clients cannot downgrade newer stored summaries.
- Browser/server state after an interrupted rebuild may be partial. Successful upgrades remain
  usable; unresolved entries retain their stale status and can be retried.

## Security headers and diagnostics

Static assets use a Content Security Policy that allows same-origin scripts, workers and
connections, and profile pictures from `lh3.googleusercontent.com`. It allows no dynamic code
generation. Inline styles are allowed because charts use positioned styles. Objects and embedding
are blocked. Responses also set `Cross-Origin-Opener-Policy` and `Cross-Origin-Resource-Policy` to
`same-origin`, and HSTS with `max-age=31536000` and no `includeSubDomains` or `preload`, because
`workers.dev` is a shared domain. The API is `no-store`, including errors, with attachment-only
file downloads. Both surfaces set nosniff, framing and referrer controls. Header behavior is
covered by the Worker browser smoke test. See Cloudflare's
[static-asset headers documentation](https://developers.cloudflare.com/workers/static-assets/headers/).

Cloudflare's `_headers` syntax allows only a trailing `*`, so `/assets/*` cannot be narrowed to
JavaScript and CSS files. The single-page fallback answers an unknown `/assets/...` path with
`index.html`, and that response also receives the one-year immutable cache header. The risk is
limited to a URL nothing links to, which a browser caches once. Removing it would need the Worker
to answer missing `/assets/` paths with 404, which the current asset routing does not do.

API responses include `X-Request-ID`. Unexpected-error logs contain that id and the exception
class; they do not include request bodies, query strings, original files, tokens, or raw database
error messages. Use the id to correlate a reported failure with Worker logs. Do not enable verbose
request/body logging around personal activity files or OAuth callbacks.

## Observability

- **External uptime probe (source only).** `.github/workflows/uptime.yml` defines a 15-minute probe
  from GitHub-hosted runners, independent of the Worker. It checks `/api/health`,
  `/api/health/deep`, the web app, and the Google sign-in redirect's `redirect_uri`. Each check gets
  one retry after 20 seconds. A failure opens or updates an issue labelled `outage`; the next
  passing run closes open outage issues. This workflow has not been enabled from the default branch,
  so no active monitor is claimed.
- **Limits of that probe.** GitHub may delay or skip scheduled runs under load. GitHub also disables
  scheduled workflows in public repositories after 60 days without repository activity, so an
  occasional commit or a manual run keeps it active. The probe sees only what a public client sees;
  it does not measure quota exhaustion before it causes failures.
- **Owner notifications.** Turn on GitHub notifications for failed workflow runs and for issues
  labelled `outage`, so a failed probe reaches the owner.
- **Worker and platform.** Worker logs and the Cloudflare dashboard show request and error counts
  and D1 and R2 usage. Check them when an outage issue opens, and before raising any limit.

## Live verification, historical (22 October 2026)

The live verification below was recorded for runtime commit `493ce15`, served by Worker version
`1143a60d-5562-43c2-95a2-4807b9073c93`. The current `main` tree is `310264a`, a follow-on containing
operations documentation and tooling without runtime changes. The hardening branch is not deployed;
none of its runtime changes below should be treated as live evidence. After a gated deployment,
record the actual commit, Worker version, date and smoke-test result here.

The deployment ran with production D1, the private Standard-class `rca-files` bucket,
rate-limit bindings and Google secrets. Public `r2.dev` access was disabled. Workers and D1 remain
on their Free plans.

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
  Sign-in and the saved library survived. Both tested releases used the same schema/model revision;
  this does not establish compatibility with migrations or model revisions added on the hardening
  branch.

A $0.01 R2 billing alert was saved for the account owner. This is a notification, not a spending
cap. Application code budgets still cover only traffic through this Worker. Google Auth remains
External + Testing; only the owner's login was exercised. See [DEPLOY.md](DEPLOY.md) for Google's
basic-identity Testing exception and the separate public-brand requirements.

## Backup and restore

### Backup workflow source

`.github/workflows/backup.yml` defines a daily 04:05 UTC backup and a manual trigger. It is source
only at this review: no age recipient/key, backup environment secrets or remote workflow setup were
configured, and no active or verified backup job is claimed. Its intended steps are:

1. refuses to run unless `ops/backup-recipient.txt` holds a real age public key;
2. exports the production D1 database with `wrangler d1 export rca --remote`, and checks it with the
   same validated path used for restores (known schema, integrity, foreign keys);
3. lists the objects in `rca-files` with the S3-compatible API, because Wrangler has no command to
   list R2 objects, and writes a manifest of their keys,
   sizes, ETags and modification times, plus row counts and the SHA-256 of the export;
4. compresses the export and manifest, and encrypts them with age to the recipient in
   `ops/backup-recipient.txt`;
5. uploads the single encrypted archive as a workflow artifact kept for 90 days.

The repository is public, so artifacts can be downloaded by anyone. The private age key is never
stored in GitHub, so the encryption is the only protection of the archive. The plaintext files stay
in the runner's temporary directory and are deleted at the end of the run. The export log is
withheld from the job log because it can contain a temporary signed URL. The job summary shows only
the archive name, so it does not expose user counts or identifiers.

**Targets after setup and successful runs:** RPO 24 hours; RTO 2 hours from the decision to restore
to a verified preview Worker. These targets are not met while the backup workflow is inactive. The
restore procedure, verification and cutover rules are in
[scripts/ops/restore.md](../scripts/ops/restore.md).
The preview Worker in a restore drill must use a new scratch R2 bucket and have its cron trigger
removed. Binding it to production `rca-files` could let orphan cleanup delete current files when the
restored database lacks their references.

**What the backup does not contain:**

- **Original FIT files in R2.** These are not copied off Cloudflare. Users keep their own originals,
  and the owner should not promise that a stored original is recoverable. The manifest only records
  which objects existed, so an activity whose original is missing can be identified and re-imported.
- **A deletion log.** The application keeps no record of deleted accounts. A restored backup can
  contain accounts that were deleted after it was taken, so the restore procedure requires
  reconciling them.
- **Anything after the backup time.** Changes after the newest backup are lost.

When configured, backups hold sessions (as hashes), account identifiers, email addresses and
activity summaries, and are deleted after 90 days.

### Setting up backups (owner)

1. Generate an age key pair on your own machine with `age-keygen`. Put the public key in
   `ops/backup-recipient.txt` and commit it. Store the private key offline. Until this is done, the
   workflow fails before exporting anything.
2. Create a Cloudflare API token for backups, separate from the deploy token: Account, D1, Edit, and
   Account Settings, Read. Create an R2 API token with Object Read on `rca-files`, and note its access
   key ID and secret.
3. Create a GitHub environment named `backup` (no reviewers, because scheduled runs cannot be
   approved). Restrict it to the `main` branch. Store `CLOUDFLARE_BACKUP_API_TOKEN`,
   `CLOUDFLARE_ACCOUNT_ID`, `R2_BACKUP_ACCESS_KEY_ID` and `R2_BACKUP_SECRET_ACCESS_KEY` as its
   secrets.

### Isolated manual check

The validation helper can also be run by hand on an export, from the repository root with Node
22.17 or later. The temporary directory is an example for validation, not durable storage:

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
- Run the restore procedure in [scripts/ops/restore.md](../scripts/ops/restore.md) as a recorded
  drill, and measure it against the 2-hour RTO. Until a drill is recorded, the restore is unverified.
  Also add a deletion log so restores can reconcile deleted accounts, and test future
  schema/model rollback compatibility. The drills so far covered one synthetic activity, not
  maximum database size or disaster recovery of an active multi-user service.
- Complete Google's public-brand requirements before representing the app as a verified public
  production brand. Continue checking Cloudflare usage/errors; code caps and alerts do not cap
  traffic from other bucket clients or account-level charges.
