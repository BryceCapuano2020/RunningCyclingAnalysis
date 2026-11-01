# Same route and same climb: design

Status: in progress, scheduled later in the [stage plan](README.md). The fingerprint, matching and progress code
exists on unmerged branches; the rest is designed only. Written against main after #130.

Goal: when an athlete repeats a route or a climb, say how this visit compares with the others, on
terrain that is held fixed. Grade adjustment only models terrain; a repeated course removes it.

## 1. What data exists where

| Place                                             | Positions? | Notes                                                                                                                                                                            |
| ------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parse time (`unit.fixes` in `import/pipeline.ts`) | Yes        | The only moment lat/lon exist. `routeFromFixes` already runs here, then fixes are dropped.                                                                                       |
| `Activity.route` (`RouteShape`)                   | No         | Unit-box outline, north-up, no place, no scale. Signed-out: IndexedDB `rca-device-library`. Signed-in: worker memory only (`RouteMemory`), re-read from the original on request. |
| `ActivityDigest` (synced to D1)                   | No         | Has distance, duration, movingS, avgHeartRate, avgPowerW, elevationGainM, km/mile splits, flags. No route, no streams.                                                           |
| Workbench traces (`rca-workbench-evidence`)       | No         | Distance, altitude, speed, HR, power, cadence, laps. Bounded cache (64 MiB, LRU), so it holds a few hundred activities, not a multi-year library. Unusable as an index source.   |
| R2 originals                                      | Yes        | Only with keepFiles. Downloads were capped at 50 a day, which made a backfill of a 2,000-activity library take 40 days; the cap is now 5,000 a day (`apps/api/LIMITS.md`).       |

Consequence: a located fingerprint can only be made at import (or re-import). The outline alone
cannot identify a route: two out-and-back lines of equal length in different cities look identical,
and it cannot align a climb. The digest already holds every figure needed to compare whole-route
visits, so nothing new goes in it. No contract, D1 or `MODEL_REVISION` change.

## 2. Privacy and what is kept where

- Server: nothing new. The fingerprint never enters the digest, `serializeDigest`, the export, a
  share card, a URL or any request body.
- Device: a new IndexedDB database `rca-courses`, scoped like workbench traces (`device` or
  `account:<id>`), keyed by workoutKey (sport plus start second, the key the digest already has). It
  is cleared by the same paths that clear traces: delete activity, Remove all my activities,
  forgetAccountDetails, deleteAccountDetails.
- Fingerprint content: a set of 32-bit hashes of about-111 m grid cells along the track, keyed with
  a random per-library salt, plus start/end cell hashes, winding (clockwise, counter, out-and-back)
  and a lap ratio.
- Honest limit: this is obfuscation, not protection. A hashed cell space for one city is about a
  million cells, so anyone holding the table and the salt can enumerate it; even without the salt a
  dictionary attack on a known region is cheap. The salt only guards against accidental disclosure of
  the table by itself (a debug dump of one store), so it is kept in a different store. Anyone with
  the browser profile can recover where the athlete runs, including home. That is a new exposure for
  signed-out users on shared browsers (the summaries are already readable by anyone using the
  browser, but they hold no location). It needs a privacy-page paragraph, a pinned
  `privacyPage.test.ts` line, and a one-click "Forget routes on this device" in Profile (see
  Decisions).
- Multi-device: the index exists only on the device that imported. Other devices rebuild it by
  re-importing the export (the existing "reimport rebuilds the trace" hook is extended to the
  fingerprint). Bulk rebuild from originals is not offered (it was written when downloads were capped at 50 a day; the cap is now 5,000). Every lede states
  its coverage ("found in 12 of your 30 outdoor runs on this device") because an undercount would
  make "fastest of 14" false.

## 3. Matching

Whole routes (phase 1)

- At import: `acceptFixes` (drops (0,0) and speed spikes), thin to a point per 50 m, map to cells
  (latitude-banded so longitude width is consistent across activities), also add the neighbouring
  cell when a point is within 20 m of a cell edge so jitter does not flip cells. Hash and sort into a
  `Uint32Array` capped at 1,024 cells; a 10 km route is on the order of a hundred cells before
  dilation, so the cap only bounds the worst case. Cost is negligible next to parsing; a perf test on
  a six-hour synthetic track pins it.
- At load, in the worker: inverted index (cell hash to activities) finds candidates sharing cells.
  Same sport, distance within 10% (digest `distanceM`), Jaccard at least 0.6 (to be tuned on fixtures
  and a local real export), and, for loops, the same winding. Group by exemplar (join the group whose
  first-seen member matches, else open a new group), not by transitive union, so A-B-C chains cannot
  merge different routes. The groups are derived and held in memory, never persisted, so there is
  nothing to invalidate. On a real multi-year export a large minority of outdoor activities fall on
  routes visited three or more times, and a handful of routes are visited more than ten times.
  Grouping is cheap even without the index, which keeps it linear as libraries grow.
- Exclusions: fewer than 12 cells or under 500 m; lap ratio above about 3 (track laps and repeated
  circuits); sessions with an intervals-like speed profile are kept but flagged, and the lede quotes
  the median, not the mean.

Climbs (phase 3, after routes)

- Detect per activity at import from altitude and the agreed distance: zigzag with 8 m hysteresis,
  keep gain 25 m or more, length 150 m or more, grade 3 to 35%. A climb stores ordered cells (50 m)
  with prefix sums at each cell boundary (moving seconds, HR-seconds, power-seconds) so any shared
  sub-stretch can be timed by differencing. About 20 cells by 16 bytes for a 1 km climb.
- Match by shared contiguous run of cells (one-cell gaps allowed) of at least 150 m and 70% of the
  shorter climb, then compare on the shared stretch only. Do not match on start/end proximity: a
  probe on a real export found endpoints too brittle, because they shift with the watch's smoothing
  and recording, so one climb splits into several distinct ones and few repeat. For athletes who
  train on flat or rolling terrain climbs will also be a smaller section than routes.
- Quality: skip a climb whose span overlaps an `agreedStreams` disagreement stretch, any
  altitude-jump or implausible-climb flag, over 10% invalid grade, over 20% paused time, or rejected
  GPS fixes. HR is shown only where `validHeartRate` covers 80% or more. Device altitude differs
  between watches, so gain is shown as the median, not matched.

## 4. UI and ledes

Facts come from a sport-neutral `ProgressSeries` (dated values, higher-is-better flag, optional
covariate) so the lede and chart layers serve swimming and lifting later; only the geometry layer is
geographic.

- Activity page, below the route outline: "Same route: 6th of 14 times" with a dot-per-visit chart
  (time or pace over date, this visit highlighted; reuse `ui/charts`, a text table for screen
  readers).
- Sport page: a "Regular routes" section in `SPORT_SECTIONS` (top 3 by visits in the period; rows
  show visits, best, latest against median, small sparkline). With none it is one line in its own place that
  says what to add, like every section that has nothing to show.
- Ledes (copy module with tests, like `sameHeartRateCopy.ts`):
  - "Your fastest of 14 times on this loop (8:00 per mile, 9 s a mile quicker than the one before)."
  - "3% faster than your median here, at 2 bpm lower heart rate." Same-heart-rate wording only when
    the HR difference is 3 bpm or less, both have trusted HR (`trustedHeartRate`), and at least 4
    visits.
  - Trend over 5 or more visits uses `theilSen` with an interval: "about 1.2% faster per month (0.4
    to 2.0)". Otherwise nothing.
  - Climb: "5th time up this 0.8 km, 6% climb: 7:00, second fastest, 4 bpm lower than your average
    there."
- What is new: progress on a fixed course removes terrain, which grade adjustment only models.
  Wording stays within the vision: demonstrated facts ("fastest of 14") are stated; trends carry
  intervals; no score, no rank, and an easy-day visit is a lower bound, not a test. Wind, heat and
  effort are not controlled, and the page says so once.

## 5. Data-quality interplay

(0,0) and bad fixes are removed by `acceptFixes`. Indoor, treadmill and virtual files have `indoor`
set and no route, so no fingerprint and no section. Rides without GPS are skipped the same way. The
stream-agreement filter matters for climbs and for time on a stretch (use `agreedStreams` distance);
whole-route totals come from the digest's own figures. Multi-leg sessions are already sliced per leg
by `routeFromFixes`; the fingerprint uses the same slicing.

## 6. Phased plan (parallel streams, each PR independently reviewed)

| Phase | Work                                                                                                                                                                                                      | Stream |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1a    | `packages/core/src/course/`: grid, dilation, salted hash, `fingerprint(fixes)`, winding, lap ratio                                                                                                        | A      |
| 1b    | Matching (inverted index, exemplar grouping) and `progress` (rank, median, HR trust, Theil-Sen) as pure functions over digests plus fingerprints                                                          | B      |
| 2     | `Activity.course` computed in the pipeline; `rca-courses` store, scope and clear paths; worker request `courses`; reimport rebuild; coverage count; privacy page, PrivacyNote, ARCHITECTURE, pinned tests | C      |
| 3     | Activity-page section, chart, copy module                                                                                                                                                                 | D      |
| 4     | Sport-page section, `SPORT_SECTIONS` entry, lack line                                                                                                                                                     | E      |
| 5     | Climb detection, prefix sums, matching, progress                                                                                                                                                          | F      |
| 6     | Climb UI (activity page and sport page)                                                                                                                                                                   | G      |
| 7     | Perf and e2e hardening, docs, review passes                                                                                                                                                               | review |

A and B run in parallel, then C, then D and E in parallel; F can start after A. Keep stacks to three
PRs before review and merge (pillar 6 in [ENGINEERING.md](../ENGINEERING.md)). Each file under 400
lines. When it is scheduled it lands on the unified storage layer of [architecture-1.md](architecture-1.md) if
that has been built by then, not on a new bespoke store.

Tests

- Synthetic fixtures in `packages/core/src/synthetic`: seeded loops with GPS noise at 5 and 15 m,
  reversed, truncated, extended, an out-and-back, track laps, a parallel street 150 to 250 m away
  (must not match), the same shape moved by 50 km (must not match), (0,0) runs, antimeridian. Climbs:
  synthetic altitude with known grade, one shifted by 5 m of barometer offset.
- Property tests: grouping is order-insensitive for clean fixtures, and no chain merges.
- Leak test: a fixture's digest, export, request bodies (e2e-worker network spy) and share card
  contain no lat/lon and no fingerprint hash.
- Perf test with 2,000 synthetic activities asserts comparison counts, not wall-clock (pillar 3).
- Real export: a local script outside the repo prints counts only (routes with 3 or more visits,
  climbs, coverage) to tune thresholds. Nothing from it is committed or pasted into fixtures.

## 7. Risks

Threshold tuning (Jaccard, distance gate) can merge variants or split one route; interval, race and
easy-run mixing makes "slower" misleading (median wording, dots not a line); coverage gaps across
devices undercount visits; browser storage can be evicted (the index silently shrinks, so coverage is
always shown); fingerprint version bumps require re-import; located data in a shared browser
(see Decisions); climb endpoints and altitude differ between watches; a bug that puts the fingerprint
on the digest path would leak location (hence the leak test and keeping the type out of
`ActivityDigest`).

## 8. Decisions

Decided with the owner:

1. **Persist located, salted-hash fingerprints locally**, for both signed-in and signed-out users, in
   IndexedDB `rca-courses`, never uploaded or exported. The privacy page explains it, and a "Forget
   routes on this device" button in Profile removes them. The alternative (outline plus distance
   only) adds no location data but gives false matches and no climbs.
2. **On by default**, not opt-in.
3. **Backfill by re-importing the export only.** No server original reads, no capped daily job.
4. **Route ledes may mention heart rate** ("3% faster than your median here, at 2 bpm lower heart
   rate") only under the strict gates in section 4: trusted HR, at least 4 visits, a small HR
   difference.

Design calls made without a separate sign-off (changing what is stored where needs the owner again):

5. Cell size 111 m. A coarser grid is more private and less discriminating.
6. Climbs ship after routes: smaller yield on most libraries and more quality rules.
7. Course names come from the most common activity name among visits; local renaming is out of v1.
