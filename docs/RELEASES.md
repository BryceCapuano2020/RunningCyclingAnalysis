# Releases

Every production release is one line in the ledger below, written when the release is done. The
ledger is the record of what is live, what was applied to the database, and the oldest Worker that
can safely be rolled back to. [PRODUCTION.md](PRODUCTION.md) says how a release is gated and
verified; [DEPLOY.md](DEPLOY.md) covers setup.

## Ledger format

Newest first. One row per `deploy:built`, including a deploy that was rolled back.

| Column         | What it holds                                                                                                                                                                                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Date           | The day the Worker went live, in UTC, as `D Mon YYYY`.                                                                                                                                                                                                                                                                         |
| Main sha       | The commit on `main` that was built. New rows use 8 characters, which is what `/api/health` reports as `sha` and what `deploy:built` tags the Worker version with (the Deploy workflow tags with the full 40-character sha and reports the same first 8). Earlier rows keep the length they were recorded with: 28889c4 has 7. |
| Worker version | The version id Wrangler printed (`wrangler deployments list` shows it). Its first 8 characters are enough to find it again.                                                                                                                                                                                                    |
| Migrations     | The D1 migrations this release applied, by number, or `none`.                                                                                                                                                                                                                                                                  |
| Rollback floor | The oldest Worker version that is still safe to roll back to after this release. Rolling back to anything older breaks on the schema or the stored data it changed.                                                                                                                                                            |
| Notes          | What changed in kind, not in detail: a stage, a model revision, a one-way storage change.                                                                                                                                                                                                                                      |

A rollback floor only moves forward. It moves when a release applies a migration that older Workers
cannot read, changes what a stored digest holds, or makes a browser storage upgrade one-way.

The release that writes model revision 7 (R2) moves the floor to the Worker of the release before it (R1, which
reads revision 7 and writes none), so R1 is a separate deploy that goes first and must be live and in use before R2.
R1's row, added before R2 deploys, names that Worker's version id as its floor, so the floor `deploy:built` prints after
R2 is R1 and not `3e17b541`; R2's row records it too. A failed R2 smoke test is rolled back by hand with
`wrangler rollback <that id>`. `RCA_SAFE_ROLLBACK_VERSION` is moved to that id as well (PRODUCTION.md, the digest
paragraph, step 2), for the manual Deploy workflow, which is the only thing that reads it.
`RCA_SAFE_ROLLBACK_VERSION` (see PRODUCTION.md) must never name a version older than the latest
floor here. A rollback floor also does not protect the sign-up list: any Worker older than the release that
carries `ALLOWED_EMAILS` ignores it, so rolling back to one reopens public sign-up (see PRODUCTION.md, Sign-up
list).

## Releasing

1. Merge to `main`, then run the release gate in a clean worktree at the commit to ship
   (`npm run verify:release`). That builds the web app, and the build records the commit it was made
   from in `dist/build-info.json`. Deploy from that worktree: `deploy:built` refuses a dist whose
   commit is not HEAD, or that was built from a dirty tree, so a stale build cannot ship under a new
   tag.
2. Apply pending migrations: `npm run db:migrate:remote -w @rca/api`.
3. `npm run deploy:built -w @rca/api`. It refuses a dirty tree, a commit that is not on `origin/main`,
   and a HEAD that is behind the tip of `origin/main`; to deploy an older merged commit on purpose,
   add `-- --allow-older`. It then tags the Worker version with the 8-character commit id and a
   message naming the full commit, and builds the id into `/api/health`.
4. `deploy:built` now runs the smoke test itself right after the deploy, against `APP_URL`, expecting the
   commit it just tagged (`--no-smoke` skips it). On a failure it exits 1, prints the failures and the
   rollback floor from this ledger, and rolls nothing back: whether to roll back is the owner's call, because a
   migration may make older Workers unsafe. To run the same check again: `npm run smoke:prod -- --expect-sha <short sha>`. It sends only GET requests, no mutating ones, to the live
   origin (health, an unknown path's 404, the app shell and its Content-Security-Policy header, and
   the sign-in redirect) and fails if `/api/health` reports a different build. Without `--expect-sha` a Worker that reports no
   build id (one from before the id, as after a rollback) passes with a warning. The deep health check is
   limited to one call a minute, so its single retry waits 61 s.
5. Add the row below in a pull request, with the version id from step 3.

## Ledger

| Date        | Main sha | Worker version | Migrations   | Rollback floor    | Notes                                                                                                                                                                                                                                |
| ----------- | -------- | -------------- | ------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 30 Oct 2026 | 40b3a4be | 96043823       | none         | 3e17b541          | Stage C fitness at the same heart rate (run card above Balance, Run page, evidence, sample slip), reference max heart rate from three days, zones from current fitness, one body-weight rule. No contract, digest or storage change. |
| 29 Oct 2026 | 54e897a6 | 9fdb7f91       | none         | 3e17b541          | Single-line Balance hero, sync fixes, zone edges and interval detector, Garmin import, parser hardening, findings engine (off). Adds an optional `race` digest field; an older Worker strips it.                                     |
| 29 Oct 2026 | 89a82201 | c9d9cb9b       | none         | 3e17b541          | Stage B: chart system, Balance level scale, Activity page charts, Run and Ride redesign, first impression. No digest or storage change.                                                                                              |
| 28 Oct 2026 | bd8aaf7a | 3e17b541       | 0009         | 3e17b541          | Stage A, model revision 6. Older Workers cannot parse revision-6 digests, and the browser recording cache upgrade (v3) is one-way.                                                                                                   |
| 27 Oct 2026 | 28889c4  | 5c3b50c5       | not recorded | at least 94c32a59 | Features wave: race predictor, custom period, grade by duration. The date is approximate and the migrations were not written down; the floor is no lower than the 26 Oct one.                                                        |
| 26 Oct 2026 | 8dd5f0b  | 7da17d77       | 0008         | 94c32a59          | Adds `users.file_bytes` with triggers and a backfill.                                                                                                                                                                                |
| 26 Oct 2026 | f7b210d  | 9bf11840       | none         | 94c32a59          |                                                                                                                                                                                                                                      |
| 26 Oct 2026 | 9b0bdb9  | 94c32a59       | 0007         | 94c32a59          | First version with migration 0007, a nullable profile mass.                                                                                                                                                                          |

Where a cell says `not recorded`, fill it from `wrangler deployments list` or the release pull
request, never from memory.
