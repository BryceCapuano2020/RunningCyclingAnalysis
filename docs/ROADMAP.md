# Roadmap

Planned work, grouped by the phases in [VISION.md](VISION.md), then by model accuracy, input
formats, operations and engineering. Shipped behaviour is in the [README](../README.md), and the
design is in [ARCHITECTURE.md](ARCHITECTURE.md). Open review findings are in [REVIEWS.md](REVIEWS.md).

The order of work is the stage plan in [design/README.md](design/README.md). Stage C shipped the
fitness status at the same heart rate. Stage D (in progress) fixes the claims the 29 Oct audit found
over-stated (effort evidence before a best counts as capability, one calibrated change test, capped
ride levels, a screened max heart rate) and moves the front door to two jobs the data path can serve:
a "your years" look-back at first import and a "since your last import" check-in, with incremental
re-import.

Decided on 30 Oct 2026:

- **Strava API sync is off the plan.** The Strava API Policy in force from 1 June 2026 bars storing
  derived data, AI use and third-party MCP servers over Strava API data, and caps caching at seven
  days. An athlete's own file export is not covered by it and stays the main input.
- **Weekly early warning waits for a fresh-data path** (a watch folder or a device API). Until then
  the fitness status is read at each import.
- **The MCP server waits for a checked-findings store** (an evidence ledger in core with provenance),
  so it serves calibrated findings rather than raw summaries.
- Same-route, swimming, lifting, the local originals store and the module registry come later.

## Phase 1: Foundations

- **Dated body measurements.** Shipped in #133: dated weight, max heart rate and threshold, so each
  activity uses the setting in effect on its day. Relative strength waits for lifting.
- **Evidence and Estimate types.** One shared shape that every importer and discipline model uses.
- **Demonstrated versus estimated.** Running and cycling report recorded best efforts separately
  from capability, and the UI never blurs the two.
- **Lower-bound treatment.** An ordinary effort is a lower bound on capability, not a measurement
  of it.

## Phase 2: Evolving capability

Today the fitness trend is a rolling best over a window of a third of the selected period, between
one week and 42 days; all time uses 42 days (PR #17).

- **Timeline engine.** One engine turns dated Estimates into a trajectory with intervals that widen
  between observations. It replaces the rolling best.
- **Evidence gaps on every card**, in plain language, such as "no ride over 20 minutes in the last
  8 weeks". Research: [evolving-capability.md](research/evolving-capability.md) and
  [capability-from-field-data.md](research/capability-from-field-data.md).

## Phase 3: Swimming

- **Pool swims from FIT.** Lengths, laps and pool size.
- **Critical swim speed** from ordinary swims, freestyle first. Research:
  [swimming.md](research/swimming.md).

## Phase 4: Strength

- **Lifting logs** from manual entry, common app CSV exports and FIT strength sets. Hevy CSV import
  comes first (stage E), with an interference analysis against runs and rides.
- **Estimated one-rep max per lift**, with an interval, relative to body mass on the lift's date.
  It keeps its own units and is not placed on a shared axis with energy rate. Research:
  [strength.md](research/strength.md).

## Phase 5: Profile

- **One page, a card per discipline**, each with its own trend, evidence and gaps. No composite
  score.
- **Age-graded levels** (coming to the Run and Ride cards). Each run is graded against the USATF
  2025 road standards, and each ride through its equal-energy running equivalent. The ride level is
  model-derived. Research: [age-grading.md](research/age-grading.md).
- **Public links** (future, opt-in only). Today sharing is the downloaded image (PR #15).

## Model accuracy

1. **Done for running: running-versus-cycling bias (headline).** The running level is corrected to
   3.9 J/kg/m (model revision 5), and flat running is now 6% below ACSM and within 2% of Léger &
   Mercier ([validation/physiology.md](validation/physiology.md) §10). Still open, the cycling slope:
   constant gross efficiency reads cycling about 10% high at 5 W/kg, so matched-effort parity at 5 m/s
   sits at the edge of the 90% range (0.999). The power-dependent efficiency slope GE(P) is the fix,
   and it is not implemented ([research/headline-bias.md](research/headline-bias.md) §5b).
   Cycling also reads 25% low at 1 W/kg, because it has no resting term.
2. **Running air resistance.** Research: [running-air-resistance.md](research/running-air-resistance.md).
   Define the mechanical-to-metabolic conversion before adding a drag correction or prior. A
   mechanical drag term cannot be added to gross metabolic power.
3. **Cycling efficiency and the gross-efficiency prior.** Research:
   [cycling-efficiency.md](research/cycling-efficiency.md). The prior is widened to sd 0.015 (mean
   0.215) in model revision 5. Still open: reconcile gross, net and delta efficiency against primary
   literature.
   The additive resting-energy formula proposed earlier is not approved; the note shows it
   double-counts resting energy.
4. **Heart-rate discrepancy (0.05).** Validate it on independent athletes and conditions. The
   proposed 0.12 is a hypothesis. Do not tune the value to recover the simulator's own data.
5. **Effective-sample-size threshold.** The 20-draw and 1% rule is in place. Validate it on
   independent data.
6. **Done: sport-specific all-out heart-rate reference, signed virtual-power bias and altitude-aware
   air density (model revision 4).**

## Input formats

1. **CSV.** Strava CSV summaries, and the lifting CSV exports used in Phase 4 (Hevy first).
   Strava sync through its API is off the plan (see above).
2. **Apple Health export.** Workouts and dated body mass, parsed with the streaming XML scanner in
   `packages/core/src/xml`.
3. **FIT memory.** Real device fixtures are now in `packages/core/test-corpus`. Remaining: stream
   accepted records into per-activity processing to reduce retained data
   ([PERFORMANCE.md](PERFORMANCE.md)).
4. **Done: GPX and TCX import (PR #13).** GPS-derived speed makes short efforts less reliable than FIT.

## Activity labelling (opt-in)

Labels would let the headline exclude e-bike rides and treat race efforts as all-out.

1. **Opt-in classifier on titles and summary numbers only**, never per-second data. Each upload needs
   its own opt-in, and the opt-in must name any hosted service.
2. **Benchmark first.** Score Decision-1, a cheap decision model, against a keyword baseline on about
   200 hand-labelled activities. Ship the keyword baseline if it is as good.

## Operations

1. **Enable backups.** Create the age key pair on the owner's machine, commit the public key to
   `ops/backup-recipient.txt` through a pull request, set the `backup` environment secrets, then set
   `RCA_BACKUP_ENABLED`. Steps are in [PRODUCTION.md](PRODUCTION.md#setting-up-backups-owner).
2. **Enable uptime.** Test the outage path by hand with `simulate_outage`, then set `RCA_UPTIME_ENABLED`.
3. **Restore drill.** Run [scripts/ops/restore.md](../scripts/ops/restore.md) as a recorded drill on a
   populated database with matching originals, measured against the 2-hour RTO. Add a deletion log so
   restores can reconcile deleted accounts.
4. **Gated production deploys.** Deploy production through `deploy.yml` once its `production`
   environment and secrets exist.
5. **Digest-quota reconciliation.** After the new Worker serves all traffic, run the reconciliation
   SQL in [PRODUCTION.md](PRODUCTION.md) and record the result.
6. **Measurements.** Time large exports on target phones and measure production Worker CPU. This
   gates server-side re-analysis.
7. **Google public brand.** Complete Google's verification requirements. Sign-in is still External and
   Testing.
8. **Done: release gate, pinned actions, atomic quotas, R2 budgets and rate limits.**
9. **Done: release ledger ([RELEASES.md](RELEASES.md)), tagged releases, the build id in
   `/api/health`, a post-deploy smoke test that sends no mutating requests, a sampled structured
   access log and a separate CI job for timing budgets.**
10. **Done: browser-side rebuild of saved libraries from retained originals.**

## Engineering

1. **Remove dead exports.** Trim exports no app uses, so each package's public surface is what the
   apps depend on.
2. **Shared chart scaffolding.** Finish consolidating the axis, hover and frame code the charts still
   repeat.
