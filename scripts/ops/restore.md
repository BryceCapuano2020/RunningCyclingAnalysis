# Restoring a backup

This runbook restores the production D1 database from a scheduled backup
(`.github/workflows/backup.yml`) into a new database and a preview Worker, then verifies it.
Production is not touched until the owner decides to cut over (step 8).

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
foreign-key order, then indexes and triggers. If it refuses, stop and escalate: the backup is not
restorable by this procedure.

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

Before anyone can sign in to the restored database, delete every session the backup contains.
Some may have been revoked, or belong to accounts that signed out after the backup:

```bash
npm exec -w @rca/api -- wrangler d1 execute rca-restore-YYYYMMDD --remote \
  --command "DELETE FROM sessions;"
```

Accounts deleted after the backup time are still present in it. The application keeps no deletion
log, so the operator must keep a private record of account deletions (account identifier and time)
and delete those accounts from the restored database again before use. A restore must never bring
back an account that its owner deleted. Until such a record exists, do not use a backup older than
the most recent deletion without that reconciliation.

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
