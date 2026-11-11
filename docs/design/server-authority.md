# Server authority: one source of results for accounts

Status: decided by the owner on 10 Nov 2026 ("you can delete the in browser computation in favor of the server").
Written 10 Nov 2026 against main 114e4de5. Acts on finding H2 of the architecture review of the same day, and on L3
(lifts in the snapshot). Builds on [server-compute.md](server-compute.md), which this note amends.

## Why

The app has two analysis authorities for a signed-in account. The browser loads every digest from
`GET /api/activities` and runs `AnalysisSession.loadDigests` in its worker. The server runs the same code in a queue
consumer and serves `GET /api/state`. The page picks between them in `ui/analysis/deviceCopy.ts` and `serverCopy.ts`,
with an unsent-work rule that hands authority back to the browser while anything is unsaved. Each new input (Garmin,
the connector, lifts) would have to be wired into both. Server compute is live for the owner's account, so the server
path is the one that has run in production.

## Decision

1. **The server owns an account's results.** For a signed-in account, every figure the app shows comes from
   `GET /api/state`. The browser builds no analysis state for an account: no `loadDigests`, `setSettings`, `setRange`
   or any other request that builds a `SessionState` in account scope.
2. **The device copy is a cache of `/api/state`.** `rca-state` keeps the last server snapshot per account, painted at
   once on open and replaced when the server answers with a different ETag. The browser never writes a snapshot it
   computed itself for an account.
3. **The browser keeps an activity index for accounts.** Listing an account's records is not analysis, and many flows
   need it: the import's skip and duplicate check (`session.heldNameOf`, `worker/skipAllowance.ts`), the Library list
   (`libraryReport.ts`), delete groups, rename, export's hidden copies, the adoption plan, trace originals, the
   outbox's hidden ids and the updater's "Update now" count. Phase 1 keeps `loadServer` listing `/api/activities` into
   `savedRecords` and the core library, and stops it building state. Run splits on the activity page are read from
   the index's digest of that activity.
4. **Signed-out use and the sample athlete keep the browser path.** Files are parsed and analysed on the device and
   nothing leaves it. That is the privacy promise for signed-out use, and a server path for anonymous use would need
   an upload before sign-in, which the privacy page rules out. So the browser keeps `packages/core` for parsing every
   file and for signed-out analysis; only the account branches go.
5. **No fallback.** No account's results come from the browser: not for size, not for unsent work, not for an old
   tab. One case is not an account result: files dropped before `/api/me` answers are analysed on the device as today
   (`keepProvisional`), and are saved and dropped from local state once the account is known.

## How each account flow works after this

| Flow                                                              | Today (account)                                       | After                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Open the app                                                      | Device copy, then server copy or a local compute      | Device copy, then `/api/state` (304, a newer snapshot, or computing)                                                                                                                                                                       |
| Import while signed in                                            | Saved and loaded into the local session at once       | Checked against the index, saved (outbox on failure), then `/api/state`. A waiting save is in results once saved, and the import copy says so                                                                                              |
| Pick a period or a custom range                                   | `setRange` in the worker                              | The choice is saved to the account as today (it dirties the snapshot), then `/api/state` computes on read                                                                                                                                  |
| Change mass, dated settings, birth year, counted runs, kept power | `setSettings` in the worker                           | The write as today, then `/api/state`                                                                                                                                                                                                      |
| Delete, rename, label                                             | API call, then reload every digest and recompute      | API call, index updated, then `/api/state`                                                                                                                                                                                                 |
| Lift corner, Lift page grades and charts                          | `buildLiftState` over `rca-lifts` in the page         | `lift` in the snapshot for both (L3). `rca-lifts` stays the logger's store of rows; it feeds no grade                                                                                                                                      |
| "Since your last import" check-in                                 | `checkInSnapshotOf(digests, state)` in the worker     | The snapshot carries the current `CheckInSnapshot`. The baseline stays per device in `rca-checkin`, taken from a fresh `/api/state` before the import starts (on a 202, from the device copy; with neither, that import shows no check-in) |
| Another tab, device or Garmin changed it                          | Polls `/api/me` every 30 s, then reloads every digest | `/api/state` with its ETag on `rca-sync-v1` messages, on visibility change and every 60 s while visible                                                                                                                                    |
| Workbench, route shape, traces, export                            | Trace cache or the original; export lists records     | Unchanged                                                                                                                                                                                                                                  |
| Snapshot of another build                                         | Computes locally                                      | The Worker serves its own build, so the tab is old: reload once (guarded), keep the copy                                                                                                                                                   |

## Compute on read

`GET /api/state` serves the stored snapshot when it is current, and otherwise computes in the request, stores the
result and serves it. This gives read-your-writes after an import or a settings change, recomputes after an
analysis-revision bump (server-compute.md section 8), and refreshes a snapshot that aged past its local day (most of
S6) for every account that opens the app. The queue stays: it computes after writes made with no tab open, so an open
is usually a 304. Whether the queue, pending markers and re-send can go is measured after the build.

**Current** means all of:

- `state_jobs.snapshot_version >= users.library_version`;
- `state_jobs.snapshot_lift_revision >= users.lift_revision` (new column; lift writes already raise `lift_revision`).
  These are what the stored snapshot covers, not what a compute reached: an unchanged compute moves the coverage
  only while the row still holds the hash it matched;
- `state_jobs.analysis_revision = RESULT_REVISION` (`apps/api/src/state/resultRevision.ts`): one integer for the tuple
  (analysis revision, snapshot schema version, lift estimator revision) in that order, each part below 1,000. The column
  kept its name and held the analysis revision alone before, so every earlier row reads as lower. The R2 object's custom
  metadata names it as `resultRevision`;
- the local day of `state_jobs.snapshot_now_ms` (new column) in the account's zone is today.

**Revisions.** The revision here and below is the result revision. A Worker recomputes and stores only when the stored revision is lower than its own. When the stored
revision is higher (a rollback, an old Worker during a gradual deploy), it computes in the request and serves the result
without storing it, so the newer snapshot stays for the newer Worker and an old tab still gets results it can read. The
isolate keeps that unstored result, keyed by account, version, lift revision and local day, and answers its ETag with a
304, so a rollback costs one compute per account per isolate rather than one per read. A consumer that finds a higher
stored revision acks without computing. The
object-metadata check in `routes/state.ts` resets the row's revision only when the object's is lower than the
Worker's own, never when it is higher.

**Ordering.** `record()` (`state/job.ts`) today moves the snapshot only for a higher version or a different revision,
so a same-version recompute on a new day is refused. It becomes an order on (revision, version, lift revision, now),
and it runs on both paths: a new hash moves the hash and the order columns; an unchanged hash moves the order columns
only. The content hash leaves out `nowMs`, so without the second path an idle account would recompute on every read. Once
the snapshot names the local day (`lift.today`), a day roll is a new hash, so the second path serves the same-day
recompute that moves no figure (a version bump, a setting flipped back).

```sql
UPDATE state_jobs SET snapshot_hash = coalesce(:hash, snapshot_hash), snapshot_version = :v,
  snapshot_lift_revision = :l, snapshot_now_ms = :now, analysis_revision = :rev
WHERE user_id = :id AND (analysis_revision < :rev OR (analysis_revision = :rev AND
  (snapshot_version, snapshot_lift_revision, snapshot_now_ms) < (:v, :l, :now)))
```

On the unchanged path the statement adds `AND snapshot_hash = :matched`, the hash the job found equal, so it never
stamps today's day on a hash another job stored meanwhile. It is an UPDATE only: `markAttempt` inserts the row before any compute. `computed_version` and
`computed_at` keep their own monotone updates (for coalescing and `X-State-Computed-Version`). The migration adds
`snapshot_lift_revision` and `snapshot_now_ms`, backfilled to 0, so each account computes once on its first open;
nothing is enqueued for it. Every answer carries `X-State-Now` (the stored `snapshot_now_ms`), a 304 included, and the
browser writes it into the stored copy's `nowMs` in `rca-state` (`copyAge.ts` reads it from there), so an unchanged
recompute does not leave the copy marked stale after a reload.

**Consistent inputs.** `readInputs` (`state/inputs.ts`) reads `library_version` and `lift_revision` with the first
batch, and re-checks both at the end. A write to either during the read is `InputsMoved`, as a library write is today, so a
job never records a lift revision it did not read at the same version. It reads no lift sets until a slice takes
them into a figure; that slice reads them in the first batch, where the revision is read.

**One compute per isolate.** A module-level lock covers both the route and the queue consumer, since
`max_concurrency = 1` limits consumers, not isolates. A request that finds the lock taken serves the stored snapshot
with `X-State-Current: 0`, or, when the account has none (a new account, after a revision bump), answers
`202 {"state":"computing"}` with `Retry-After: 2`. The page then shows the device copy or the loading state from
server-compute.md section 4, and asks again. A consumer that finds the lock taken retries the message with a delay of a
few seconds; it never acks it, so a write made with no tab open is still computed. A compute blocks its isolate's event
loop for its CPU time, under a second at 2,000 activities; the cap measurement below records it at the largest library.

**One compute per account.** Across isolates, a read that computes takes a claim first: one conditional upsert that sets
`state_jobs.claim_until` to now plus `STATE_CLAIM_SECONDS` (60 s) when none is held. A second read, in any isolate, and a
queued message that find it held serve what is stored (the message retries). The claim is held while the compute runs,
not after: when the compute finishes (written, unchanged or gone), or a read ends without one (a write landed twice, over budget), it frees the claim, only if the row still
holds its own stamp, so a read that follows an import computes at once instead of waiting out the window. The 60 s is
the bound on a compute that dies (one can run 15 to 31 s at the quotas). A compute in a read that throws keeps its unit charged and leaves its claim held: `claim_until` is moved to the instant of the failure, which is lapsed and not zero (a released claim is 0), and a read holds a claim like that for `STATE_FAILURE_HOLD_SECONDS` (5 minutes) after it lapsed. A compute that dies (a CPU-limit kill runs no catch) leaves the same mark, so it is held the same way. A failure that repeats is not recomputed by every tab's poll, and a user it fails for every time reaches the daily cap. The queue's job passes no hold: it retries a failure itself after `STATE_RETRY_SECONDS`, so a failure hold does not make its messages busy. A message that finds the account busy waits what is left of the claim (`claimWaitMs`), not five seconds at a time. A read that finds its claim lost when it stamps it again stops and serves what is stored. The queue's interval (`STATE_MIN_INTERVAL_SECONDS`, 30 s) is a
separate clock: it reads `attempted_at` and `computed_at`, which the claim still stamps and the release leaves alone,
so a burst of messages still coalesces. `claim_until` is a defaulted column in migration 0019.

**Read budget.** `stateRead` allows 300 reads a day and charges every read (`packages/contract/src/limits.ts`,
`routes/state.ts`). A 304, a 202 and a stored snapshot served under the lock are no longer charged; a compute in the
request is. The budget and what it charges are pinned in a test, sized so a tab polling every 60 s for a day with
retries stays inside it.

**Deletion.** The job re-reads `users.deleting_at` before the R2 put as well as at the start, since compute on read
widens the window in which a snapshot could be written after the account sweep.

M1 (server compute as a pure function of its inputs, with an interleaving test) lands first, since compute on read
runs computes for different accounts in one isolate.

## The activity cap

The server computes for every account, so its bound is the account limits, and no smaller one: `SERVER_STATE_MAX_ACTIVITIES`
and the `too_large` outcome are gone. Memory grows with digest bytes, not with activity count. The limits came down so the
largest account fits: `MAX_ACTIVITIES_PER_USER` 5,000 to 4,000 and `MAX_DIGEST_BYTES_PER_USER` 64 to 32 MiB, with
`MAX_LIFT_SETS_PER_USER` (60,000, the database's own check) in the same case.

- **Measured in workerd** (apps/api/LIMITS.md has the figures): the job on synthetic data at those limits, with the isolate's
  heap limited by `MINIFLARE_WORKERD_V8_FLAGS="--max-old-space-size=N"`, passes at 96 MB. CPU is 15.6 s there (the
  collector thrashing), about 31 s at the 2x allowance for Cloudflare's CPUs, so `limits.cpu_ms` is 60,000: about 2x over the
  thrash case. If 4,000 later fails CI, the cap goes to 3,000.
- **A test pins it.** The memory sim asserts the library it measured is the account limits (activities, lift sets and the byte quota), and `state/memoryCases.test.ts` pins that case to the contract's constants.
- **Lowering a quota is not safe on its own:** rows over a new quota are kept, never dropped. The release session first
  checks, with a read-only query, that no account in production is over either (`activity_count > 4000` or
  `digest_bytes > 33554432` on `users`); one that is would still compute, and may not fit. **That read-only check is the guard**: the `too_large` outcome that once sent an oversized account to the browser is gone, so an account that does not fit the isolate fails its job on every try, goes to the dead-letter queue, and is re-sent and fails again each day (its `state_job_failed` log line carries `activities`, a size bucket and no figure).

## What the browser stops doing for accounts

Line counts are non-test lines at main 114e4de5.

**Phase 1, built now:**

- **Analysis of an account's library.** The state building in `loadServer` and the second `loadDigests` in
  `rebuildStale` (`worker/rebuild.ts`); the account branches of `setRange`, `setSettings`, `addFiles`,
  `removeActivity` and `replaceDigest` in `analysis.worker.ts`; the reload and recompute in `deleteGroup.ts` and
  `applyListLabels.ts`; `keepUnsaved` for accounts; the `libraryRevision` poll in `libraryTabs.ts`; the account branch
  of `checkinWorker.ts`; the account path of `useLiftSummary.ts` and `ui/lift/bigThreeModel.ts`.
- **The reconciliation.** `serverCopy.ts` (54) and its unsent-work rule, `settingsUnsent.ts` (32), the writing of
  browser-computed account snapshots in `deviceCopy.ts`, the `me.serverState` flag, and on the server the allowlist
  (`SERVER_COMPUTE_USERS` and the `SERVER_COMPUTE_ACCOUNTS` secret, removed in C3b: every signed-in account computes on the server,
  and `/api/me` no longer sends `serverState`) and, once measured, `SERVER_STATE_MAX_ACTIVITIES`. The owner removes the
  `SERVER_COMPUTE_ACCOUNTS` secret after that release.

**Phase 2, after the Garmin parser runs in the Worker (G1 to G3):**

- **The updater and the digest rebuild** move to the server, which re-digests kept originals with the same
  `digestActivity` (S6, second half). Then `rebuild.ts` (218), `updater.ts` (249), `updaterConfig.ts` (24),
  `updaterLock.ts` (41), `outdatedOriginals.ts` (27) and the `rca-flush-` lock go.
- **The outbox, once uploads move server-side.** A signed-in import sends the file and the server parses it and checks
  duplicates, as the Garmin path does. Then `outbox.ts` (253), `outboxResume.ts` (190), `startResume.ts` (74),
  `resumeHolder.ts` (43), `writerResume.ts` (34), the digest half of `accountSave.ts` (193), `saveLimits.ts` (65),
  `sendingKeys.ts` (27), `rateLimitRetry.ts` (127) and the waiting-saves UI go. Adoption of a signed-out library
  stays: it sends the device's digests once, with a retry in the page. The index shrinks to what the list and the
  activity page read.

Phase 1 cannot delete the index, the outbox or the updater, which need the session library (`markSaved`, `hiddenIds`,
`replaceDigest`). About 2,800 non-test lines are account-only today (rebuild and updater 750, outbox, save and adoption
1,785, delete and labels 218, reconciliation 86), with about 5,350 lines of tests. Phase 1 removes the analysis and
reconciliation share; phase 2 most of the rest. Each PR reports lines removed (review H3).

## IndexedDB stores

| Store                    | After                                                                        |
| ------------------------ | ---------------------------------------------------------------------------- |
| `rca-state`              | Stays: the cache of `/api/state` per account, and the signed-out device copy |
| `rca-device-library`     | Stays: signed-out only; read once by adoption                                |
| `rca-checkin`            | Stays: the per-device baseline                                               |
| `rca-workbench-evidence` | Stays: per-second traces are a cache of originals, not results               |
| `rca-lifts`              | Stays: the logger's rows; no grade is computed from it for an account        |
| `rca-import-meta`        | Stays                                                                        |
| `rca-outbox`             | Goes in phase 2, with a one-time delete of the database on open              |

The sign-in sweep (`worker/sweepAccountDetails.ts`) keeps its list. A test lists every `rca-*` database the app can
open and checks each is in the sweep or named here as device-only.

## Acceptance tests

- **Equivalence, live.** For each synthetic athlete in the corpus, with the same digests, settings, choice, `nowMs`
  and zone: `computeFor` on the server equals the state the signed-out worker path builds (`loadDevice`) for the
  chosen period, a custom range, a settings change and the lift state. Both paths stay, so the test runs in CI with no
  recorded fixtures to go stale. No figure changes, so there is no model-ledger row.
- **No account state in the browser.** A worker test sends every request type in account scope and fails if any
  builds a `SessionState`.
- **Compute on read.** A write followed by `GET /api/state` returns the new result in that response; a lift write, a
  lower stored revision (an earlier snapshot version or lift estimator included) and an aged day each recompute; a version bump that moves no figure is a 304 with the new revision stored, and a day roll is a 200 with a new tag; a higher stored revision computes once per isolate, stores nothing and then answers 304; a 304 with a newer `X-State-Now` survives a reload as a fresh copy; two requests
  and a queue message in one isolate run one compute, and the message is retried, not acked; no stored snapshot under
  the lock answers 202; a lift write during the input read is `InputsMoved`; a day of 60 s polls stays inside the read
  budget.
- **One lift source.** The Lift page and the lift corner render from one snapshot, and an unsent set changes neither.
- **The cap.** A library at the byte quota computes on the server in workerd, and a test pins the bound to the quotas.
- **Signed out.** The e2e signed-out and sample flows pass unchanged.

## Privacy page

Signed in, the server computes your results from the summaries it already holds, stores them with your account and
deletes them with it, and the browser keeps a copy. Lifts are part of those results. Signed out, analysis runs in your
browser. The privacy-page tests pin the lines.

## Order

1. This note.
2. M1: server compute as a pure function of its inputs.
3. Phase 1, as one feature branch of slices: the live equivalence test (core, web worker); compute on read, ordering,
   lifts in the version and the migration (api); lifts and the check-in in the snapshot (core, api); the cap measured
   and moved (api); the browser reads only `/api/state` for accounts, and the deletions (web), last.
4. Phase 2, after Garmin G1 to G3 are on main.
