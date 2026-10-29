# Architecture I: originals store, analysis-module registry, unified storage layer

Status: designed, deferred until findings need it (see the [stage plan](README.md)). The stage letters in the body are those of the earlier plan: B this design, C routes, D findings, E training load. The current plan is in [README.md](README.md).

## 0. Findings from the current code that shape the design

- `session.ts` is 399 lines because it holds three jobs: import orchestration (`addFiles`/`consider`/`keep`), the library (digest map, outdated/incompatible/unsynced keys), and the eager `state()` that computes 11 fields on every call. `PeriodCache`, `ZoneTimeCache`, `HeartRateJudge` and `RecordsCache` each reimplement "same digests (by identity) and same masses, so reuse".
- Every worker reply to a mutating request posts the whole `SessionState`, including `library` (the summaries of all activities) on every `setSettings`.
- Worker replies are matched to requests in FIFO order (`pendingRepliesRef`), and the worker handles one request at a time. A long background job therefore has to run as short steps, or it will block every page request.
- Four stores each carry their own open, timeout, back-off, tombstone and clear logic.
  - `rca-device-library` (v1) keeps `Row | legacy string`.
  - `rca-workbench-evidence` (v2) has `workbenchOpen.ts`, an `OWNERS` tombstone store and a ledger rebuild.
  - The parked `rca-courses` repeats the same pattern with a salt store.
  - `rca-findings` is designed to repeat it again.
- No original is kept in the browser. A signed-in user can re-download only 50 originals a day, so recomputing a 2,000-activity library from R2 takes 40 days. A signed-out user must re-import.
- GPS positions exist only at parse time. Stored originals will be the first thing in the browser that holds exact locations, which is a new privacy exposure (see 1.7).

## 1. Local originals store

### 1.1 Shape

An original is one activity file as it came out of the import: the single entry extracted from a zip, not the whole zip.

- Compression: `CompressionStream('gzip')`. Gzip's CRC gives an integrity check for free.
  - A source that is already `.gz` is stored as it is, with `codec: 'gz-source'`.
  - Where the stream API is missing the bytes are stored raw, with `codec: 'raw'`.
- Manifest rows, in the `originals` collection of the unified layer (section 3): `{hash(sha256 of raw), name, codec, rawBytes, storedBytes, savedAt, touchedAt, state: 'ok'|'deleting'}`.
  - The hash is already computed at import (`hashFiles`) and is the key.
- `links`: `workoutKey -> hash` (plus the leg index for multi-activity files). A file is deleted when its last link goes.
- Bytes live behind a `BlobBackend` interface.
  - **IDB backend**: an `originalBytes` store holding `Uint8Array`s, not Blobs, because Safari has had Blob-in-IDB bugs.
  - **OPFS backend**: `rca/originals/<scope>/<hash>.gz`, written with `createSyncAccessHandle` in the worker.
  - Manifest and links always stay in IDB, so deletion, tombstones and scope checks stay transactional.
- Write order: bytes to a temp name, then the manifest row in a transaction, then a rename. Orphaned bytes are swept at open.
- Delete order: the manifest row goes to `state: 'deleting'`, then the bytes are removed, then the row is removed. A failed byte removal leaves a `deleting` row that retries and counts as `notForgotten`.

### 1.2 Scope

- Signed out: scope `device`. The original is the source of truth.
- Signed in: scope `account:<userId>`.
  - With `keepFiles`, the local copy is a cache of R2 and is **evictable**. Its purpose is to avoid the 50-a-day download cap and to allow offline recompute. This is a second copy; I accept that cost.
  - Without `keepFiles` the user chose not to give files to the server. A local copy is still kept by default (decision 1), account-scoped, and it is then the only copy, so it is a `source`.
- Each collection has a `role`: `source` (never evicted automatically) or `cache` (evictable). An account-scope original is a `cache` while the server has it (`record.hasFile`) and is a `source` otherwise.

### 1.3 Quota and eviction

- Order of use when space is short: derived caches first (traces, then fingerprints that have an original), then local copies of server-held originals. Source originals are never evicted automatically.
- A derived row can be evicted only if its original is held, so a rebuild can always recover it. Traces with no original keep today's 64 MiB LRU.
- The write path checks `navigator.storage.estimate()` against `ORIGINALS_MAX_QUOTA_SHARE` (0.5, one constant). Over it, or on `QuotaExceededError`, the layer:
  1. evicts caches;
  2. if that is not enough, sets `originalsState: 'full'`, keeps the digest (the product), and stops keeping new originals;
  3. posts one notice with sizes and the choices: "drop originals of activities older than N", "drop the largest M", or "keep going without originals".
- The user, not the app, decides what to drop. A dropped original makes that activity "re-import to refresh" again.
- `navigator.storage.persist()` is requested when the first original is kept. Where it is refused, the notice is honest: "the browser may clear this".
- Safari can clear all script-written storage after 7 days of no use. The existing `rca.kept.v1` hint plus an empty store shows "Your browser cleared saved data" and offers a re-import. This is a risk to the whole device library today, not only to originals.

### 1.4 Migration and backfill

- There is nothing to migrate for activities already held, because their originals were never kept. Coverage is a per-scope count: `originals kept / activities`.
- **Backfill by re-import.**
  - Add `keepOriginal(held)` to the import path, like `syncExisting`. A held activity with no original gets its original written, and its digest is rebuilt only if it is outdated.
  - One re-import of the export zip then refreshes digests and backfills originals together.
  - Copy: "N activities have no original here. Add your export again to keep them."
- Signed-in users with `keepFiles` backfill on demand. The existing `rebuildStale` path writes through to the local store as it downloads.
  - It is capped at `BACKFILL_DOWNLOADS_PER_DAY = 30`, leaving headroom under the 50.
  - It runs only when a derivative needs the file.

### 1.5 Rebuild orchestration

- `DERIVATIVES` is a registry: `{id: 'digest'|'trace'|'course'|'route', version, build(activity, ctx)}`.
  - The digest's version is `MODEL_REVISION`; the others have their own constants.
  - Each stored derivative row records the version it was built with.
  - A new digest field, or a new fingerprint format, is a version bump in one place.
- `planRebuild(scope)` diffs the required against the stored versions per activity. One parse of an original builds every derivative that activity needs.
- The job is persisted as `jobs/{scope}`: `{target versions, order (newest first), cursor, done, failed[], missing[]}`. It resumes after a reload.
- Source order: the local original, then the server original (rate-limited, account scope only), then "needs re-import".
- It runs in the existing analysis worker as steps, which keeps the FIFO protocol intact.
  - `rebuildStep` handles at most `REBUILD_STEP_MS = 150`. The step budget is time-based, and results never depend on it.
  - The page chains the next step when it gets the reply. Any request the user makes in between is queued ahead of the next step, so the worst wait is one step.
  - A `navigator.locks` lock (`rca-rebuild:<scope>`) keeps one tab running it. Other tabs follow progress over the BroadcastChannel.
- Library updates are batched. At most once per `REBUILD_PUBLISH_MS` (2 s) and at the end, the worker posts `libraryChanged`. Modules then recompute lazily (section 2).
- UI: one banner with "Updating 340 of 1,200 activities", Pause/Resume, and "N need their file added again" at the end. The existing outdated-count wording stays.
- Estimate: about 100 ms of parsing per file, so a 2,000-file library takes about 3 to 4 minutes. A perf test records a throughput baseline.

### 1.6 What derives from originals

- **Digest** (all fields, `MODEL_REVISION` bumps): from the original. Signed-in users write the upgraded digest through `createActivity(...,record.id)` as today. Signed-out users write to the device library.
- **Traces**: become a pure cache (`role: cache`). `activityTraceReply` order: memory, then store, then **local original (parse and capture)**, then the server original on explicit request.
  - This is the answer to "detail traces become a cache rebuildable from originals". The `missing` reply for the device scope disappears.
- **Route shape and course fingerprint (stage C)**: build from the original with the salt in `meta`. Same-route's "bulk rebuild not offered, 50 downloads a day" becomes "offered for locally held originals".
  - `RouteMemory`'s server re-read is replaced by the local original.
  - The design record `same-route.md` section 2 and `training-load.md` decision 6 ("No re-digest from stored originals") need a one-line update.
- **Findings** (stage D): they are a function of digests. When digests gain a field, the originals rebuild runs, then the ledger `replay()` recovers `firstSeen`. The ledger itself is never derived from originals.

### 1.7 Privacy

- Originals are exact location data, which the app does not keep today. A browser profile on a shared machine then reveals home and routes.
- Originals are kept **by default** (decision 1), so the protection is plain copy and an easy exit, not a consent step:
  - `PrivacyNote` and the privacy page say plainly that the exact tracks of imported files are kept in this browser, where anyone using it can see them, and are never uploaded unless the account keeps files. A pinned `privacyPage.test.ts` line holds the wording.
  - The first import that keeps originals shows a one-time notice with the same sentence and a "Forget originals" button. The notice is dismissed once per scope.
  - Profile has a "Keep original files in this browser" switch (on) and a "Forget originals" button. Switching it off stops new keeps and offers to delete the existing ones. "Forget originals" is one call, `forgetScope` for the originals and links collections, with a `RemovalReport`.
  - A leak test over request bodies, the export and share cards proves no original or track leaves the device unless `keepFiles` uploads it.
- Removal paths. All end in the layer's `forgetScope`/`deleteScope`/`forgetAll`, which reports `RemovalReport { ok, failed: CollectionId[] }`:

| Action                   | Removes                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| Delete one activity      | its links, its bytes if no other link remains, its derivatives (one transaction)                  |
| Remove all my activities | the `device` scope: all collections, plus the OPFS directory                                      |
| Sign out                 | the `account:<id>` scope: originals (cache role), traces and fingerprints                         |
| Delete account           | tombstone `account:<id>` first, then clear, then report on failure (the existing message pattern) |

- "Forget routes on this device" and "Forget originals" are scoped forms of the same call.
- Any `failed` entry posts `deviceIssue: notForgotten` with the collection names.

## 2. Analysis-module registry

### 2.1 Model

```ts
interface AnalysisModule<Out, Args = void> {
  id: string
  version: number // version is part of every key
  inputs: readonly Input[] // closed set, declared
  uses?: readonly AnalysisModule<any>[] // other modules, memoised
  cost: 'cheap' | 'moderate' | 'heavy'
  keep?: number // entries kept, default 4
  compute(w: World, args: Args, get: Get): Out
}
```

- `World = { library: LibraryView, period, settings, ledger?, courses? }`. It is immutable per epoch.
- An `Input` is `{ id, key(world, args) }`. The key function is the only place identity is compared.
- The cache key is `moduleVersion + input keys + args + dependency keys`.
- Memo is an LRU per module, held in the worker. It replaces `PeriodCache`'s hand-written arrays and the four separate caches.
- Digest identity: a `WeakMap<ActivityDigest, number>` serial. A `DigestSet` key is the hash of its serials, built once per epoch and period.
- Release: entries record their `DigestSet`, and entries whose digests are no longer held are dropped (the generalised `releaseAbsent`).

Core inputs:

| Input                       | Key                                                                  |
| --------------------------- | -------------------------------------------------------------------- |
| `selected`                  | serials of the period's digests                                      |
| `library`                   | serials of all visible digests                                       |
| `massSettings`              | `sameMasses` plus dated masses                                       |
| `zoneSettings`              | dated max HR and thresholds                                          |
| `setAsideAmongSelected`     | ids of set-aside digests inside the period (today's `setAsideAmong`) |
| `setAsideFull`              | the whole judgement                                                  |
| `periodBounds`              | days, start                                                          |
| `ledger.rev`, `courses.rev` | counters from the storage-backed worlds                              |

### 2.2 Migration of existing features

| Module          | Inputs                                                           | Args                 | Cost     | Replaces                                                   |
| --------------- | ---------------------------------------------------------------- | -------------------- | -------- | ---------------------------------------------------------- |
| `judgement`     | library, zoneSettings                                            | none                 | moderate | `HeartRateJudge`                                           |
| `balance`       | selected, massSettings, setAsideAmongSelected                    | none                 | heavy    | `result` (`combine`)                                       |
| `trend`         | selected, massSettings, periodBounds; uses `balance`             | `{durationS, grade}` | moderate | `trend`, `effortTrends` (`gradeTrend` flag becomes an arg) |
| `previous`      | selected, previousSet, massSettings; uses `balance`              | none                 | moderate | `previous`                                                 |
| `sameHeartRate` | selected, library, periodStart, setAsideFull                     | none                 | moderate | same                                                       |
| `lateEvidence`  | selected, setAsideAmongSelected                                  | none                 | moderate | same                                                       |
| `timeInZones`   | selected, previousSet, zoneSettings; uses `balance`, `judgement` | none                 | moderate | `ZoneTimeCache`                                            |
| `records`       | library, massSettings                                            | none                 | moderate | `RecordsCache`                                             |
| `activities`    | library, massSettings                                            | none                 | cheap    | `library` (summaries)                                      |
| `splits`        | library                                                          | `{id}`               | cheap    | the `activitySplits` request                               |
| `weeklyVolume`  | `activities`, trend weeks                                        | none                 | cheap    | main-thread function (optional move)                       |

New modules:

- **`loadRows`**: per-digest memo keyed on (digest id, revision, reference tuple). Stage E builds `loadWindows` on it.
- **`findings`**: inputs are library, `judgement` and `ledger.rev`. It is pure, and the worker commits the ledger afterwards through the storage layer. The commit is a command, not a module.
- **`courses`**: inputs are library and `courses.rev`. `courseProgress` takes `{courseId}`.

What stays outside the registry, in a new `ImportSession` class:

- the sink protocol;
- `unsynced` state;
- rejected files.
- The shell stays small and is always sent: `{epoch, isSample, totalActivities, outdated, incompatible, hiddenDuplicates, period, syncIssues, rejected, unsupportedFiles}`.

New files (each under 400 lines):

- `core/src/analysis/{registry,memo,world,digestSet}.ts`
- `inputs/*.ts`
- `modules/*.ts`
- `library.ts`
- `importSession.ts`
- `sessionFacade.ts`

### 2.3 Protocol

- `{type: 'modules', want: [{m, args?, have?: key}]}`. The worker computes cheap modules first.
  - Each result is pushed as `{type: 'module', m, args, key, payload | 'same'}`. These are unsolicited messages like `progress`, so the FIFO matching holds.
  - The terminal reply is `{type: 'modulesDone', shell}`.
  - `have` is the key the page already holds. The worker answers `same` instead of re-posting, which removes the 2,000-row `library` clone on every settings change.
- Replies carry the `epoch`. A stale reply is discarded.
- Page side:
  - `useModule(def, args)` registers a need in a `ModuleStore` (a `useSyncExternalStore`).
  - Needs are coalesced per frame into one request.
  - On `libraryChanged` or a shell change, the store re-requests the active set.
  - Unmounted pages stop being requested. Their worker memo remains until evicted.
- The `state` reply is removed only in the last migration PR.

### 2.4 Identity pins

- Keep `AnalysisSession.loadDigests(...) -> SessionState`, now a facade that reads every module from the registry.
- `sessionIdentity.test.ts` and `stateHashes` run unchanged through the facade on every PR, so all 11 fields x 4 periods x 4 settings hashes must match.
- A new test reads each module on its own in a shuffled order and across epochs. It must match the same hashes (order independence).
- A `moduleHashes` pin covers the module outputs that `SessionState` never held (`splits`, `loadRows`).
- A change that means to alter an analysis copies the received hashes, and the PR says which field moved and why, as today.
- In the final PR the facade moves to `test/` and production no longer builds `SessionState`.

### 2.5 Performance

- Counting compute calls (not wall time) in unit tests:
  - a mass change does not recompute `sameHeartRate` or `lateEvidence`;
  - a period change recomputes only the period-keyed modules;
  - an add outside the period does not recompute `balance`.
- `registry.perf.test` at 2,000 digests gives every module a budget and compares against the eager baseline from `sessionLibrary.perf.test`.
- The first-page request costs `judgement + balance + trend`, not all eleven modules.
- The `same` replies cut structured-clone traffic.
- `heavy` modules can be pushed after `cheap` ones in the same request, so a page paints sooner.

## 3. Unified local storage layer

### 3.1 Shape

`apps/web/src/storage/` is the one module.

- A single IDB database `rca-local`.
- Collections declared with `defineCollection({name, role, version, codec, budget})`.
- Every row is `{scope, key, v, savedAt, touchedAt, bytes, value}`, with an index on `scope`.
- Shared stores: `owners` (tombstones), `meta` (salt, ledger, migration marks, `originalsState`), `jobs`.

| Collection           | Role         | Rebuild                         |
| -------------------- | ------------ | ------------------------------- |
| `digests` (+route)   | essential    | re-import, or originals         |
| `traces`             | cache        | originals, or server            |
| `courses`            | cache        | originals (otherwise essential) |
| `findings-ledger`    | essential    | `replay()`                      |
| `originals`, `links` | source/cache | re-import                       |

### 3.2 Behaviour written once

- **Connection**: `OPEN_TIMEOUT 5 s` and `OPEN_RETRY 30 s` back-off (from `databaseHandle`). Removals reopen once and fail closed. A closed or versionchange connection resets itself.
- **Scopes**: `device` or `account:<userId>`. `clearScope`, `deleteScope` (tombstone written in the same transaction as the check), `forgetAll`.
  - Every write checks the tombstone in its own transaction, so a stale worker cannot write back into a deleted account.
- **Removal** returns a `RemovalReport`. It is `ok` for storage that does not exist at all (`nothingKept`) and false whenever storage might still hold data.
- **Ledger**: bytes and count per collection, and the corrupt-row repair from `rebuildLedger`, generalised.
- **Quota**: the budgets and the eviction of section 1.3. One `StorageFull` event.
- **Row versions**:
  - A row has `v` and a collection supplies `readers: {1,2,...}`.
  - A row from a newer app is skipped and kept (the existing rule).
  - A row from an older app is upgraded on read, or flagged `needsRebuild`.
- **DB schema migrations** are an ordered list `{to, up(tx)}`.
- **Cross-tab**: a `BroadcastChannel('rca-storage')` sends `{collection, scope, kind, epoch}`.
  - Subscribers: the `Workbench` memory cache (replaces its per-get `store.has` check), the device library (`libraryChanged elsewhere`, which today leaves `held` stale), and the `CourseIndex` generation.
  - Without BroadcastChannel it degrades to today's behaviour.

### 3.3 Migrating each store

- **Workbench** (cache): do not copy. The first open of `rca-local` creates empty traces; `rca-workbench-evidence` is deleted once `rca-local` opens.
  - Signed-in users re-fetch on demand, as today. Signed-out users lose the traces until a re-import or a rebuild from originals. This is the explicit-rebuild case.
- **Device library** (essential): copy and verify.
  - Read the legacy rows (string rows and `{digest,route}` rows).
  - Write them to `digests` in one transaction per batch.
  - Verify the row count and a hash of the serialised digests.
  - Write `meta.migrated`. The legacy DB is left untouched.
  - The next release deletes it after the check passes again. Until then "Remove all" deletes both databases. Fail closed.
  - Migration is idempotent and restartable.
- **Courses** (parked branch): rebase `courseStore` to a `courses` collection. Its `OWNERS`/`SALT` stores map to `owners`/`meta`. The branch is unreleased, so there is no data.
- **Findings** (stage D): defined directly as a collection.
- **localStorage** conveniences (`rca.kept.v1`, period preference, measurement store) stay as they are. They are per-viewer hints and out of scope.

### 3.4 Shared contract suite

`storage/contract/collectionContract.ts` exports `runCollectionContract(name, makeCollection)`. Every collection runs it.

- Round trip; scope isolation; `clearScope`; `deleteScope` and a stale second handle failing to write.
- Idempotent and fail-closed removal: refused storage gives `ok:false`, but absent IDB gives `ok:true`.
- Open timeout and back-off using fake timers; a blocked upgrade; versionchange closes the connection.
- A corrupt row is ignored; a newer-version row is skipped and kept; ledger repair.
- A quota error on `put` leads to eviction of caches first, and never of a source.
- A BroadcastChannel notice reaches a second handle.
- A legacy fixture opens and migrates; a crash mid-migration resumes.
- Golden codec vectors per collection.

The tests need a real IDB fake. The repo has only hand-made fakes, so add `fake-indexeddb` as a pinned dev dependency (decision 7).

## 4. Phased plan

Three tracks. Each PR gets an independent review. No more than three stacked per track. Main stays releasable because O1 is not wired to import. O2 is the PR that turns keeping on, and ships together with its privacy copy and the Forget control. Migrations are verified copies.

| PR     | Contents                                                                                                                                                                                                           | Depends on |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| **S1** | Layer core (connection, scopes, tombstones, report, ledger, migrations, BroadcastChannel) plus the contract suite, on test collections. No consumer.                                                               | none       |
| S2     | Workbench onto the layer; `forgetAccountDetails`/`deleteAccountDetails` use `forgetScope`/`deleteScope`; `RemovalReport` plumbing                                                                                  | S1         |
| S3     | Device library: copy-verify migration; deletion of legacy at the next release                                                                                                                                      | S2         |
| **R1** | `Library`/`ImportSession` split from `session.ts`; registry core, memo, `DigestSet`; facade; `session.ts` well under 400 lines. No behaviour change; pins identical.                                               | none       |
| R2     | `judgement`, `balance`, `trend`, `previous` modules behind the facade                                                                                                                                              | R1         |
| R3     | `sameHeartRate`, `lateEvidence`, `timeInZones`, `records`, `activities`, `splits`; delete the old caches                                                                                                           | R2         |
| R4     | `modules` protocol, `ModuleStore`, `useModule`; Balance page on it; `have`/`same`                                                                                                                                  | R3         |
| R5     | Remaining pages; remove `state`; facade moved to `test/`; `weeklyVolume` (optional)                                                                                                                                | R4         |
| **O1** | `originals`/`links` collections, gzip codec, IDB `BlobBackend`, quota policy, coverage count. Not wired to import yet.                                                                                             | S1         |
| O2     | Import write path (`keepOriginal(held)`), turns keeping on by default, first-import notice, Profile switch and "Forget originals", `persist()`, `PrivacyNote`/privacy page text and its pinned test, removal paths | O1, S2     |
| O3     | OPFS backend (benchmarked against IDB, kept only if it earns it), orphan sweep                                                                                                                                     | O1         |
| O4     | `DERIVATIVES` registry, `planRebuild`, jobs, stepped rebuild, Web Lock, banner, Pause/Resume                                                                                                                       | O2, R1     |
| O5     | Traces from local originals; route/fingerprint derivation (stage C); server backfill write-through                                                                                                                 | O4, S2     |

Notes:

- R5 is the last PR that touches every page. Run its review as a whole-page pass.
- Stage C and D builders can start once S1 and R1 have merged, because their stores and modules land on the layers directly.
- Each PR keeps the size ratchet in `scripts/ops/size-budget.test.mjs`; no entry rises.
- After each stack merge: the release gate in a clean worktree, then a smoke test with a real local export (never committed).

## 5. Risks

1. **Data-loss risk is concentrated in S3.** Mitigations: copy and verify, the legacy DB kept for one release, and a restore test over the legacy row shapes. A rollback to an older build sees a library as of the migration; it dedupes on re-import.
2. **One database blocks on an old tab.** The handle closes on `versionchange`, the 5 s open timeout applies, and the UI says "Close other tabs".
3. **Exact location in the browser.** A larger exposure than anything stored today. On by default, so plain copy, a one-time notice, a one-click "Forget originals", fast removal, and no network path (leak test over request bodies, as same-route specifies).
4. **Rebuild CPU.** About 3 to 4 minutes for 2,000 files. Resumable, pausable and stepped; a stuck step cannot block the page for more than about 150 ms plus one file's parse. A very large single file still stalls briefly (a known limit).
5. **Safari eviction after 7 days** can empty everything. A sentinel notice plus a re-import path.
6. **Registry key bugs**: stale output if an input is missing from a module's declaration. Mitigations: the pins, a test that varies each input alone, and a lint-like test that every module's compute reads only the declared inputs (the `World` is a Proxy in tests).
7. **Partial rebuild states.** The page may analyse a library with some digests outdated. The existing outdated-count wording covers this, and the banner shows progress.
8. **Double storage for signed-in users** with `keepFiles`. Bounded by the quota rule and evictable.

## 6. Decisions

All resolved. Numbers are those used through this document. Owner decisions are 1, 3, 4 and 8; the rest are the coordinator's.

1. **Originals default** (owner): kept **on by default**, not opt-in. The privacy copy states plainly that exact tracks are kept in this browser and never uploaded unless the account keeps files, and an easy "Forget originals" control is always available (1.7).
2. **Signed-in with `keepFiles`** (coordinator): also keep a local, evictable copy.
3. **Sign-out** (owner): clears account-scope originals, with traces and fingerprints. The cost is a re-download, within the 50-a-day cap. Device-scope originals stay.
4. **Eviction** (owner): source originals are never dropped automatically. Under space pressure the layer drops caches first, then stops keeping new originals and asks the user what to drop (1.3).
5. **Single database `rca-local`** (coordinator), with a copy-verify migration and one-release legacy retention.
6. **OPFS** (coordinator): IDB first, and OPFS only if the benchmark earns it.
7. **`fake-indexeddb`** (coordinator): added as a pinned dev dependency for the contract suite.
8. **Rebuild** (owner): runs automatically in the background when originals exist. It is pausable and shows a progress banner (1.5).
9. **`weeklyVolume`** (coordinator): moves into a worker module.
10. **Earlier design records** (coordinator): `training-load.md` decision 6 and `same-route.md` section 2 are updated to match (backfill from local originals).
11. **`navigator.storage.persist()`** (coordinator): requested when the first original is kept. Chrome grants it silently; Firefox prompts.
12. **Constants** (coordinator): approved as defaults. `OPEN_RETRY 30 s`, `ORIGINALS_MAX_QUOTA_SHARE 0.5`, `BACKFILL 30/day`, `REBUILD_STEP 150 ms`.
