# Production operation and release verification

This document records the operational behavior, the release and migration rules, backups, and the
remaining release evidence. It is not a claim of perfect reliability or of validated physiological
accuracy.

**Current release state.** Releases so far were deployed with the Wrangler CLI from a local session,
not by the Deploy workflow. [RELEASES.md](RELEASES.md) is the ledger of what went live and when: the
commit, the Worker version, the migrations applied and the rollback floor. The live build reports its
commit as `sha` in `GET /api/health`, and `npm run smoke:prod -- --expect-sha <sha>` checks the live
origin against it. To list versions and their tagged commits, run `npx wrangler deployments list` in
`apps/api`. Future production deploys should go through `.github/workflows/deploy.yml` once the
`production` environment and its secrets exist.

Backup and uptime schedules stay disabled until their repository variables are set. The owner setup
order is under [Setting up backups (owner)](#setting-up-backups-owner). No automatic rollback target
is configured, and a Worker that predates signed session cookies must not be chosen as one. A
snapshot taken after a migration was restored into isolated local D1. Production originals were
empty, so that drill does not establish recovery of populated originals.

## Release gate

Install dependencies with `npm ci`, then install browser engines with
`npm exec -w @rca/web -- playwright install chromium webkit`. Run `npm run verify:release`.
It checks formatting, lint, all package types, unit coverage, deployment configuration and
operations tests, the production build, Chromium and WebKit browser behavior, and the
Worker-served application.
CI does not install browsers. The `ci.yml` end-to-end shards and the `deploy.yml` release gate run in
the official Playwright container, pinned by tag and digest to the `@playwright/test` version in
`package-lock.json`. Browser downloads and apt packages therefore never stall a run. When that
version is upgraded, change the image tag and digest in both workflows. The ops test
`scripts/ops/workflow-guards.test.mjs` fails while the tag and lockfile disagree.
The last test exercises the actual static-asset security policy, module worker, and same-origin
API together; a Vite preview alone cannot verify Cloudflare's `_headers` behavior.

The repository defines a gated **Deploy** workflow (`.github/workflows/deploy.yml`) with this
intended order:

1. **Guard.** The run must start from `refs/heads/main`. Any other ref fails before anything else.
2. **Release gate.** `npm run verify:release` runs on the exact commit. Its static build is kept
   and is the only build that is deployed.
3. **Approval.** The `production` GitHub environment requires approval from the owner.
4. **Preflight.** The workflow verifies production config and the presence of required Worker
   secret names before changing D1. It does not inspect or print secret values.
5. **Migrations.** Pending D1 migrations are applied to the production database before the new
   Worker code runs. See [Migrations: order of operations](#migrations-order-of-operations).
6. **Deploy.** `wrangler deploy` uploads the Worker. Its version carries the commit SHA as its tag
   and message, and the commit is built into `GET /api/health`.
7. **Smoke test.** `scripts/ops/smoke.mjs --expect-sha` checks the live origin: `GET /api/health`
   returns `{"status":"ok"}` and the `sha` of the commit just deployed, `GET /api/health/deep` returns
   200, an unknown path returns 404 with the Worker's security headers, `GET /` serves HTML with the
   Content-Security-Policy header, `GET /api/me` returns 200 with a `null` body, and `GET /api/auth/google` returns a
   302 to `accounts.google.com` whose `redirect_uri` is `APP_URL` plus `/api/auth/google/callback`.
   `POST /api/auth/dev-login` with an empty object must answer 404: any other answer means the
   development gate is open. Each check is retried briefly to allow for propagation.
8. **Rollback.** If the smoke test fails and `RCA_SAFE_ROLLBACK_VERSION` names an explicitly
   verified compatible Worker version, the workflow rolls back to that version and the run fails.
   If no version is configured, no rollback is attempted and the run still fails. Database
   migrations are not reversed by a rollback. A rollback to a Worker from before the sign-up list
   makes sign-up public again; see [Sign-up list](#sign-up-list-worker-secret-allowed_emails).

`npm run deploy` runs locally and must start from a clean checkout of `main` identical to
`origin/main` (`scripts/ops/check-release.mjs`). It then runs the release gate and deploys. It is
the same release, without the approval step, so use the workflow for production. Right after the
Worker is uploaded it runs the same smoke test as the workflow and prints the rollback floor if it fails.
`npm run deploy:built` refuses to run while remote D1 migrations are pending, so apply them first with
`npm run db:migrate:remote -w @rca/api`. It also refuses a working tree with uncommitted or untracked
changes, a commit that is not the tip of `origin/main` (`--allow-older` deploys an older merged one on
purpose) and a web build that was not made from that commit (`dist/build-info.json`), so a release can
run from a detached worktree at the merged tip. It tags the Worker version with the 8-character
commit id, writes the full commit into the version message, and builds the id into `/api/health`.
The smoke test runs on its own after a local deploy; to run it again use
`npm run smoke:prod -- --expect-sha <sha>`: it sends only GET
requests to the live origin, plus one empty-object POST to `/api/auth/dev-login` that cannot change
anything in either state. Add the release to [RELEASES.md](RELEASES.md).

Every `uses:` reference in `.github/workflows` is pinned to a full commit SHA, with the release tag in
a comment. Repository settings do not enforce SHA pinning, and GitHub does not block a workflow that
names a tag or branch instead, so review workflow changes for this. Dependabot version updates are
scheduled weekly in `.github/dependabot.yml`: minor and patch updates are grouped (production and
development separately, and all of the actions together), a major update is its own pull request,
and at most four npm and two action pull requests are open at once (whether the npm cap
counts per directory or across the `directories` list is unconfirmed; check it after the first
week). Dependabot security updates for
vulnerable dependencies are controlled by a repository setting, not by that file, and ignore those
caps. A retried or flaky browser test fails CI rather
than being hidden.

The initial `npm run deploy:bootstrap` is an explicit exception for discovering the Worker address.
It builds assets and requires a valid D1 id, but allows the initial unconfigured `APP_URL`.
Normal deployment additionally requires a real HTTPS origin and production mode. Follow
[DEPLOY.md](DEPLOY.md) for credentials, environment settings, origin setup and smoke tests.

### Repository settings checklist (owner)

These settings live in GitHub, not in the repository.
The status-check names are the job names shown on pull requests and must match exactly.

**Branch protection on `main` requires:**

- A pull request before merging, with 0 required approvals, because the owner is the sole
  maintainer. The required status checks are the gate.
- Passing status checks: `Lint, typecheck, unit tests, build`, `End-to-end (Playwright)`,
  `Performance budgets`, `Statistical simulations` and `Dependency audit`. `Performance budgets`
  (the wall-clock timing job) and `Statistical simulations` (the seeded detector simulations) are
  split out of the first check so a loaded runner cannot fail the unit tests. The unit tests run in
  two shards and the end-to-end tests in three. The two shard-backed checks are small jobs that pass
  only when every shard passed; the first also merges the unit shards and applies the coverage
  thresholds to the whole run. A documentation-only pull request (every changed file is Markdown,
  under `docs/` or `LICENSE`) skips the end-to-end, unit-test, budget and simulation jobs and the
  typecheck and build steps, and runs the format check, lint, ops tests and the unit tests that
  read Markdown, in about 3 minutes. GitHub counts a job skipped by its condition as passing, so
  these pull requests still merge. Pushes to `main` run everything, and no `main` run is ever
  cancelled, so every commit on `main` gets a verdict.
- Branches do not need to be up to date with `main` before merging ("require branches to be up to
  date" is off), so a green pull request merges without a rebase. Every push to `main` runs the
  full CI, which catches two changes that pass alone but fail together. See
  [PROCESS.md](PROCESS.md).
- All review conversations resolved; stale approvals are dismissed on new commits.
- Linear history (merges are squash-only and merged branches are deleted).
- The same rules for administrators.
- No Code Owners review is required. `.github/CODEOWNERS` assigns every path to the owner and is kept
  for a future second maintainer.
- No force pushes and no deletion of `main`.

**Actions:**

- Settings, Actions, General. Allow actions created by GitHub and selected actions only (`actions/*`
  is the only publisher in use). SHA pinning is done in the workflow files and is not enforced by
  these settings.
- Workflow permissions: read repository contents by default. Do not allow Actions to create or approve
  pull requests.
- Fork pull requests: require approval for all outside collaborators before their workflows run.

**Environments** (Settings, Environments):

- `production`: required reviewer is the owner. Deployment branches: selected branches, `main` only.
  Secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (the deploy token needs Workers
  Scripts Edit, D1 Edit and Account Settings Read). Set `RCA_SAFE_ROLLBACK_VERSION` only to a
  Worker version verified against the current schema and data state. A Worker version deployed
  before signed cookies and deletion tombstones existed is not compatible and must not be selected.
- `backup`: no reviewers, because scheduled runs cannot wait for approval. Deployment branches:
  `main` only. Secrets: `CLOUDFLARE_BACKUP_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
  `R2_BACKUP_ACCESS_KEY_ID` and `R2_BACKUP_SECRET_ACCESS_KEY`.
- No secrets belong at repository level, so workflows on other branches cannot read them.

**Security and maintenance:**

- Enable private vulnerability reporting. `apps/web/public/.well-known/security.txt` points reporters
  to the repository's security advisory form.
- Enable Dependabot alerts and security updates. Version updates are configured in
  `.github/dependabot.yml`.
- **Secret scanning and push protection** (Settings, Code security). These are the last defence
  against a secret committed by mistake, by a person or by a coding agent, in a public repository.
  They are off until the owner switches them on, and no file in the repository can do it. Turn on
  both. Then check them with
  `gh api repos/BryceCapuano2020/RunningCyclingAnalysis --jq .security_and_analysis`: both entries must say
  `enabled`. If a key has ever appeared in a shared process or a log, rotate it; do not rely on the
  scanner to find it.
- `docs/audits/` is git-ignored because it can quote real-data aggregates. Check that a new clone
  still ignores it with `git check-ignore -v docs/audits/x` before using `git add -A`.
- Turn on notifications for failed workflow runs and for issues labelled `outage`.
- Scheduled workflows run only from the default branch. Backup and uptime schedules run only when the
  repository variables `RCA_BACKUP_ENABLED` and `RCA_UPTIME_ENABLED` each equal `true`. Manual runs
  remain available. GitHub disables scheduled workflows in public repositories after 60 days without
  repository activity, so check that the schedules still run.

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

| Migration                       | What it does                                                                                                                                                                                                                                                        | Why it is safe to run before the code that reads it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0000_init`                     | Creates `users`, `oauth_accounts`, `sessions`, `profiles`, `activities` and their indexes.                                                                                                                                                                          | Baseline for an empty database. It only creates tables, so every earlier Worker can use it. Production already has it applied.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `0001_session_created_at`       | Adds `sessions.created_at` with default `0` and `NOT NULL`, and an index on `activities(user_id, created_at)`.                                                                                                                                                      | Older Workers insert sessions without naming the column, so the default fills it and their inserts still succeed. Side effect: a session created by an older Worker after this migration has `created_at = 0`, which the current Worker treats as already past its 90-day absolute lifetime. Those users sign in again. That is a forced sign-in, not data loss. Shipping the Worker promptly keeps that window short.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `0002_r2_storage_budget`        | Creates `r2_storage_budget` and inserts one ledger row initialized from the sum of `activities.file_size`.                                                                                                                                                          | Older Workers never read or write the table, so it is invisible to them. Limitation: an original uploaded through an older Worker after this migration and before the new Worker is live is not counted in the ledger. The Deploy workflow applies the migration and deploys in one run, so the window is minutes. The ledger also cannot reconstruct historical PUT retries; [Request isolation and limits](#request-isolation-and-limits) covers that.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `0003_budgets_deletion_indexes` | Adds daily budgets, upload leases, account-deletion tombstones, per-user activity counters, bounded health-probe counters, and cleanup indexes.                                                                                                                     | Additive columns and tables let the currently running Worker continue to read its existing schema. The first signed-session Worker deployment also requires `SESSION_SIGNING_KEY`; unsigned cookies from the prior runtime become invalid, so users sign in again.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `0004_digest_bytes`             | Adds `users.digest_bytes` (not null, default 0), backfilled from each user's existing digest JSON, `users.list_cursor` (nullable), and `r2_storage_budget.d1_size_bytes` (not null, default 0).                                                                     | Each new column has a default or allows null, so older Workers' inserts still succeed. Older Workers can still create or delete activities after the backfill and before the new Worker is fully serving, which leaves `digest_bytes` out of sync. After the new Worker is fully serving, reconcile the counter with the SQL below before relying on the digest quota.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `0005_upload_reservation_token` | Adds nullable `activities.file_reservation_token`, which identifies the upload holding a file-size reservation.                                                                                                                                                     | The column allows null and older Workers omit it from inserts and updates, so their SQL continues to work while the new Worker is being deployed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `0006_profile_age_sex`          | Adds nullable `profiles.birth_year` and `profiles.sex`. A `CHECK` limits `sex` to `female` or `male`, and a null is allowed.                                                                                                                                        | Both columns allow null and existing rows are null, so older Workers' profile inserts and updates succeed. Older Workers name only their own columns, so they never write or read the new ones. The `CHECK` is evaluated against existing rows when the column is added, and every existing row is null.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `0007_profile_mass_nullable`    | Rebuilds `profiles` so `mass_kg` allows null, copying every row unchanged. A new account's body weight is stored as null until the rider enters one.                                                                                                                | Relaxing `NOT NULL` changes no existing row, so nothing already stored moves. The previous web client's `ProfileSchema` reads `massKg` as `z.number()`, so it would reject a null weight. Nulls are therefore written only by this release, and the earliest safe rollback target is this release. Accepted limitations. Server: profiles saved before this release keep the 75 kg filled in before setup was answered, since no data is migrated; production has essentially no accounts, so no data migration is written. Device: a device that skipped setup on an earlier release keeps its stored 75 kg, which reads as entered, because the old Skip also marked setup done. A signed-out athlete who types exactly 75 kg on Profile before answering setup sees it dropped on reload, since the stored value is the same as the placeholder; there is no marker. The Profile page shows the saved weight, so the athlete can correct it. The rebuild runs in one migration, and `PRAGMA foreign_key_check` is clean after it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `0008_file_bytes`               | Adds `users.file_bytes` (not null, default 0), three triggers on `activities` that keep it equal to the sum of `file_size`, and backfills it from each user's current rows.                                                                                         | The column has a default, so older Workers' inserts still succeed, and they never name it. The triggers fire on any write to `file_size`, so an older Worker that uploads or deletes between the migration and the new Worker keeps the counter exact, and no reconciliation is needed. The triggers are created before the backfill, which reads every sum in one statement, so no write is missed or counted twice. The earlier Worker never reads the column, so it stays a rollback target.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `0009_athlete_measurements`     | Creates `athlete_measurements`: the athlete's dated body mass, maximum heart rate and thresholds, keyed by user, kind, sport and date, with `CHECK`s on `kind` and `sport`.                                                                                         | A new table that no earlier Worker reads or writes, so it is invisible to them and every earlier release stays a rollback target. Its rows go with the account through the `ON DELETE CASCADE` foreign key. No data is migrated: a rider's current body mass stays in `profiles` and is treated as the latest entry.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `0010_signup_safety_list_index` | Creates `identity_budget` (a deleted account's daily counts under a keyed code of its Google identity), adds the index `activities_user_created_id_idx (user_id, created_at, id)` for the library listing, and a unique index `oauth_accounts (user_id, provider)`. | Additive plus one clearing UPDATE: a new table no earlier Worker touches, two indexes, and `users.list_cursor` set to NULL where it holds a value. Earlier Workers never name an index, so their queries only gain a better plan; they link identities with `INSERT ... WHERE NOT EXISTS (same user and provider)`, which cannot violate the unique index. `users.list_cursor` stays, because the previous Worker still reads and writes it; the migration sets any existing value to NULL (the new Worker never uses the column, and NULL is "no slot" to the previous Worker, which then charges a read unit for a cursor, as it does for any cursor that is not the last one it issued). The earlier Worker (`3e17b541`) stays a rollback target and the floor does not move. **That Worker, and any rollback to it, ignores `ALLOWED_EMAILS`: a rollback reopens public sign-up and drops the account-create and session caps** (see Sign-up list, "Rollback reopens sign-up", for the steps to take afterwards). After a rollback the old Worker's single cursor slot rejects cursors the new one issued, so only the first mismatched page of an in-flight library load is charged a read unit; the old Worker then issues its own cursor and the rest of the chain is free. **The unique index fails the migration if some user already has two identities for one provider; the migration stops before any Worker change.** Check first, read-only: `SELECT user_id, provider, COUNT(*) AS n FROM oauth_accounts GROUP BY user_id, provider HAVING COUNT(*) > 1` returns no row. The owner applies this migration; it was not applied by the change that added it. |
| `0011_account_tombstones`       | Creates `account_tombstones` (random account id and deletion time, one row per deleted account, kept 100 days) and its index on `deleted_at`.                                                                                                                       | Additive: a new table no earlier Worker reads or writes, so every earlier Worker stays a rollback target and the floor does not move. A rollback to a Worker without the table stops writing tombstones, so accounts deleted meanwhile are not covered by a later restore reconciliation; keep a private note of them. **The owner applies this migration, before the Worker that writes it is deployed; it was not applied by the change that added it.** The deletion path fails if the table is missing, so never deploy that Worker first (`deploy:built` refuses while a migration is pending).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

After the Worker version that maintains `digest_bytes` is fully serving, reconcile any writes made
by the previous Worker between migration 0004 and deployment. Run this as one statement against the
production D1 database:

```sql
UPDATE users
SET digest_bytes = (
  SELECT coalesce(sum(length(CAST(digest_json AS BLOB))), 0)
  FROM activities
  WHERE activities.user_id = users.id
);
```

`file_bytes` needs no reconciliation, because the triggers keep it exact. To check it, this query
returns no rows:

```sql
SELECT id FROM users
WHERE file_bytes <> (SELECT coalesce(sum(file_size), 0) FROM activities WHERE user_id = users.id);
```

## Sign-up list (Worker secret `ALLOWED_EMAILS`)

New accounts need the verified Google email to be in the Worker secret `ALLOWED_EMAILS`. It is not in the
repository and not in `wrangler.toml`.

- Set it: `cd apps/api && npx wrangler secret put ALLOWED_EMAILS`, then paste the addresses, comma
  separated, for example `friend1@example.test,friend2@example.test`. Case and spaces around entries do not
  matter; entries are exact addresses, with no wildcards. To add or remove someone, run the command again with
  the whole new list (a secret cannot be edited in place). A change applies to the next sign-in.
- Unset or blank, **no new account can be created** in production (fail closed); local development is open.
  The release preflight (`scripts/ops/check-worker-secrets.mjs`, run by `npm run deploy:built` and the Deploy
  workflow) fails when the name is missing, so a deploy cannot silently turn sign-up off.
- It gates new accounts only. An existing account signs in whatever the secret holds, and taking an address
  off the list does not sign that person out. To revoke someone, **first** take the address off the list
  (`wrangler secret put ALLOWED_EMAILS` with the new list), **then** delete their account: `DELETE /api/me`
  from their session, or as the operator `DELETE FROM users WHERE id = ?` in D1 (the rows cascade). In that
  order the Google account cannot sign up again in the gap between the two steps. A direct SQL delete skips
  what `DELETE /api/me` does: it does not sweep the account's original files from R2 (the daily orphan sweep
  removes them later, within the grace period) and does not save the day's counts under the identity code, so
  that day's counts do not carry over if the person signs up again.
- **Rollback reopens sign-up.** Every Worker released before this change, which includes the rollback floor
  `3e17b541` and any version `RCA_SAFE_ROLLBACK_VERSION` could name, ignores `ALLOWED_EMAILS`. It also has no
  account-create cap, no session cap and the old single-slot list cursor. So a rollback, automatic or
  manual, makes sign-up public again for as long as that Worker serves; the secret and the migration do not
  change that. After any rollback to such a Worker: (1) roll forward again as soon as the fault is fixed, or
  accept the exposure knowingly; (2) read, from D1, the accounts created since the rollback
  (`SELECT id, email, created_at FROM users WHERE created_at >= <rollback time in ms> ORDER BY created_at`) and
  delete any that are not on the list, list first and delete second as above; (3) do not leave
  `RCA_SAFE_ROLLBACK_VERSION` set to a version older than the first release that carries the list unless that
  exposure is accepted.
- A Google account that is not on the list gets a short page ("This Google account is not on the list"),
  HTTP 403, and nothing is written. One Google identity can create five accounts a UTC day, deleted ones
  included, and deleting an account does not reset that day's counts (see `apps/api/LIMITS.md`).
- `GET /api/sessions` and `DELETE /api/sessions` (optionally `?keep=current`) list and end an account's
  sessions as a set; a user holds at most ten.
- `isLocalDevelopment` (`ENVIRONMENT` is `development`, `APP_URL` and the request host are loopback) decides
  dev-login, the rate-limit bypass, plain cookies and the missing HSTS header. The smoke test posts an empty
  object to `/api/auth/dev-login` and requires 404, so a Worker deployed with the gate open fails the
  release.

## Read-only switch and abuse response

**The switch.** The plain Worker variable `READ_ONLY` ("true", "1" or "on", any case) makes the API refuse every request that
would change data with **503 `read_only`** and a message the app shows: saves and uploads, profile and measurement changes,
deletes, labels, and new sign-ins (`POST /api/auth/dev-login` and the Google callback). People who are signed in keep reading
their library, the health checks answer, and **ending a session still works** (`POST /api/auth/logout`). The web app stops
its saves without retrying and keeps what is waiting in the browser's outbox for the next visit. Unset, blank or anything
else is off.

- Turn it on fast: in the Cloudflare dashboard, the API Worker, Settings, Variables, add the plain text variable
  `READ_ONLY` = `true` and deploy the setting. Or put `READ_ONLY = "true"` under `[vars]` in `apps/api/wrangler.toml` and
  release through the normal procedure.
- A release from `wrangler.toml` sets the plain variables to the file's values. After any release, check the switch
  (`curl -s -X POST -H 'X-RCA-Client: web' https://<host>/api/activities -i` answers 503 `read_only` while it is on).
- **Rollback to an older Worker ignores it.** Every Worker released before this one, the rollback floor `3e17b541`
  included, has no switch, so a rollback during an abuse response writes again.
- The switch does not stop everything that writes. Reads still count against the daily read budgets, sessions refresh
  their expiry, and the scheduled job (cleanup of deleted accounts, orphan files, the R2 ledger) keeps running; to stop the
  job as well, remove the cron trigger from the Worker in the dashboard.
- Turn it off by deleting the variable (or setting it to `false`) and deploying the setting. Saves that waited in people's
  outboxes then go through on their next visit.

**When to use it:** the database is near its guard and something is still filling it; an account is writing in a loop; you
are about to restore the database or run operator SQL that must not race with writes; an incident needs the data frozen
while you look.

**Abuse runbook.** Work from the cheapest step; each one is reversible except the last.

1. _See what is happening_ (read-only SQL, `npx wrangler d1 execute rca --remote --command "..."`):
   - Size and the heaviest accounts: `SELECT id, email, activity_count, digest_bytes, file_bytes, created_at FROM users ORDER BY digest_bytes + file_bytes DESC LIMIT 10`.
   - Recent sign-ups: `SELECT id, email, created_at FROM users ORDER BY created_at DESC LIMIT 20`. Sign-up is closed to
     anyone not on `ALLOWED_EMAILS` (see Sign-up list), so a new row that is not a friend means the list is wrong or the
     Worker rolled back to one that ignores it.
   - The R2 ledger and the day's counts: `SELECT * FROM r2_storage_budget`, and `SELECT action, SUM(used) FROM daily_budget WHERE day = date('now') GROUP BY action`.
   - Refusals in Workers Logs: `storage_budget_refused` (R2 ledger), `rate_limited` and `database_full`.
2. _Freeze writes_: turn the switch on (above). Nothing else is needed to stop the growth.
3. _Close the door_: take the address off `ALLOWED_EMAILS` (`wrangler secret put ALLOWED_EMAILS` with the list that remains)
   so it cannot create another account, and end the account's sessions: `DELETE FROM sessions WHERE user_id = '<id>'`.
   **The list does not stop an account that exists**: it signs in whatever the secret holds, so once the switch is off it
   is back. Only deleting the account (step 5) keeps it out. Nothing of theirs is lost yet.
4. _Cap the damage_: one account's digests are bounded (64 MiB, 5,000 activities), its originals (1 GiB), and a digest's free
   text by the byte caps in `apps/api/LIMITS.md`. A single account cannot fill the guard; several can, which is why step 3
   comes before step 5.
5. _Remove_: `DELETE FROM users WHERE id = '<id>'` in D1 (the rows cascade; see Sign-up list for what a SQL delete skips).
   **`DELETE /api/me` is a write, so the switch refuses it with 503 `read_only`**: use the SQL, or turn the switch off first
   and delete from the account's session. Do this last: it is not reversible.
6. _Recover room_: the database guard lifts by itself as rows go. The lifetime R2 ledger is never refunded; see "Operator
   reset" in `apps/api/LIMITS.md` before touching it.
7. _Turn the switch off_ once the cause is gone, and write down what happened.

## Limits

Service limits (per-account quotas, byte caps, edge rate limits and the application-wide R2
budgets) are listed in [apps/api/LIMITS.md](../apps/api/LIMITS.md). This document describes how
they behave in production; the limits page is the reference for values.

**Moving to Workers Paid.** The database guard stays at the Free figure (450 MiB) until the owner sets
the plain Worker variable `DATABASE_SOFT_LIMIT_MIB` in `apps/api/wrangler.toml` under `[vars]`, through a
reviewed commit, for example `"9000"` for D1 Paid's 10 GB. The other capacity limits are separate and are
listed in LIMITS.md. A value outside 64 to 9216 is ignored.

## Request isolation and limits

Current browser requests carry `X-RCA-User` for the account that initiated the operation. The API
compares it with the session user and returns `409 account_changed` on a mismatch. This matters
because session cookies are shared across tabs and can change while an import is queued. Changing
accounts also terminates the old browser worker. Compatibility clients may omit the header; it is
an intent binding, not a replacement for session authentication or owner-scoped database queries.

Cloudflare rate-limit bindings apply outside local development:

| Binding               | Threshold per minute | Key                                        |
| --------------------- | -------------------: | ------------------------------------------ |
| `API_RATE_LIMITER`    |                1,200 | Cloudflare-supplied client address         |
| `AUTH_RATE_LIMITER`   |                   30 | Client address, OAuth/sign-in routes       |
| `WRITE_RATE_LIMITER`  |                  600 | Authenticated user id, account data writes |
| `HEALTH_RATE_LIMITER` |                    1 | Client address, `GET /api/health/deep`     |

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
Per-user UTC daily budgets allow 5,000 new activities (the library limit) and 2,000 original-file uploads,
with separate budgets of 100 library listings (`GET /api/activities`; `GET /api/me` is not
charged), 50 profile writes, 50 activity deletes and 50 file downloads. Contract constants and detailed behavior are listed in
[LIMITS.md](../apps/api/LIMITS.md).

Application-wide R2 admission limits are separate from per-account quotas. In the deployed runtime,
all users share a 4 GiB lifetime PUT-charge cap, a 2 GiB monthly PUT-charge budget, and a
monthly operation budget. Ordinary R2 traffic stops at 90,000 operations a month
(`MAX_GLOBAL_R2_STANDARD_OPERATIONS`, `storage.ts`); 100,000 is the hard cap, which keeps 10,000 for
cleanup. Each PUT
attempt reserves `max(actual body bytes, 64 KiB)` and one operation atomically before calling R2.
Failed attempts and retries keep their charges in both byte counters. The monthly byte and operation
counters reset at the next UTC month; `lifetime_put_bytes` never resets or refunds, and blocks further
PUTs at 4 GiB even across months or accounts. Reads and cleanup remain available subject to their
operation budgets. The lifetime cap conservatively bounds cumulative app-mediated original writes;
a monthly write cap alone would allow retained storage to grow over successive months.
The migration initializes the byte ledger from the sum of recorded activity file sizes. This
includes rows that may only be reservations for failed older uploads, but it cannot reconstruct
repeated historical retries or identify untracked R2 objects that predate the ledger; the starting
ledger may undercount prior monthly PUT charges and existing objects. Deep-health `HEAD` probes use
a separate global budget of 300 per UTC day and 9,300 per UTC month, in addition to a one-per-minute
per-address limiter. Ordinary puts and gets stop at 90,000 monthly operations. Cleanup LIST calls
reserve their operations against the 100,000 hard cap, which keeps 10,000 for them. Deletes and
aborts do not consume operations. Exhausted capacity returns `429 storage_budget_exhausted`; cleanup
refuses before changing D1 state if its reserved list headroom is exhausted. These values describe
the deployed runtime. The limits cover
calls through this Worker only. Keep `rca-files` private and dedicated: direct bucket/API access,
other clients and dashboard operations can bypass application limits, and Cloudflare may bill R2
usage above its free allowance.

Activity listing uses at most 90 records per page, a 512 KiB digest JSON budget and envelope headroom
of 2,022 bytes a record at the worst case (`MAX_PAGE_BODY_BYTES`, 707,862 bytes in all). The API
scans small metadata before fetching the selected digests. Cursors are based on delivered rows so
byte-limited pages do not skip activities. Browser readers bound JSON/download sizes and network
time, reject malformed/repeated cursors, and retry a write only where repeating it is safe. A create
is deduped by its key on the server, and the create a rebuild makes to replace a stored digest names
that activity by its id and updates it in place. Either can be sent again without a second row, so
each is sent once more after a lost connection or a 5xx with no Retry-After, unless the refusal is
`database_full`. Every other write is sent once. An import that gets a 429 waits for its Retry-After
and saves that activity once more. Metadata requests have a 15-second deadline; original-file
transfers have two minutes, including body consumption. The activity table renders at most 20
activities at a time with accessible paging.

## Browser and data recovery

- Stop analysis terminates queued work. Saved activities are reloaded for a signed-in user, and the
  results kept in the browser are reloaded for a visitor who is not signed in; files that were being
  added must be added again. The notice makes that loss of local progress explicit.
- A visitor who is not signed in keeps their activity digests in the browser's IndexedDB, never on the
  server. Server backups and restores do not hold them, and clearing the site's data removes them.
- A failed worker restarts once automatically. Repeated startup failures require manual restart,
  preventing an endless resource-consuming loop.
- Failed saves remain locally analyzable and are counted. Re-importing the original retries them.
  A full library, the daily save limit or a rate limit that holds after one retry stops the import's
  saves; the remaining files are still analysed and are counted as waiting.
  A digest saved without a requested original is a partial failure. Originals above 50 MiB require
  turning off file retention before retrying; they can still be analysed locally within import limits.
- Digest schema version and model revision are separate. The current model revision is
  `MODEL_REVISION` in `packages/core/src/digest/modelRevision.ts`. Revision 3 contains the corrected
  sensor validity/timer handling and preserves long run efforts across short unpaused stops.
  Revision 4 uses altitude-dependent air density. Revision 5 adds the running level correction
  (+0.3 J/kg/m) and widens the efficiency and running-economy priors.
  Revision 6 changes what a digest holds, relative to release 28889c4: (0,0) GPS placeholders are
  ignored, so a trainer file with only those is indoor; the grade is taken over the distance the speed
  stream implies, with the stream-agreement filter (the lower of speed and recorded distance where they
  disagree), the `stream-disagreement` and `implausible-climb` flags, and the filter applied to distance
  bests, power-meter rides and splits; optional distributions, durability and drift evidence; best
  windows need at least 90% of their seconds moving, a sustained speed above a per-sport ceiling is
  flagged `implausible-speed`, and a distance best up to 1% short of a record distance is scaled to it;
  splits are over moving time less rests; a first session whose device distance starts far from zero
  counts from its own first sample; altitude outside -1000 to 10,000 m is dropped on import;
  the activity page's time in zones leaves out the seconds the quality assessment flagged, as the sport
  page does; `walkingPace` marks a run at walking pace; and the
  `hr-implausible-for-power` flag compares a stretch with the same activity's heart rate at similar
  power instead of a fixed floor. (The whole-activity check against the library is applied when the
  library is judged, not stored in the digest.) Missing revision means
  legacy revision 1. Older analyses are excluded and can be rebuilt from retained original files;
  missing originals need re-importing. Newer revisions are excluded with a separate compatibility
  notice, so rolling the Worker back to a revision 5 build makes every library already upgraded to
  revision 6 show as incompatible until the revision 6 Worker is deployed again.
- The digest's `race` field is additive and belongs to no revision. It is `true` only when the Strava
  export's Competition column tagged the activity at the moment it was imported, and the library list
  carries it too. The tag is in the export's list, not in the activity file, so it is read once, at
  import. Activities already in the library do not gain it, and importing the same export again keeps
  the held digest, so it does not add it either; they gain it only by being deleted and imported
  again. A rebuild of a stale digest keeps the tag its saved digest has (`originalActivity.ts`), and a
  digest without the field has no tag. A server that does not know the field drops it when it parses the
  digest (the schema strips unknown keys), so the digest it stores has no tag.
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

A rule in `_headers` applies by the path asked for, so a pattern such as `/assets/*` would also tell a
browser to cache the 404 page served for a missing `/assets/` file for a year. The year-long
`Cache-Control: public, max-age=31536000, immutable` is therefore written one rule for each emitted file
by the build (`apps/web/vite.config.ts`, `apps/web/scripts/assetHeaders.ts`), after the hand-written rules
in `apps/web/public/_headers`; a missing path matches none, and the Worker smoke test checks that its 404
carries no such header. A missing path is not answered with `index.html`: the web app uses hash routes and
`not_found_handling` is `404-page`, so it gets the built `404.html` with a 404 status. Cloudflare's docs say a
non-navigation request there still invokes the Worker, whose plain-text 404 for `/assets/` sends
`Cache-Control: no-store` (`apps/api/src/app.ts`). A `_headers` file holds at most 100 rules; the build
fails when the assets and the rules already in `public/_headers` together need more, or when `dist/assets` has a subfolder.

API responses include `X-Request-ID`. Unexpected-error logs contain that id and the exception
class; they do not include request bodies, query strings, original files, tokens, or raw database
error messages. (Cloudflare's own per-request invocation log is separate and does record the URL.) Use the id to correlate a reported failure with Worker logs. Do not enable verbose
request/body logging around personal activity files or OAuth callbacks.

## Observability

- **External uptime probe.** `.github/workflows/uptime.yml` probes from GitHub-hosted runners every 15
  minutes, independent of the Worker. It checks `/api/health`, `/api/health/deep`, the web app's `/`,
  and the Google sign-in redirect's `redirect_uri`. Each check gets one retry after 20 seconds. A
  failing run opens or updates an issue labelled `outage` and fails. A passing run closes open outage
  issues. Scheduled runs happen only when the repository variable `RCA_UPTIME_ENABLED` is `true`.
- **Skipped deep check.** Once the deployment's daily deep-health budget is spent, the API answers
  `/api/health/deep` with 200 and `"deep":"skipped"` rather than probing D1 and R2. The probe records this as
  a warning annotation (`Deep health skipped`) and neither opens nor closes an outage issue because of it.
  The run still passes or fails on the other checks. A skipped deep check leaves D1 and R2 unmeasured
  until the budget resets at 00:00 UTC, and anyone can spend that budget, so the probe opens one issue
  labelled `monitoring-gap` while the check is skipped and closes it when the check runs again. Treat
  that issue as a prompt to look at the Worker dashboard. A failing deep check (a 503) still opens an
  outage issue.
- **Probe origin.** The repository variable `PRODUCTION_ORIGIN` sets the origin the probe checks, with
  no trailing slash. When it is not set, the probe uses `https://rca-api.nutritioncoachapp.workers.dev`.
- **Testing the outage path.** Start the Uptime workflow by hand with `simulate_outage` set to `true`.
  The probe then targets `https://simulated-outage.invalid`, which does not resolve, so the run should
  fail and open an outage issue. Then start it by hand with `simulate_outage` set to `false`. If
  production is healthy, the probe passes and closes the open outage issues. The input has no effect on
  scheduled runs.
- **Limits of that probe.** GitHub may delay or skip scheduled runs under load. GitHub also disables
  scheduled workflows in public repositories after 60 days without repository activity, so an
  occasional commit or a manual run keeps it active. The probe sees only what a public client sees;
  it does not measure quota exhaustion before it causes failures.
- **Owner notifications.** Turn on GitHub notifications for failed workflow runs and for issues
  labelled `outage`, so a failed probe reaches the owner.
- **Access log.** The Worker writes one JSON line per API request, `event` `api_request`, with
  `method`, `route` (the route pattern such as `/api/activities/:id`, or `unmatched`), `status`,
  `duration_ms` and `request_id`, which is the `X-Request-ID` of the response. It holds no path, query,
  header, cookie, address, user id, email or body, and a method other than the standard verbs is
  logged as `OTHER`. To stay inside the Free plan's daily log cap it logs every response outside 2xx
  and every request over 1 s, and one 2xx response in ten, chosen by request id; so a count of 2xx
  lines is a tenth of the traffic. `duration_ms` is wall time on the Workers clock, which only
  advances at I/O. Filter Workers Logs on the event to see traffic by route and status, and use the
  request id to find the line for a failure a user reports. Cloudflare's own invocation log is separate
  and does carry each request's URL, query string included.
- **Worker and platform.** Worker logs and the Cloudflare dashboard show request and error counts
  and D1 and R2 usage. Check them when an outage issue opens, and before raising any limit.

## Live verification, historical (22 October 2026)

The live verification below was recorded for an earlier runtime version. Its commit and Worker
version identifiers are omitted, because this document does not track the live version. This section
preserves that earlier evidence. The release state section at the top describes the current
deployment.

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
  this does not establish compatibility with migrations or model revisions added since.

A $0.01 R2 billing alert was saved for the account owner. This is a notification, not a spending
cap. Application code budgets still cover only traffic through this Worker. Google Auth remains
External + Testing; only the owner's login was exercised. See [DEPLOY.md](DEPLOY.md) for Google's
basic-identity Testing exception and the separate public-brand requirements.

## Backup and restore

### Backup workflow source

`.github/workflows/backup.yml` runs a backup every day at 04:05 UTC, and it can be started by hand at
any time. Scheduled runs happen only when the repository variable `RCA_BACKUP_ENABLED` is `true`. A
run has these steps:

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

- **Original activity files in R2 (FIT, GPX or TCX).** These are not copied off Cloudflare. Users
  keep their own originals, and the owner should not promise that a stored original is recoverable.
  The manifest only records which objects existed, so an activity whose original is missing can be
  identified and re-imported.
- **A complete deletion log.** The application writes one `account_tombstones` row (random account id
  and time, nothing else) for each deleted account and keeps it 100 days. A backup holds only the
  tombstones that existed when it was taken, so a restore takes the live ones first and replays
  them with `scripts/ops/reconcile-restore.mjs`. Accounts deleted after the newest backup, with the
  live database also lost, cannot be reconciled from data.
- **Anything after the backup time.** Changes after the newest backup are lost.

A backup holds the whole D1 database: account identifiers, email addresses, session hashes and activity
summaries. It also holds the manifest of original-file objects. Each archive is kept as a GitHub
Actions artifact for 90 days and then deleted. Data deleted from the app can remain in backups until
those backups expire.

### Setting up backups (owner)

This section also covers the uptime probe. Complete the steps in order. Set the two enabling variables
last, because they start scheduled runs.

1. **Create the environments.** In **Settings**, then **Environments**, create `production`, with the
   owner as required reviewer and deployment branches limited to `main`. Create `backup`, with no
   reviewers, because scheduled runs cannot wait for approval, and deployment branches limited to
   `main`.
2. **Add the environment secrets.**
   - `production`: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, for the deploy workflow.
   - `backup`: `CLOUDFLARE_BACKUP_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `R2_BACKUP_ACCESS_KEY_ID` and
     `R2_BACKUP_SECRET_ACCESS_KEY`. The backup token is separate from the deploy token, with Account,
     D1, Edit, and Account Settings, Read. The R2 token needs Object Read on `rca-files`.
3. **Create the age key pair** on your own machine, never in CI, with `age-keygen -o backup-key.txt`.
   Copy the public key (the line starting `age1`) onto the placeholder line in
   `ops/backup-recipient.txt`, and commit it through a pull request. Check it with
   `node scripts/ops/check-backup-recipient.mjs ops/backup-recipient.txt`. Until a valid key is
   present, the backup workflow stops before exporting anything. Store `backup-key.txt`, which holds
   the private key, offline and separately. Never add it to the repository or to GitHub secrets. Without
   it, no backup can be decrypted.
4. **Set the probe origin** (optional). If the uptime probe should check an origin other than the
   default, set the repository variable `PRODUCTION_ORIGIN`, without a trailing slash.
5. **Enable.** Set the repository variables `RCA_BACKUP_ENABLED` and `RCA_UPTIME_ENABLED` to `true`.
   Do this last. Manual runs of either workflow are available at any time.

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
  The same goes for the Time Travel rewind in Part B of that runbook. Also test future
  schema/model rollback compatibility. The drills so far covered one synthetic activity, not
  maximum database size or disaster recovery of an active multi-user service.
- Before any client calls `PATCH /api/activities/labels`, run its tests (`activities.labels.test.ts`) against
  remote D1. The tests run on local D1 only, and the endpoint's batch relies on SQLite behaviour that
  remote D1 must be shown to share.
- Complete Google's public-brand requirements before representing the app as a verified public
  production brand. Continue checking Cloudflare usage/errors; code caps and alerts do not cap
  traffic from other bucket clients or account-level charges.
