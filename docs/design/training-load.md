# Training load: design

Status: designed, not scheduled in the [stage plan](README.md); no code yet. The dated zones it relies on are
merged. The intensity bands should reuse the zone classification from time in zones (shipped in the first stage) rather
than add a second one.

Principle: **recorded time and work are demonstrated; zones are labelled entered or estimated.** Every
number is a sum anyone can redo from the zone table. One measure per sport, never summed across sports
(hours are the only shared unit). Citations marked (u) were not re-read, as in docs/research.

## 1. Measures (per activity, computed once from the digest)

| Sport and evidence           | Load measure                                                                                                           | Why / assumptions                                                                                                                                                                                                                                                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ride, measured power         | **kJ** = avgPowerW x movingS / 1000, plus seconds and kJ in each Coggan level (Allen and Coggan)                       | Physical work, no reference needed, so it is the only load that never depends on an estimate. Coasting counts as 0 W. Binned watts (5 W) are used for the zone split only, never for the kJ total. Estimated (virtual) power is never counted, as in the digest.                                                           |
| Any activity with trusted HR | **Heart-rate points** = Edwards 1993 summated zones: minutes x 1..5 in 50-60 ... 90-100% of max HR; under 50% scores 0 | Needs only max HR (no resting HR, no sex constants) and is the same five zones as the Profile table. Weights are a linear convention, not a measurement. HR also moves with heat, drift, caffeine, and lags short intervals, so hard intervals are under-counted. Validated against session-RPE in Foster et al. 2001 (u). |
| Run without HR               | Hours (and pace-zone shares for intensity only)                                                                        | Raw speed ignores hills and wind, so no weighted points.                                                                                                                                                                                                                                                                   |
| Ride with neither            | Hours                                                                                                                  |                                                                                                                                                                                                                                                                                                                            |

Rejected: **Banister TRIMP** (1975/1991; duration x dHR ratio x 0.64e^(1.92x) men, 0.86e^(1.67x)
women) needs resting HR and a sex-specific lactate fit from a small sample; **TSS/NP/IF** need 30 s
rolling fourth-power means the digest does not keep, and are a TrainingPeaks product; **sRPE** needs
RPE we do not collect. Lucia et al. 2003's three-zone TRIMP would need lab thresholds.

**Basis rule (per sport, per comparison):** ride kJ -> HR points -> hours; use the first basis that
covers at least 80% of moving time in _both_ windows being compared (so buying a power meter 3 weeks
ago falls back to HR, not to a fake jump). Activities with HR set aside by `trustedHeartRate` count as
having no HR. Every view prints coverage: "kJ from 22 of 25 rides (91% of ride hours); 3 without
power".

## 2. Short against long: sentences, no curves

Windows are local calendar days (as periods are), anchored at the **period's end date**, not today, so
a holiday never looks like a collapse. A = last 7 days; B = the 28 days before, averaged per week.
Shown only if B has at least 6 activities and 1.5 h a week; "changed" needs |A/(B/4) - 1| >= 25%
(same threshold as `CHANGE_MIN_FRACTION`), else the line says it is steady. Ramp: the four trailing
7-day totals, named only when they rose (or fell) in each step and by 25% overall.

Uncoupled, as Lolli et al. 2019 (u) require (A is not inside B). No "sweet spot", "danger zone" or
injury claim: Gabbett 2016's bands are contested (Impellizzeri et al. 2020 (u)).

**Impulse-response (CTL/ATL/form, Banister fitness-fatigue): not built.** Its time constants (42/7
days) are conventions, fitted versions have wide parameter uncertainty (Hellard 2006 (u)), and its
output is read as "fitness" and "form", which this product refuses to score and which would sit
beside, and contradict, demonstrated bests. A 7-against-28 window is the same information with its
arithmetic visible. Revisit only as research: fit it to the athlete's _own demonstrated bests_ in the
corpus, and ship only if held-out error beats "last month's best".

## 3. Intensity distribution

Time shares from the digest's distributions, classified by bin midpoint against
`zonesAt(activity.startMs, ...)`. Three bands, defined on the page: **easy** = power levels 1-2 (< 75%
threshold) / HR zones 1-2 (< 70% max) / pace zones 1-2; **middle** = levels 3-4 / HR 3-4 / pace 3-4;
**hard** = level 5+ / HR 5 / pace 5. Sports are separate. The HR cut is rough (Seiler's boundary is the
first lactate threshold, often 75-80% of max), so the page prints the cuts and says "by heart rate".

Does it say something new? Yes, where hours cannot: equal hours, different effort ("hours flat, hard
time doubled"), and the share of easy time (Seiler and Kjerland 2006; Seiler 2010; Stoggl and Sperlich
2014 (u): about 75-80% easy in studied elite endurance athletes). Name a pattern ("polarised": easy >=
75% and hard > middle; "pyramidal": easy > middle > hard; else "threshold-heavy" when middle >= easy)
only with the cuts shown and 5+ hours of covered time; otherwise show shares only. No Polarization
Index number (Treff 2019 (u)): it is unstable when middle is near 0.

## 4. Where it lives, and the ledes

Not a new tab (a tab becomes a dashboard). **Sport pages** get a "Load" section: change sentence, ramp
sentence, a stacked share bar with a table (zone, hours, share, kJ or points), coverage and
zone-source lines, link to Profile zones. **Balance** gets one line per sport under the weekly-volume
caption, shown only when the change is found (never "steady" filler on Balance). Later: a per-activity
line on the activity page (cheap; same row).

- Change (power): "Ride, 7 days to 14 Jun: 3,100 kJ in 5.2 h, 24% above the 2,500 kJ a week of the 4
  weeks before."
- Change (HR): "Run, 7 days to 14 Jun: 310 heart-rate points in 3.1 h, 40% above the 220 a week
  before."
- No evidence: "Run, 7 days to 14 Jun: 3.1 h, 18% above the 2.6 h a week before; no heart rate, so
  hours only."
- Steady: "Ride load is steady: 3,100 kJ in the 7 days to 14 Jun, within 25% of the 4 weeks before."
- Ramp: "Weekly ride work has risen three weeks running: 2,100, 2,600, 3,100 kJ."
- Intensity: "Over these 12 weeks 81% of your riding time was easy (under 75% of threshold power), 13%
  middle, 6% hard." Or, when the hard share moved 5+ points between halves: "Hard riding rose from
  4% of your time in the first half to 9% in the second."
- Sparse: "Not enough yet: 2 weeks with a covered ride; a comparison needs the 4 weeks before the last 7
  days."

## 5. Dated zones and performance

Per activity: `zonesAt(startMs, settings, estimates)` picks entered dated settings in force on that
day; estimated references have no date, so they apply to every date and are labelled "from today's
estimate". Estimates come from the **whole-library** analysis, not the selected period, or shares
would change when the period control moves. The page names the source for each reference and the date
an entered value took effect. A new best effort can raise the estimated max HR and reclassify
history; the zone-source line states this.

A `LoadRow` per digest (startMs, sport, seconds per zone for each measure, kJ, points, covered
seconds) is memoised on (digest id, model revision, reference tuple). Periods, halves, weeks and
windows are sums over rows (one pass, bucketed). Cost for 2,000 activities: about 600k bin steps plus
8,000 small zone sets, a few ms, so computed in the worker beside the other period evidence and
carried in session state (the late-effort pattern); target < 30 ms, with a perf test. Digests made
before #130 lack distributions: excluded and counted in the coverage line.

## 6. Not shown

A combined score or summed points across sports; fitness/fatigue/form curves; ACWR bands, injury
risk, readiness, rest advice; TSS/NP/IF; TRIMP; calories; kJ or load from estimated power; points for
runs from pace; load from set-aside HR; targets or plans; daily calendars and streaks. Each either
needs an input we do not have, makes a claim the evidence does not support, or breaks a vision
commitment.

## 7. Plan (parallel streams; contract first, then independent review of every PR)

0. Merge the zones work (done, #133). Write `packages/core/src/load/types.ts` (`LoadRow`, `Basis`,
   `Window`, `Coverage`) and `docs/research/training-load.md`.
1. In parallel: **A** `loadRow.ts` (zone split, Edwards points with the 50% floor, kJ); **B**
   `loadWindows.ts` (windows, ramp, basis rule, coverage, halves); **C** `intensity.ts` (bands,
   shares, pattern rule); **D** `apps/web/src/ui/loadCaption.ts` (all ledes as pure text, like
   `volumeCaption`).
2. **E** worker and session-state wiring (on the module registry of [architecture-1.md](architecture-1.md), if built by then); then in parallel **F**
   sport-page Load section (stacked bar plus table, run coral and ride blue), **G** Balance lines,
   Method and CalculatedSection entries, DESIGN.md.
3. **H** activity-page line; **I** research spike on impulse-response against demonstrated bests.

Tests: hand-computed fixtures (a 1-hour ride with a known spread gives exactly N kJ and M points);
bin-edge and cut-straddling cases; dated-zone boundary (activity the day before and the day of a new
threshold); kJ from digest equals the raw stream sum within 1% on corpus files, and zone seconds equal
raw-stream seconds within one bin; property tests (zone seconds sum to covered seconds, weeks sum to
total, order-independence, local-day windows across DST); every caption branch and a copy lint (no
"fitness", "score", "risk"); `test:perf` for 2,000 digests; a screenshot check at phone width.

## Decisions

Design calls, recorded so later work keeps them (changing one needs the owner again):

1. **Heart-rate points (Edwards) are in**, used where HR is trusted; no weights beyond the five zones.
2. **Patterns are named** (polarised, pyramidal, threshold-heavy) only with the cuts shown and at
   least 5 hours of covered time; otherwise shares only.
3. **Easy/middle/hard cuts for HR** are 70% and 90% of max, printed on the page.
4. **Estimated references come from the whole library**, and history may reclassify when an estimate
   moves; the zone-source line says so.
5. **Thresholds stand:** 25% for a change, 80% coverage for the basis rule, 6 activities in the
   comparison window.
6. **No re-digest from stored originals.** Digests without distributions are excluded and counted in
   the coverage line; re-importing refreshes them.
7. **Impulse-response is closed as a product feature** and kept only as the research spike (item I).
8. **Balance lines show only when something changed**, never "steady" filler.
9. **Per sport only.** kJ for power-meter rides, Edwards points where HR is trusted, hours otherwise;
   never summed across sports.
