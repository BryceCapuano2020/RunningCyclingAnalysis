# Findings engine: design

Status: in progress (stage D in the [plan](README.md)). The contract, statistics, scoring, shared
tables, evaluation and replay, and the planted and null test harness exist on an unmerged branch
(phase 1 below). The detectors, ledger, worker wiring and UI are designed only.

Goal: speak only when something non-obvious is well supported. Deterministic, templated copy, no LLM,
runs in the analysis worker, nothing leaves the device. Code in `packages/core/src/findings/`; the UI
reads `SessionState.findings`. A finding that restates something the athlete already knows is not
value, so every rule below leans toward silence.

## Grounding

- `sameHeartRate()`: weekly Theil-Sen fits at one reference HR with 90% intervals over 28-day
  windows; `changeOf` compares first against last week only. Add "latest against about 8 weeks ago",
  and call it library-wide (not per period).
- Run digests carry per-km splits (`gradeAdjustedSeconds`, `elevationGainM`, `avgHeartRate`), which
  give HR at a fixed flat pace.
- Digests also hold distributions, durability, drift, `hrBlocks`, `movingS` and `avgHeartRate`.
- time-in-zones: `effortSplit`, `biggestShift`, `EASY_THROUGH` / `HARD_FROM` (easy = zones 1-2, hard
  = zone 4+), `ZoneTimeCache`.
- `lateEvidence` (durability and drift), and course `progressFacts` (Theil-Sen), see
  [same-route.md](same-route.md).
- Gaps: no per-minute fade profile for rides (needs an optional digest field); no weather.
- Reusable patterns: the worker IndexedDB scope pattern (`workbenchStore`), and the false-alarm test
  model in `sameHeartRate.falseAlarm.test.ts`.

## a. Finding type

```ts
type Kind = 'efficiency' | 'pattern' | 'discipline' | 'durability'
```

A `Finding` has:

- `id` `${detector}:${sports}:${subject}`, stable; `detector`; `kind`; `sports`.
- `direction`: better, worse or neutral (neutral wording).
- `window` and `baseline` as `{fromMs, toMs}`.
- `headline`, built from `copy.ts` and the numbers, never free text.
- `numbers`: `{key, value, unit, low?, high?}[]`.
- `evidence`: `Ref[]` (activity, week or span).
- `confidence` 0..1, `surprise` 0..1, `score` = confidence x surprise.
- `likelyCause?`: `{text, signals}`, rendered as "Likely explanation, not proof".
- `asOfMs`: the latest evidence date, never `Date.now()`.
- `fingerprint`: detector plus sign plus effect, rounded.

`firstSeenMs` is stamped by the ledger and is recoverable by replay.

## b. Detectors, registry, statistics

`Detector { id, kind, sports, minHistoryWeeks, run(input, sport): Candidate[] }` is pure.
`FindingInput { digests, setAside, asOfMs, tables: SharedTables, zones? }`.

`SharedTables` are built once per library: library-wide `sameHeartRate`, weekly moving seconds by
sport, weekly easy/middle/hard split, per-run easy and hard shares, drift points, durability rows.
Each detector is one module, `detectors/<id>.ts`, with its test and copy. The registry is
`Record<Sport, Detector[]>`, and a `SportAdapter` per sport holds output reading, unit, the hard/easy
measure and the formatter. Detectors read digests only.

`stats.ts`:

- `clusterBootstrap`: resample activities, seeded `mulberry32`, 400 draws, giving a 95% interval and
  an agree share.
- `rankTest`: Mann-Whitney, normal approximation with ties.
- `looRobust`: leave-one-activity-out.

Confidence `c = signConfidence x sufficiency x robustness`.

- `signConfidence` = 2 x agree - 1 (bootstrap), or 2 x Phi(z) - 1 for fit-to-fit, where z =
  |delta| / sqrt(se1^2 + se2^2) and se = halfwidth90 / t(n-1, .95).
- `sufficiency` = min(1, n / nNeeded), counting activities.
- `robustness` is 1 if `looRobust`, else 0.5.

Gate: `c >= 0.80`, a practical minimum effect, and the finding holds at two consecutive weekly
evaluations.

Surprise = 0.5 x min(1, |z| / 3) + 0.5 x rarity, times a continuation factor.

- z = effect / MAD-SD of the week-to-week change over the previous 26 weeks.
- rarity = share of the athlete's own past rolling windows with a smaller effect.
- With under 26 weeks of history, z only, capped at 0.6.
- Continuation: 0.4 if the same id was shown in the last 12 weeks with the same sign; 1.25 (capped at
  1. if it is a reversal.

No detector compares the levels of different sports or restates volume. Speak if surprise >= 0.40.

## c. First detectors

- **same-hr-run / same-hr-ride** (efficiency): latest weekly fit against the one nearest 8 weeks
  earlier (6-12). Intervals do not overlap (z >= 2.2), at least 4 reported weeks between, |relative
  change| >= 2.5% for runs and >= 3% for rides; outdoor runs, measured power. "At 150 bpm you now run
  5:30/km, 15 s/km faster than 8 weeks ago (5:45)."
- **flat-run-hr-at-pace** (efficiency): flat km splits (slope-adjusted time within 2% of clock time,
  climb under 5 m) in the most-populated 10 s/km pace band of the last 26 weeks with HR; last 6 weeks
  against the prior 6; per-run median HR; at least 6 runs per side; effect >= 4 bpm; cluster-bootstrap
  95% excludes 0. "Running 5:30 to 5:40/km on flat ground, your heart rate is 5 bpm lower than in
  the six weeks before (150 vs 155, 14 runs)."
- **sport-share-block** (pattern): at least 6 weeks in which a sport's share of moving time moved by
  20 points or more against the prior 8 weeks, and an outcome moved clearly (the same-HR fit-to-fit
  rule, or a best-20-min level trend with non-overlapping 90% intervals, >= 2%).
- **volume-or-intensity-block** (pattern): weekly hours up or down by 25% or more for at least 6
  weeks (rank p < .05, beyond 1.5 x the weekly SD), or hard share up by 8 points or more, plus an
  outcome; never without an outcome.
- **break-return** (pattern): a gap of at least 10 days after at least 4 active weeks; output 3-6
  weeks after against 6 before; compared with an earlier break.
- **easy-runs-too-hard** (discipline): the athlete's own easy runs (at least 25 min, under 5% in zone
  4+, average HR in the lower 60% of the trailing-52-week run average-HR distribution); last 6 weeks
  against the prior 12; at least 8 recent easy runs; median per-run time above zone 2 up 10 points or
  more, rank p < .05, bootstrap excludes 0; dated zones per run; silent if the HR reference moved
  more than 3% between windows.
- **intensity-shift** (discipline): weekly easy/middle/hard; last 8 weeks against the prior 16; middle
  share up or down by 10 points or more with hard within 3; rank test with at least 6 weeks per side,
  p < .05; per sport.
- **hard-day-clustering** (discipline): a hard day has at least 10 min in zone 4+; back-to-back hard
  days per 8 weeks, recent 8 against prior 24 rescaled; Poisson rate-ratio p < .05; at least 5
  events.
- **decoupling-change** (durability): `driftTrend`, sessions of 60 min or more, HR not set aside; last
  8 against prior 8; rank p < .05; median change >= 2.5 points; bootstrap excludes 0.
- **late-output-retention** (durability): best 20 min after 90 min over the fresh best 20 min; last 12
  weeks against the prior 26; at least 4 sessions of 90 min or more in each window; moved >= 6
  points; thin the larger window to the smaller's count (bootstrap best-of-k); confidence cap 0.85.
- **fade-onset** (durability): sessions of 75 min or more in 10-min bins of output per HR; onset is
  the first bin at least 5% below the first-hour level, sustained for 2 bins (censored if none); last
  6 against prior 6; censoring-aware rank test; median moved >= 15 min. Runs from km splits; rides
  need the new digest field.
- **course-progress** (after course-core): Theil-Sen of speed against date at similar HR via
  `progressFacts`; interval excludes 0; at least 6 visits.

Coverage guard: silent (and the cause is dropped) if the share of activities with HR or measured
power changes by 30 points or more between windows.

## d. Likely causes

Outcome findings only; exposures are candidate causes, from a fixed pre-registered table:

- same-HR up <- hours up, hard share up, same-sport share up, or a break ending; lag 2-10 weeks.
- same-HR down <- hours down, a break, or easy-run creep; lag 0-10 weeks.
- decoupling or fade improves <- long-session volume up; lag 3-12 weeks.

Attach a cause only if all hold:

- The exposure gate passes, and its changepoint (a two-segment least-squares split of the weekly
  series) precedes the outcome onset within the lag.
- The outcome is corroborated by an independent channel (an HR-based and an HR-free level trend, or
  two distinct exposures).
- Outcome confidence >= 0.90.
- No coverage change, set-aside or zone/setting change within 4 weeks of onset.

Wording is "Likely explanation, not proof: ..."; never "because" or "caused"; at most one cause.
Efficiency drill-downs carry a caveat line that heat, fatigue and sleep also move it.

## e. Novelty and persistence

IndexedDB `rca-findings`, per scope (`device` or `account` plus userId):
`{id, fingerprint, firstSeenMs, lastShownMs, dismissed?}` and `{lastOpenedAsOfMs}`. No activity data.
Replaying the last 12 weekly marks recovers `firstSeen` and implements the two-consecutive gate.

- A finding is "New" for 28 days of data time, then "Earlier findings" while still true.
- Re-show the same id only if the effect moved by 50% or more, or the sign flipped.
- A same-sport efficiency group keeps its best member; the others become corroboration.
- Quiet state: "Nothing new since <newest firstSeen>". If nothing was ever shown, show nothing on
  Balance and a muted needs-line on sport pages.

## f. Ranking and caps

Rank by `c x s`; ties go to the newer `firstSeen`, then id. At most 1 per kind in the top 3 unless
the second scores 0.9 or more. Balance shows 3; a sport page shows 5 plus a collapsed Earlier 10.
Dismiss per finding ("Not useful"; it returns only on a material change) and per detector (listed in
Settings, undoable).

## g. UI

"What's new" sits under the Balance headline: at most 3 rows, each with a kind chip (not a sport
colour), the headline, a numbers line and "new, 14 Jun". The sport page shows the same, filtered,
plus Earlier. A row opens the evidence panel `/findings/:id`: the numbers with intervals; one chart
of the series with the compared windows shaded; up to 12 activity links (expand all); a method line
(test, n, exclusions); the likely-explanation box; dismiss.

## h. Tests

- **Planted libraries** (a digest-level generator extending
  `digest/test/sameHeartRateFixture.ts`): the planted effect at 1.5 x the minimum effect is found in
  at least 90% of 50 seeds within the stated lag; evidence includes the planted activities; wording
  snapshot.
- **Null libraries:** 300 seeded per detector (1, 2 and 4 activities a week; 26, 52 and 104 weeks;
  weekly replay). At most 1 finding per 20 athlete-years per detector, and at most 0.5 per
  athlete-year overall.
- **Nuisance libraries** (strap or meter change, zone change, 5% HR-spike activities, duplicates, a
  seasonal sinusoid, missing HR): silent, or the cause is dropped.
- **Cause guards:** a cause is dropped whenever any attach condition in section d fails.
- **Surprise:** a steady improvement yields at most one finding; a reversal scores higher.
- **Properties:** determinism, order and period independence, no clock, replay equals incremental,
  the ledger is idempotent.
- **Calibration:** the sign persists 8 weeks later, by confidence bin.
- **Real data:** a script outside the repo and CI, run by hand on a real multi-year export, prints
  counts only. Target: quiet in at least 60% of weeks. The athlete rates about 20 sampled findings to
  tune thresholds. Nothing from it is committed.

## i. Phases

1. **Contract (serial):** types, stats, registry, planted and null harness, copy helpers.
2. **Parallel:**
   - A: same-hr-run / same-hr-ride and flat-run-hr-at-pace.
   - B: decoupling-change and late-output-retention.
   - C: easy-runs-too-hard, intensity-shift and hard-day-clustering (needs zones merged).
   - D: ledger, replay, ranking, caps, dismissal.
   - E: worker integration (`SessionState.findings`, IndexedDB, scope).
   - F: UI against fixtures.
3. **Patterns and causes:** sport-share-block, volume-or-intensity-block, break-return, the cause
   table and guards.
4. **Evidence gaps:** ride fade digest field, fade-onset for runs, course-progress, real-data
   calibration.
5. **Later:** swim and lifting adapters.

In the [stage plan](README.md) this follows routes (stage C), because course-progress reads route
groups, and runs on the stage B module registry rather than adding another field to `SessionState`.

## Decisions

Decided with the owner:

1. **Audience and bar.** Built for the athlete first, friends later; desktop first. Restating the
   obvious is not value: a finding must tell the athlete something they did not already know.
2. **A findings engine** of per-question detectors, evidence-gated and ranked by surprise x
   confidence, each with evidence links. "What's new" sits under the Balance headline (Balance stays
   the home answer); sport pages get their own findings. On quiet weeks show nothing ("Nothing new
   since <date>").
3. **Kinds worth acting on:** efficiency changes (pace or power at the same HR), training-pattern
   effects (what happened after blocks), easy-day discipline (intensity drift), and durability and
   fade.
4. **Strict bar:** confidence >= 0.80, surprise >= 0.40, quiet in at least 60% of weeks. Thresholds
   are tuned on a real multi-year export plus the athlete's ratings of about 20 sample findings.
5. **Easy runs are inferred from the athlete's own HR**, with a "mark as easy" override on the
   activity page.
6. **Add the ride fade-onset digest field** (the gap noted under Grounding). Changing digest output
   follows the `MODEL_REVISION` rules.
7. **"Worse" findings follow the same rules and have the same prominence** as better ones, with
   neutral wording.
8. **Likely causes** may be suggested when several signals line up, labelled as a likely explanation,
   not proof (section d).

Design calls made without a separate sign-off:

9. Findings are library-wide, not per period.
10. Likely causes ship in phase 3, after the detectors.
11. A caveat line covers weather (not in the data), as in section d.
12. The ledger is per device, with replay to recover history.
13. "Earlier findings" stays visible while a finding is still true.
