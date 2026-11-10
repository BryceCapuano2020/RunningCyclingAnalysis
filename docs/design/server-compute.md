# Server compute: results ready before the page opens

Status: designed and approved by the owner on 9 Nov 2026 (section 7). S1 to S3 built; S5 (the browser reads the snapshot) built; S4 (server) built and off for
everyone (`SERVER_COMPUTE_USERS` empty, no queue bound in production) until the owner is on Workers Paid; then it runs for
listed accounts only. Written 9 Nov 2026
against main 34de84bc.

## Why

A signed-in reopen today fetches every digest from `GET /api/activities` in pages of 90 (`worker/rebuild.ts:54`),
then runs the whole analysis again (`AnalysisSession.loadDigests`, `packages/core/src/session.ts:270`). The result
cache (`PeriodCache`, four analyses) lives in the worker's memory, so a reload starts from nothing. The athlete sees
"Restoring your results" every time.

Three later stages need results that exist without an open tab: Garmin sync ([garmin-sync.md](garmin-sync.md)), the
stage E connector, and any weekly check that runs on its own. Today the roadmap has the connector serve "what the
browser computed", which only works if a browser synced recently.

## 1. The shape

For signed-in accounts the Worker computes the opening state with the same `packages/core` code and stores it. The
browser shows its own last copy at once, then the server's copy if it is newer. Signed-out use is unchanged and runs
entirely in the browser.

```
write (create, replace, delete digest; profile; measurement; account settings)
   --> D1, same batch: users.library_version + 1, state_jobs.dirty_version = library_version
   --> Queue "state" message {userId}, delaySeconds 10

Queue consumer (Workers Paid)
   group the batch by user; skip a user whose computed_version >= dirty_version
   one D1 read: library_version, digests, profile, measurements, account settings
   AnalysisSession.loadDigests(...) with nowMs and the viewer's zone as parameters
   hash the snapshot; if unchanged, record the version and stop
   else write R2 users/{id}/state/{hash}.json.gz and update state_snapshots
        only if the version read > the stored version

browser open (signed in)
   1. render the device copy from IndexedDB rca-state at once (no restoring page)
   2. GET /api/state  If-None-Match: "<hash>"  --> 304, or the newer snapshot
   3. load digests in the background for interactive work (other periods, the workbench)
```

## 2. What the numbers allow

| Fact                                   | Value                                            | Source                                             |
| -------------------------------------- | ------------------------------------------------ | -------------------------------------------------- |
| Analysis of 2,000 activities, all time | budget 540 ms, measured about 100 ms             | `sessionLibrary.perf.test.ts`, docs/PERFORMANCE.md |
| Hard-effort library, all time          | budget 1,200 ms                                  | same                                               |
| Snapshot size, 2,000 activities        | 1.8 MB structured clone                          | docs/PERFORMANCE.md:71                             |
| Digest size                            | about 5 KiB each; cap 5,000 or 64 MiB per user   | apps/api/LIMITS.md:175, 226, 291-292               |
| Workers Paid CPU                       | 30 s default, 5 min max (`limits.cpu_ms`)        | Cloudflare Workers limits                          |
| Isolate memory                         | 128 MB, heap and Wasm together                   | same                                               |
| Queue consumer and hourly cron         | 15 min wall time; consumer batch up to 100       | Cloudflare Workers and Queues limits               |
| D1 row                                 | 2 MB max                                         | Cloudflare D1 limits                               |
| Included per month                     | 10 M requests, 30 M CPU-ms, 1 M queue operations | Cloudflare pricing                                 |

CPU is not the constraint: a recompute costs about a second at most, and five friends importing all week would use a
fraction of the included CPU. **Memory is.** A Node benchmark of 1,040 activities peaked at 45 MiB of heap
(`benchmarks/library.ts`). At 5,000 activities the digest text alone is about 25 MB before parsing, plus the period
and records caches, so the cap could pass 128 MB. The snapshot also nears the 2 MB D1 row limit, so it goes to R2.

## 3. Decisions

1. **Same code, both places.** The consumer calls `AnalysisSession.loadDigests`, the function the browser worker
   calls, so the revision gate (`readRank`, `notCurrent`) and the held-out stale digests work the same way. Core
   needs only `fflate`, `crypto.subtle` and text codecs (no DOM globals outside tests). No figure gets a server
   formula, and the web does not recompute figures from a snapshot; `figure-sources.test.mjs` covers the snapshot
   path ([One figure, one function](../ENGINEERING.md)).
2. **No module globals in the analysis.** The viewer's zone is a module global today (`calendar.ts:38`,
   `setViewerZone`, with the `calendarVersion` counter that memos key on). A consumer serving many users would leak
   one user's zone into the next job. It becomes a parameter, as `nowMs` already is. This is the first package, and it
   starts with a failing test: two jobs with different zones in one isolate.
3. **The server computes the page the athlete opens on.** `buildState` searches windows only when there is no period
   choice; the choice lives in `rca.period.v1` on the device today. It moves to the account (decision 10), and the
   consumer builds the athlete's chosen period. Picking another period, a custom range or a mass change still runs in
   the browser worker, from digests loaded in the background. The workbench and route shapes keep reading per-second
   traces on the device or the original in R2; the server holds no per-second data.
4. **What stays on the device:**
   - The "since your last import" check-in. Its baseline (`held`, `marks` in `rca-checkin`) is per device by design,
     so `checkInSnapshot` stays a browser computation.
   - Lifting. `LiftState` is computed on read beside the session state and has no production caller yet. The snapshot
     leaves it out; when the Lift card ships, the snapshot gains it and its key gains `liftRevision`.
   - Unsent work. While the device holds digests not yet on the server (`keepUnsaved`, outbox rows), the browser does
     not apply a server snapshot; it computes locally, as today, until the outbox is empty.
5. **One change counter.** `libraryRevision` is `count.bytes` (`me.ts:47`), which can stay the same across a replace of
   equal size. `users.library_version`, an integer, goes up in the same batch as every write that changes an input,
   and `/api/me` reports it in place of `count.bytes`. Tabs and the snapshot read the same counter.
6. **Ordering under load.** The consumer reads `library_version` and every input in one consistent D1 read, records
   `computed_version` as the version it read (not the latest), and writes the snapshot row only if that version is
   newer than the stored one. A write during a compute leaves the job dirty and sends its own message. Three failed
   tries leave the job dirty; the hourly pass picks it up.
7. **The snapshot is a versioned, serialisable type.** `StateSnapshot` holds `SessionState` with its `Map` fields as
   arrays, plus `schemaVersion`, `modelRevision`, the build sha, `libraryVersion`, `nowMs` and the zone. The browser
   applies a snapshot only when both `schemaVersion` and `modelRevision` match its own build. A cached old tab facing a
   newer server computes locally; a reload picks up the new build, which the same Worker serves. The device copy in
   IndexedDB `rca-state` uses the same type, so the fix being built now (a device copy, no server) and this design
   share one shape. The ETag is the snapshot's content hash.
8. **Dates move, so snapshots age.** A 12-week window shifts daily. A snapshot built on an earlier local day is shown at
   once and marked for recompute. A new hourly cron (`5 * * * *`, beside the 03:17 cleanup) refreshes snapshots older
   than the athlete's local day, for accounts opened in the last 14 days, at most 50 per run.
9. **R2 writes are counted.** A snapshot put happens only when its hash changes, and the old object is deleted in the
   same job. Both count in the R2 operations ledger (apps/api/LIMITS.md). Daily refreshes for five athletes come to
   about 300 operations a month.
10. **Inputs that live only on the device move to the account.** `keepPower` (`rca.keepPower.v1`), `countedRuns` and
    the period choice (`rca.period.v1`) are local storage only today; the first two are "never uploaded" per the
    privacy page. For signed-in accounts they move to the profile, and the profile becomes the only source of
    `AthleteSettings` (mass, bike mass, year, sex) with an equality test against what the browser uses. Units stay a
    display preference. None of these hold activity data.
11. **Memory is measured before it is trusted.** S3 adds `@cloudflare/vitest-pool-workers` (not in the repo yet) and
    runs the consumer in workerd on synthetic libraries of 1,000, 2,000, 3,000 and 5,000 activities. Until measured,
    the server computes only for libraries up to 2,000 activities; larger libraries compute in the browser, as today.
    The measured limit is recorded in apps/api/LIMITS.md.
12. **Equivalence is a test.** For each synthetic athlete in the corpus, the snapshot from the consumer equals the
    state from the browser worker for the same inputs, `nowMs` and zone. The seeds in core (`mulberry32`, seed 1 in
    `compareSports.ts:115` and the others) make that exact.
13. **The connector reads the snapshot.** ROADMAP.md (before 9 Nov) and VISION.md:92-94 said the connector serves what the
    browser computed. With this design it serves the server snapshot, built by the same code. Both lines change.
14. **Garmin gets simpler, in its own note.** A consumer that runs core could parse a pushed FIT file
    (`parseActivityFile`, `import/index.ts:23`) and save the digest, so the browser inbox in garmin-sync.md would go.
    That brings the parser's decompression and memory limits into the Worker; garmin-sync.md is revised for it after
    this note is approved.

## 4. Screens

- The restoring page goes. A reopen shows the shell and the last results at once.
- While a newer snapshot loads, nothing moves. When it arrives, the page updates in place.
- When the device has no copy (a new device): the shell, with a loading state in the content area, until
  `/api/state` answers. One line, no progress bar.
- A refresh of an older analysis shows no notice. A failed refresh shows nothing to the athlete; it is a log line and
  the hourly pass retries.

## 5. Security and privacy

- `/api/state` returns only the session user's snapshot, by the session's user id; 404 for none.
- A snapshot holds derived data, including activity names and dates. It lives under `users/{id}/state/`, so the
  account sweep and the orphan scan in `maintenance.ts` cover it. Account deletion and "Remove all my activities"
  delete it.
- The server already stores every digest, so a snapshot adds no new kind of data. But the privacy page's "Analysis
  runs in your browser" stops being true for signed-in accounts and must say so.

## 6. Packages

Each its own PR under the size cap. S1 and S2 need no plan change and can start at once; S3 needs Workers Paid and
the answers in section 7.

| Package | Work                                                                                                                              |
| ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| S0      | This note. Owner answers section 7 and upgrades the Cloudflare plan.                                                              |
| S1      | Core: the zone as a parameter; `StateSnapshot` and its round trip; the equivalence harness on the synthetic corpus.               |
| S2      | Device copy: `rca-state`, first paint from it, the restoring page removed (the fix being built now, on the S1 type).              |
| S3      | Account settings: `keepPower`, `countedRuns` and the period choice on the profile; one source of `AthleteSettings`; privacy page. |
| S4      | Server: Queue binding, `library_version`, `state_jobs`, the consumer, R2 snapshots, `GET /api/state`; workerd memory test.        |
| S5      | Browser reads the server snapshot; digests load in the background; the unsent-work rule.                                          |
| S6      | Hourly refresh for the date roll; later, stale-digest rebuild on the server from kept originals.                                  |

No model ledger row: no model changes.

## 7. Owner decisions (9 Nov 2026)

All four approved.

1. Workers Paid ($5 a month), upgraded by the owner in the Cloudflare dashboard before S4.
2. The privacy page says: signed out, analysis runs in your browser; signed in, the server also computes your results
   from the summaries it already holds.
3. `keepPower`, `countedRuns` and the period choice move into the account (decision 10).
4. Order: S1 to S6, then Garmin on the revised design, then the connector.
