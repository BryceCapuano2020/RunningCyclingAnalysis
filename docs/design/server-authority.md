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
   `GET /api/state`. The browser never runs `loadDigests` over an account's library.
2. **The device copy is a cache of `/api/state`.** `rca-state` keeps the last server snapshot per account, painted at
   once on open and replaced when the server answers with a different ETag. The browser never writes a snapshot it
   computed itself for an account.
3. **Signed-out use and the sample athlete keep the browser path.** Files are parsed and analysed on the device, the
   device library lives in `rca-device-library`, and nothing leaves the device. This is the privacy promise for
   signed-out use, so it stays. A server path for anonymous use would need an upload of the athlete's data before
   sign-in, which the privacy page rules out. The browser therefore keeps `packages/core` for parsing every file and
   for signed-out analysis; only the account branches go.
4. **No fallback.** No account computes in the browser, for any reason: not for size, not for unsent work, not for an
   old tab. Each case that fell back today gets a server answer below.

## How each account flow works after this

| Flow                                                              | Today (account)                                        | After                                                                                                                                                                |
| ----------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open the app                                                      | Device copy, then server copy or a local compute       | Device copy, then `/api/state` (304 or a newer snapshot)                                                                                                             |
| Import while signed in                                            | Digest saved and loaded into the local session at once | Digest saved (outbox on failure); then `/api/state`, which computes on read (below)                                                                                  |
| Pick another period or a custom range                             | `setRange` in the worker                               | `GET /api/state/period?choice=...`: computed in the request, not stored; the choice is saved as today                                                                |
| Change mass, dated settings, birth year, counted runs, kept power | `setSettings` in the worker                            | The write as today, then `/api/state`, which computes on read                                                                                                        |
| Delete, rename, label activities                                  | API call, then reload every digest and recompute       | API call, then `/api/state`                                                                                                                                          |
| Lift summary and the lift corner                                  | `buildLiftState` over `rca-lifts` in the page          | `lift` in the snapshot (L3); `/api/lifts` joins the input routes, the snapshot key gains `liftRevision`                                                              |
| "Since your last import" check-in                                 | `checkInSnapshotOf(digests, state)` in the worker      | The snapshot carries the current `CheckInSnapshot`; the baseline (`held`, `marks`) stays per device in `rca-checkin`, and the comparison runs over the two snapshots |
| Activity page splits                                              | `session.splitsOf` over loaded digests                 | The activity's own digest, read with the activity (a function of one digest, not of the library)                                                                     |
| Workbench, route shape, traces                                    | Trace cache, else the original from R2                 | Unchanged: per-second data is not analysis, and the server holds none                                                                                                |
| Export                                                            | Reads `/api/activities`                                | Unchanged                                                                                                                                                            |
| Another tab changed the library                                   | Polls `/api/me` every 30 s, then reloads every digest  | The `library` message on `rca-sync-v1`, then `/api/state` with its ETag; the 30 s poll goes                                                                          |
| Snapshot made by another build                                    | Computes locally                                       | The Worker serves its own build, so a mismatch means the tab is old: reload once (guarded), keep the copy                                                            |

## Compute on read

`GET /api/state` serves the stored snapshot when it is current, and otherwise computes in the request, stores the
result and serves it. Current means all of: `computed_version >= dirty_version`, the analysis revision is the Worker's
own, the snapshot's local day is today in the account's zone. This one rule gives read-your-writes after an import or
a settings change, recomputes after a `MODEL_REVISION` or analysis-revision change (an open item in
server-compute.md section 8), and refreshes a snapshot that aged past its day (most of S6) for every account that
opens the app.

- The queue stays. It computes after writes made with no tab open (Garmin, another device), so an open is usually a 304. Whether the queue, its pending markers and the daily re-send can go once compute on read exists is measured
  after the build, not decided here.
- One compute per isolate at a time. A request that finds another compute running in its isolate serves the stored
  snapshot (marked not current with `X-State-Current: 0`), and the page asks again in a few seconds. This bounds memory
  to one library per isolate, as the queue's `max_concurrency = 1` does today.
- Ordering is the existing one: the snapshot row is written only when the version read is newer than the stored one,
  so a request and the queue racing on one account cannot write an older result over a newer one.
- M1 (server compute as a pure function of its inputs, with an interleaving test) lands before this, since compute on
  read runs computes for different accounts in one isolate.

## The activity cap

The server computes for libraries of up to 2,000 activities (`SERVER_STATE_MAX_ACTIVITIES`); a larger library computes
in the browser. With no browser path that cap would leave a large library with no results. An account may store up to
5,000 (`MAX_ACTIVITIES_PER_USER`).

- **Measure in workerd.** Run the consumer and the compute-on-read route under `wrangler dev` (workerd) on synthetic
  libraries of 2,000, 3,000, 4,000 and 5,000 activities. Record the workerd resident memory before and at the peak of
  one compute (an upper bound on the isolate's use), the wall and CPU time, and the D1 read time, beside the Node heap
  figures already in `apps/api/LIMITS.md`. Cloudflare's limits are 128 MB per isolate and `limits.cpu_ms = 10000` in
  `wrangler.toml`.
- **Raise the cap to the account limit.** If 5,000 fits with room (peak under about 96 MB, CPU under half the limit),
  the server cap is the account limit and `SERVER_STATE_MAX_ACTIVITIES` goes. If it does not, cut the compute's memory
  first (read digests in pages and drop each page's JSON text once parsed; release the period caches the snapshot does
  not need) and measure again. If it still does not fit, lower `MAX_ACTIVITIES_PER_USER` to the measured figure, so
  that the rule "every account fits on the server" holds by construction. A test pins the cap to the account limit.

## What the browser stops doing for accounts

Line counts are non-test lines at main 114e4de5, from a read of `apps/web/src`.

**Phase 1, built now (H2 build):**

- **Analysis of an account's library.** `loadServer` in `worker/rebuild.ts` and its callers in `analysis.worker.ts` and
  `adoptionRequests.ts`; the account branch of `setRange` and `setSettings`; the reload after delete and labels in
  `deleteGroup.ts` and `applyListLabels.ts`; `keepUnsaved` for accounts; the `libraryRevision` poll in
  `libraryTabs.ts`; the account branch of `checkinWorker.ts` (it reads the snapshot's `CheckInSnapshot`); the account
  path of `useLiftSummary.ts`.
- **The reconciliation.** `serverCopy.ts` (54) and its unsent-work rule, `settingsUnsent.ts` (32), the writing of
  browser-computed account snapshots in `deviceCopy.ts`, the `me.serverState` flag, and on the server the allowlist
  (`state/flag.ts`, `SERVER_COMPUTE_USERS`, the `SERVER_COMPUTE_ACCOUNTS` secret) and the activity cap
  (`SERVER_STATE_MAX_ACTIVITIES`). The secret is left in place until the release that no longer reads it, then the
  owner removes it.
- **The second `loadDigests` in `rebuildStale`.** The updater still re-digests from originals and saves them (phase 2
  moves that), but it no longer loads the result into a session; the page reads `/api/state` after it.

**Phase 2, after the Garmin parser runs in the Worker (G1 to G3):**

- **The updater and the digest rebuild** move to the server, which re-digests from kept originals with the same
  `digestActivity` (S6, second half). Then `rebuild.ts` (218), `updater.ts` (249), `updaterConfig.ts` (24),
  `updaterLock.ts` (41), `outdatedOriginals.ts` (27) and the `rca-flush-` lock go.
- **The outbox, once uploads move server-side.** A signed-in import sends the file and the server parses it, as the
  Garmin path does. Then `outbox.ts` (253), `outboxResume.ts` (190), `startResume.ts` (74), `resumeHolder.ts` (43),
  `writerResume.ts` (34), the digest half of `accountSave.ts` (193), `saveLimits.ts` (65), `sendingKeys.ts` (27),
  `rateLimitRetry.ts` (127) and the waiting-saves UI go. Adoption of a signed-out library on sign-in stays: it sends
  the device's digests once, with a retry in the page instead of an outbox. Until phase 2, the outbox is an upload
  queue only: it never feeds results.

The inventory found about 2,800 non-test lines on the account-only path (rebuild and updater 750, outbox, save and
adoption 1,785, delete and labels 218, reconciliation 86) and about 5,350 lines of their tests. Phase 1 removes the
analysis and reconciliation share; phase 2 removes most of the rest. Each PR reports lines removed (review H3).

## IndexedDB stores

| Store                    | After                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `rca-state`              | Stays: the cache of `/api/state` per account, and the signed-out device copy              |
| `rca-device-library`     | Stays: signed-out only; read once by adoption                                             |
| `rca-checkin`            | Stays: the per-device baseline; for accounts it no longer holds anything computed locally |
| `rca-workbench-evidence` | Stays: per-second traces are a cache of originals, not results                            |
| `rca-lifts`              | Stays as the logger's unsent sets; for accounts the summary comes from the snapshot       |
| `rca-import-meta`        | Stays                                                                                     |
| `rca-outbox`             | Goes in phase 2, with a one-time delete of the database on open                           |

The sign-in sweep (`worker/sweepAccountDetails.ts`) keeps its list. A test lists every `rca-*` database the app can
open and checks each is in the sweep or named here as device-only.

## Acceptance tests

- **Equivalence.** For each synthetic athlete in the corpus, with the same inputs, `nowMs` and zone: the snapshot from
  the server equals the state the browser worker gave before the deletion, for the chosen period, a custom range, a
  settings change and the lift state. The browser's results are recorded as fixtures before phase 1 deletes the
  account path, so the test still has its reference afterwards. No figure changes, so there is no model-ledger row.
- **No account compute in the browser.** A web test fails if `loadDigests` or `setRange` runs in the worker while the
  scope is an account.
- **Compute on read.** A write followed by `GET /api/state` returns the new result in the same response; a stale
  revision or an aged day recomputes; two requests in one isolate run one compute.
- **The cap.** A library of the account limit computes on the server, measured in workerd, and a test pins the cap to
  the account limit.
- **Signed out.** The e2e signed-out and sample flows pass unchanged.

## Privacy page

Signed in, the server computes your results from the summaries it already holds, and the browser keeps a copy of them.
Signed out, analysis runs in your browser. Lifts join the results computed on the server. The privacy-page tests pin
the lines.

## Order

1. This note.
2. M1: server compute as a pure function of its inputs, with the interleaving test.
3. Phase 1, as one feature branch of slices: compute on read and the cap (api); lifts and the check-in in the
   snapshot (core, api); the browser reads only `/api/state` for accounts and the deletions (web); the equivalence
   fixtures first.
4. Phase 2, after Garmin G1 to G3 are on main.
