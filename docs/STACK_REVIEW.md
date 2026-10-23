# Review of PRs 12–20

Reviewed 23 October 2026 against `00374fe`, with independent API, importer/model and web reviews.
The combined source before corrections was `d700a60`.

The importers, GPS filtering, FIT preference, altitude-density calculation, per-sport heart-rate
references, paged account export, image download and weekly trend passed review without a
reproducible blocking defect. The release gate passed 2,230 unit tests, 95 browser tests and two
Worker-served browser tests before the migration-journal correction below. This is synthetic and
fixture evidence; it does not establish accuracy on the owner's real devices or physiological data.

Two release issues needed attention:

- Migration 0005's journal timestamp preceded 0004. Drizzle could skip it when resuming a database
  that already had 0004. The timestamp now follows 0004, and a real incremental Drizzle migration
  test proves the upload-reservation column appears on resume. Wrangler production migrations use
  filenames, so production's migration runner was not affected by the timestamp.
- Migration 0004 backfills digest bytes before the new Worker deploys. Old Worker writes in that
  interval can leave the new quota counter inaccurate. The production runbook now specifies a
  post-deploy reconciliation after the new Worker serves all traffic. Production had zero saved
  activities at the preflight inspection; counters still need checking after rollout.
- The backup recipient preflight checked only key shape, so a checksum-invalid typo could pass and
  let the workflow export D1 before `age` rejected it. The workflow now asks `age` to encrypt empty
  input with the configured recipient before it exposes backup credentials or exports data. Backup
  automation remains disabled until the private key and scoped credentials are provisioned and a
  restore drill succeeds.

The research notes remain provisional. Several citations and assumptions are explicitly
unverified, and the proposed uncertainty widths were not validated through the full heart-rate
calibration. No running-drag correction, cycling-efficiency change or prior widening is approved by
merging those notes. The implemented altitude-density change remains separate.

Main's required CI checks and up-to-date rule remain enabled during the sequential squash merges.
The next stacked PR must be rebased onto the preceding squash commit and pass its new checks.
Production and backup environments restrict deployment branches to main; production requires the
owner's approval. Backups must remain disabled until a recoverable private age key, scoped service
credentials and a successful restore drill exist. No real device files are invented or substituted
for that validation.
