# Restoring a backup

This runbook has two parts. Part A restores the production D1 database from a scheduled backup
(`.github/workflows/backup.yml`) into a new database and a preview Worker, then verifies it.
Production is not touched until the owner decides to cut over (step 8). Part B, at the end, rewinds
the live database in place with D1 Time Travel, which is the faster path for a bad deploy or a
mistaken write and the only path for a database above the 64 MiB limit of Part A.

Both parts end with the same reconciliation: accounts deleted after the point you restore to come
back with the copy, so they are deleted again before anyone signs in
(`scripts/ops/reconcile-restore.mjs`).

**Neither part has been rehearsed.** Run Part B on a scratch database and Part A on the newest backup,
record the times, and only then trust either. A drill that is not recorded does not count.

## Targets and limits

- **RPO: 24 hours** for account, profile and activity-summary data. Backups run daily at 04:05 UTC,
  so the newest usable backup can be up to a day old. Changes made after it are lost.
- **RTO: 2 hours** from the decision to restore to a verified preview Worker. Cutover is extra.
- **Original FIT files in R2 are not backed up.** Users keep their own originals. The manifest
  records which objects existed, so the operator can tell which activities had stored originals and
  whose originals are now missing. Those activities need re-importing from the owner's device.
- The backup keeps 90 days of archives. Older archives are gone.

## What you need before starting

- The **private** age identity file (`backup-key.txt`) from the offline store. It is never in
  GitHub or in this repository.
- The backup artifact, `rca-backup-<run-id>`. Download it with the GitHub CLI into a private
  directory, for example `gh run download <run-id> -n rca-backup-<run-id> -D "$WORK/download"`.
- A Cloudflare API token with D1 and Workers Scripts edit permission on the account, held by the
  operator. Do not reuse the backup token.
- Node 22.17 or later, and `npm ci` run in the repository root.
- `age` installed on the restoring machine.

Use a private temporary directory for everything below. Keep `umask 077`.

```bash
umask 077
WORK="$(mktemp -d "${TMPDIR:-/tmp}/rca-restore.XXXXXX")"
```

## 1. Decrypt and check the archive

```bash
age -d -i /secure/path/backup-key.txt -o "$WORK/backup.tar.gz" "$WORK"/download/rca-backup-*.tar.gz.age
tar -xzf "$WORK/backup.tar.gz" -C "$WORK"          # database.sql and manifest.json
shasum -a 256 "$WORK/database.sql"                 # macOS; use sha256sum on Linux
jq -r '.d1.sha256' "$WORK/manifest.json"
```

The two SHA-256 values must match. Also note `.commit` and `.createdAt` in the manifest. They say
which commit took the backup and when.

## 2. Prepare the restore SQL

```bash
node apps/api/scripts/prepare-d1-restore.mjs "$WORK/database.sql" "$WORK/restore.sql"
```

The helper refuses exports that contain unknown tables, fail `PRAGMA integrity_check` or
`foreign_key_check`, or exceed 64 MiB. Its output creates the schema first, then the rows in
foreign-key order, then indexes and triggers. It holds the triggers back while it loads the export,
so none runs over a stored row. If it refuses, stop and escalate: the backup is not restorable by
this procedure.

## 3. Create a new database, never `rca`

```bash
npm exec -w @rca/api -- wrangler d1 create rca-restore-$(date -u +%Y%m%d)
```

Record the printed `database_id`. Do not import into the production database named `rca`.

## 4. Import and check the migration state

```bash
npm exec -w @rca/api -- wrangler d1 execute rca-restore-YYYYMMDD --remote --file "$WORK/restore.sql"
npm exec -w @rca/api -- wrangler d1 migrations list rca-restore-YYYYMMDD --remote
```

`migrations list` must show no pending migrations for the code you will deploy. If it shows
pending ones, they are applied forward, never by rewriting history:

```bash
npm exec -w @rca/api -- wrangler d1 migrations apply rca-restore-YYYYMMDD --remote
```

## 5. Remove sessions and reconcile deletions

Before anyone can sign in to the restored database, delete every session the backup contains and
delete again every account that was deleted after the backup. The application writes one row to
`account_tombstones` (account id and time, nothing else) for each deletion and keeps it for 100
days, longer than the 90-day backups. The restored copy has only the tombstones that existed when
the backup was taken, so take the current ones from the live database. Do this before any cutover:

```bash
npm exec -w @rca/api -- wrangler d1 execute rca --remote --json \
  --command "SELECT user_id, deleted_at FROM account_tombstones ORDER BY deleted_at" > "$WORK/tombstones.json"
node scripts/ops/reconcile-restore.mjs "$WORK/tombstones.json" "$WORK/reconcile.sql"
npm exec -w @rca/api -- wrangler d1 execute rca-restore-YYYYMMDD --remote --file "$WORK/reconcile.sql"
```

The script validates every id and time before writing SQL. The SQL inserts the tombstones into the
restored database, finishes the deletion of accounts the backup shows as mid-deletion, deletes every
account that has a tombstone (the delete cascades to its rows), and deletes all sessions. It can be
run again safely. The restored database needs migration `0011` (the tombstone table) first; step 4
applies pending migrations. Check the result:

```bash
npm exec -w @rca/api -- wrangler d1 execute rca-restore-YYYYMMDD --remote \
  --command "SELECT (SELECT COUNT(*) FROM users WHERE id IN (SELECT user_id FROM account_tombstones)) AS resurrected, (SELECT COUNT(*) FROM sessions) AS sessions;"
```

Both numbers must be 0. Tombstones older than 100 days are removed, so a backup older than that
can bring back an account that nothing records any more; do not use one without asking the
owner. If the live database is lost as well, the tombstones are only as new as the newest backup,
and the accounts deleted since then cannot be reconciled from data. List them from support requests
or the privacy contact log and delete them by hand.

## 6. Verify row counts and sample digests

Compare the counts with the manifest's `d1.rows`:

```bash
jq -r '.d1.rows | to_entries[] | "\(.key) \(.value)"' "$WORK/manifest.json"
for table in activities oauth_accounts profiles r2_storage_budget users d1_migrations; do
  npm exec -w @rca/api -- wrangler d1 execute rca-restore-YYYYMMDD --remote \
    --command "SELECT '$table' AS table_name, COUNT(*) AS n FROM $table;"
done
```

`sessions` is expected to be 0 after step 5. Run the integrity and foreign-key checks, then sample
digests:

```bash
npm exec -w @rca/api -- wrangler d1 execute rca-restore-YYYYMMDD --remote \
  --command "PRAGMA foreign_key_check;"
npm exec -w @rca/api -- wrangler d1 execute rca-restore-YYYYMMDD --remote \
  --command "SELECT id, sport, name, json_valid(digest_json) AS valid, json_extract(digest_json, '$.modelRevision') AS revision FROM activities ORDER BY random() LIMIT 5;"
```

Every sampled digest must be valid JSON. The revision shows which analysis model produced it.

Compare one activity's `file_hash` with the SHA-256 of the owner's original file for it, if the
owner still has that file.

Triggers keep each user's `file_bytes` equal to the sum of their `file_size`. The restore creates
them after the rows, but check the counter anyway. This query must return no rows:

```bash
npm exec -w @rca/api -- wrangler d1 execute rca-restore-YYYYMMDD --remote \
  --command "SELECT id FROM users WHERE file_bytes <> (SELECT coalesce(sum(file_size), 0) FROM activities WHERE user_id = users.id);"
```

If it lists accounts, set every counter from the rows with one statement:

```bash
npm exec -w @rca/api -- wrangler d1 execute rca-restore-YYYYMMDD --remote \
  --command "UPDATE users SET file_bytes = (SELECT coalesce(sum(file_size), 0) FROM activities WHERE activities.user_id = users.id);"
```

For the R2 side, list the keys that existed and check them against the `file_key` values in the
restored `activities` table. Keys in the manifest but missing from the bucket cannot be restored
from this backup. Keys referenced by `activities` but absent from the manifest did not exist at
backup time:

```bash
jq -r '.r2.objects[].key' "$WORK/manifest.json" | sort > "$WORK/r2-keys-at-backup.txt"
```

## 7. Deploy a preview Worker against the restored database

Write a restore configuration outside the repository, in `$WORK`. Copy `apps/api/wrangler.toml`
and make these changes:

- `name` to `rca-api-restore`, so production is not overwritten.
- `database_id` in the `DB` binding to the id from step 3.
- `bucket_name` in the `FILES` binding to a new, empty scratch bucket, for example
  `rca-files-restore-YYYYMMDD`. Create it before the Worker:

  ```bash
  npm exec -w @rca/api -- wrangler r2 bucket create rca-files-restore-YYYYMMDD
  ```

  Never bind the preview to `rca-files`. The restored database may not reference every current
  production object, and the Worker's scheduled orphan cleanup could permanently delete those
  production files. The scratch bucket must be empty because the restore only backs up the list of
  R2 objects, not their bytes.

- `APP_URL` to the preview's own `https://rca-api-restore.<subdomain>.workers.dev`. Google sign-in
  will not work there because the redirect URI is not registered. Verify with the database checks
  above and with the Worker's public endpoints.
- Remove the `[triggers]` section so the preview does not run scheduled maintenance during the
  drill. The preview's R2 binding remains isolated even with its cron disabled.
- `[assets] directory` and `main` to absolute paths in this repository, so the built app and entry
  point resolve from `$WORK`.

Then deploy the preview. It has no production secrets:

```bash
npm exec -w @rca/api -- wrangler deploy --config "$WORK/wrangler.restore.toml"
curl -si https://rca-api-restore.<subdomain>.workers.dev/api/health
```

Expect `200` and `{"status":"ok"}`. `/api/me` must return `200` with a `null` body.

## 8. Cutover (owner decision only)

Cutover points production at the restored database. Writes between the backup time and cutover are
lost. The Worker cannot pause writes by itself, so decide first whether to deploy a maintenance
build. When you cut over:

1. Change `database_id` in `apps/api/wrangler.toml` to the restored id, through a reviewed commit.
2. Deploy through the Deploy workflow, so the release gate and smoke test run.
3. Keep the old database until the owner confirms the restore.

## 9. Clean up

Delete the preview Worker and the scratch database once the drill or incident is closed:

```bash
npm exec -w @rca/api -- wrangler delete rca-api-restore
npm exec -w @rca/api -- wrangler d1 delete rca-restore-YYYYMMDD
npm exec -w @rca/api -- wrangler r2 bucket delete rca-files-restore-YYYYMMDD
rm -rf "$WORK"
```

Record the drill: the backup run used, the start and finish times (to check the 2-hour RTO), the
counts compared, and any missing originals.

## Drill schedule

Run this procedure quarterly against the newest backup, using steps 1 to 7 only. A drill that is
not recorded does not count. The first drill is the evidence that this runbook works; until it is
done, treat the restore as unverified.

## Part B. Rewind the live database with Time Travel

D1 Time Travel keeps point-in-time history for the database (30 days on the Workers Paid plan,
7 days on Free) and restores it in place. Use it when a bad deploy or a mistaken write damaged data
and the damage is newer than the history. It also restores deleted data: an account deleted
inside the window is in the history, which is why the privacy page says deleted data can remain for
up to 30 days, and why step B3 matters.

Time Travel rewinds the whole database, including `account_tombstones`, and also the budget
ledger. Rewinding the R2 write ledger would reopen capacity the bucket has already used (see
"Never rewind the global R2 budget ledger" in `docs/PRODUCTION.md`); step B4 copies the live
ledger forward.

1. **Pick the moment.** Find the last good time from the access log or the release ledger. Look up its
   bookmark and also note the current one, which is the way back if the rewind was a mistake:

   ```bash
   npm exec -w @rca/api -- wrangler d1 time-travel info rca
   npm exec -w @rca/api -- wrangler d1 time-travel info rca --timestamp "<RFC 3339 time>"
   ```

   Check the flags with `wrangler d1 time-travel --help` first; they have changed between Wrangler
   versions. Write both bookmarks into the incident notes.

2. **Stop writes if you can.** Deploy the previous Worker (`wrangler rollback`, to a version at or
   above the rollback floor in `docs/RELEASES.md`) so people are not writing while you rewind.
   Anything written after the chosen time is lost.

3. **Save what a rewind would erase, before it runs.** Export the tombstones, and the live R2
   ledger row, into a private directory (`umask 077`):

   ```bash
   npm exec -w @rca/api -- wrangler d1 execute rca --remote --json \
     --command "SELECT user_id, deleted_at FROM account_tombstones ORDER BY deleted_at" > "$WORK/tombstones.json"
   npm exec -w @rca/api -- wrangler d1 execute rca --remote --json \
     --command "SELECT * FROM r2_storage_budget" > "$WORK/r2-budget-live.json"
   ```

4. **Restore**, with the bookmark from step 1:

   ```bash
   npm exec -w @rca/api -- wrangler d1 time-travel restore rca --bookmark "<bookmark>"
   ```

   Wrangler prints the bookmark of the state just before the rewind. Add it to the incident notes.
   Then set the R2 ledger counters back to the larger of the live row and the restored one
   (`lifetime_put_bytes` and the monthly counters), by hand, from `r2-budget-live.json`. If you
   cannot establish the post-rewind usage, treat file capacity as exhausted until the owner has
   reviewed it.

5. **Reconcile deletions**, exactly as in step 5 of Part A, against `rca` instead of the scratch
   database: build `reconcile.sql` from `$WORK/tombstones.json` and run it. If the rewind went to a
   point before migration `0011`, apply the migrations first (`npm run db:migrate:remote -w
@rca/api`), because the script writes to `account_tombstones`.

6. **Verify** with steps 6 (row counts, digests, file bytes) of Part A, pointing at `rca`. Then run
   `npm run smoke:prod -- --expect-sha <sha of the deployed Worker>` and sign in with a test
   account.

7. **Undo a mistaken rewind** by restoring the bookmark recorded in step 4, then repeat step 5.

Rehearse this on a scratch database created for the purpose (`wrangler d1 create rca-scratch`),
with synthetic rows only, so the first real use is not the first run. Record the drill the same way
as in Part A.
