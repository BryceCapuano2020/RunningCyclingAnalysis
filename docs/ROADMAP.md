# Roadmap

Planned work, grouped by the phases and the coaching loop in [VISION.md](VISION.md), then by model
accuracy, input formats, operations and engineering. Shipped behaviour is in the [README](../README.md), and the
design is in [ARCHITECTURE.md](ARCHITECTURE.md). Open review findings are in [REVIEWS.md](REVIEWS.md).

The order of work is the stage plan in [design/README.md](design/README.md). Stage C shipped the
fitness status at the same heart rate. Stage D (in progress) fixes the claims the 29 Oct audit found
over-stated (effort evidence before a best counts as capability, one calibrated change test, capped
ride levels, a screened max heart rate), turns on ride fitness, makes model revisions safe for saved
libraries (then revision 7: temperature for the seasonal fitness term, the local day, a cadence-lock
flag), and moves the front door to two jobs the data path can serve: a "your years" look-back at
first import and a "since your last import" check-in, with incremental re-import. After stage D the order follows the coaching loop: stages E and F run in parallel, then
G and H.

Decided on 30 Oct 2026:

- **Strava API sync is off the plan.** The Strava API Policy in force from 1 June 2026 bars storing
  derived data, AI use and third-party MCP servers over Strava API data, and caps caching at seven
  days. An athlete's own file export is not covered by it and stays the main input.
- **The coaching loop orders the work after stage D** ([VISION.md](VISION.md#the-coaching-loop)).
  The athlete's own assistant reads checked evidence and saves weekly plans (stage E), lifting joins
  (stage F), saved plans are checked against the athlete's history (stage G), and experiments test
  what works (stage H). The product still runs no language model.
- **A fresh-data path is part of stage E:** a watched folder of new watch files with incremental
  import, because weekly planning needs last week's data. Weekly early warning follows from it;
  until then the fitness status is read at each import. Browsers keep folder access only on
  Chromium desktop today, and many watches sync to a phone without leaving a file on the computer,
  so stage E starts by checking where testers' files actually land; where there is no local file,
  the loop falls back to a periodic re-import.
- **The MCP connector is built on the evidence ledger in stage E.** It runs on the Worker so it
  works from an assistant's phone, desktop and web apps: Google sign-in, allowlisted accounts, read
  tools plus saving a weekly plan, its own consent line, and off until the athlete connects it. The
  ledger syncs with the library, because analysis runs in the browser and the connector serves
  those results rather than recomputing them.
- **Lifting is the third dimension, after running and cycling** (stage F, in parallel with E, ahead
  of swimming). The in-app logger comes first, then a one-time import of earlier history.
- Same-route, race ranges, swimming, the local originals store and the module registry come later.

## Phase 1: Foundations

- **Done: dated body measurements** (#133): dated weight, max heart rate and threshold, so each
  activity uses the setting in effect on its day. Relative strength waits for lifting.
- **Done: demonstrated versus estimated.** Running and cycling report recorded best efforts
  separately from capability.
- **Lower-bound treatment (stage D).** A best counts as capability only with evidence of a hard
  effort; otherwise it is shown as a floor ("at least") with the effort that would complete it.
- **Evidence and Estimate types.** Superseded by the evidence ledger (stage E), which every claim
  passes through.

## Phase 2: Evolving capability

- **Done: fitness at the same heart rate** (stage C): slipping, holding, recovering and back per
  sport, with its evidence ([fitness.md](design/fitness.md)).
- **One calibrated change test (stage D).** Every "this changed" sentence uses one test calibrated
  on the athlete's own library, and the best-of-window weekly trend is retired.
- **Timeline engine.** A capability trajectory whose interval widens between observations.
- **Evidence gaps on every card**, in plain language, such as "no ride over 20 minutes in the last
  8 weeks". Research: [evolving-capability.md](research/evolving-capability.md) and
  [capability-from-field-data.md](research/capability-from-field-data.md).

## Phase 3: Strength, the third dimension

- **Sport as data (stage F, first).** A capability record per sport replaces the run and ride
  literals in shared code, so lifting adds a module rather than edits across the codebase.
- **Lifting logs (stage F).** The in-app logger comes first, with optional session effort (RPE).
  Earlier history follows through a plain lifting CSV, which an athlete's assistant can fill from
  their notes and RCA validates on import, then common app CSV exports (Hevy first) and FIT
  strength sets. Open: whether the assistant may also save lift logs through the connector.
- **Estimated one-rep max per lift**, with an interval, relative to body mass on the lift's date.
  It keeps its own units and is not placed on a shared axis with energy rate. Research:
  [strength.md](research/strength.md).
- **Weekly load by system** (aerobic, legs, upper body), each shown per sport side by side and never
  summed into one number ([training-load.md](design/training-load.md) section 6 still holds).
- **Interference analysis** against runs and rides, for example long runs grouped by hours since
  the last lower-body lift.
- **Lifting in the connector.** The assistant reads lifts and estimated maxima with the same kind of
  tools as runs and rides.

## Phase 4: Swimming

- **Pool swims from FIT.** Lengths, laps and pool size.
- **Critical swim speed** from ordinary swims, freestyle first. Research:
  [swimming.md](research/swimming.md).

## Phase 5: Profile

- **One page, a card per discipline**, each with its own trend, evidence and gaps. No composite
  score.
- **Done: age-graded levels** on the Run and Ride cards. Each run is graded against the USATF
  2025 road standards, and each ride through its equal-energy running equivalent. The ride level is
  model-derived; in stage D a ride at the top of the age tables reads as the top of the scale.
  Research: [age-grading.md](research/age-grading.md).
- **Public links** (future, opt-in only). Today sharing is the downloaded image (PR #15).

## Product edge

Most per-sport numbers are free elsewhere and update by themselves. RCA's edge is the quality of its
evidence: effort gates, ranges and plain refusals, read across many years and many devices from the
athlete's own files. Build for that edge. Don't add per-sport charts that other apps already give
away. The MCP stage waits for a small, stable evidence ledger of findings with ranges and provenance;
it does not serve raw digests (audit RCA-017).

## Coaching loop

The order is stages E, G and H in [design/README.md](design/README.md). Lifting (stage F) is Phase 3.

- **Evidence ledger (stage E).** Each checked claim with its interval, the activities behind it and
  the model revision. It syncs with the library.
- **MCP connector (stage E).** Tools for status per sport, recent weeks by sport, findings with
  their evidence, evidence gaps and a planning-context bundle, plus saving a weekly plan. Saved
  plans build history from the first week, before stage G checks them.
- **Watched folder (stage E).** New watch files are imported incrementally, in browsers that can
  keep folder access.
- **Eval (stage E, extended in G).** Synthetic athletes with planted changes. Version 0 scores
  whether every number the assistant states matches a tool result, and whether it declines when
  the evidence is missing. Version 1 scores how often assistant-written plans contradict the
  athlete's own evidence, with and without the connector. The generator and the scores are
  published after stage G.
- **Plan checks and weekly review (stage G).** Each check compares the saved plan with the athlete's
  history and links the activities it used, for example "3 hard days; the most in any week this
  year was 2". No rest advice, readiness score or injury risk
  ([training-load.md](design/training-load.md) section 6).
- **Experiments (stage H).** Each experiment states the smallest effect it can detect from the
  athlete's own noise before it starts. Templates (lower-body lift timing before long runs, an easy-volume
  block, easy-day discipline), the weeks needed from the athlete's own noise, A and B weeks
  scheduled through saved plans, adherence, and a result with an interval or "not detectable at
  this size". Friends can run the same protocol and pool summaries only.

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
7. **Running level cost.** The model adds 0.30 J/kg/m to Minetti's fitted intercept of 3.6, so flat
   running costs 3.9. Minetti's measured level cost is 3.40. Changing it moves every run's W/kg and
   so the Balance lean. Decide it with the cross-sport harness, together with item 2.
8. **Altitude noise on hills (B-34).** Noisy elevation adds false climbing and descending, and the
   cost curve is convex, so the noise does not cancel. Measure it on real files before correcting it.

## Input formats

1. **CSV.** Strava CSV summaries, the plain lifting CSV and the app exports used in Phase 3 (Hevy
   first). Strava sync through its API is off the plan (see above).
2. **Apple Health export.** Workouts and dated body mass, parsed with the streaming XML scanner in
   `packages/core/src/xml`.
3. **FIT memory.** Real device fixtures are now in `packages/core/test-corpus`. Remaining: stream
   accepted records into per-activity processing to reduce retained data
   ([PERFORMANCE.md](PERFORMANCE.md)).
4. **Done: GPX and TCX import (PR #13).** GPS-derived speed makes short efforts less reliable than FIT.
5. **Ask for the sport on a typeless GPX.** A GPX with no activity type is read by its speed today.
   A short prompt at import would remove the guess. It changes no digest.

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
11. **Automatic background update.** Update now runs only when the athlete presses it. Starting the
    same rebuild by itself after a library loads is not wired: a rebuild replaces a digest and keeps
    no copy of the old one, so it should wait until the owner has rebuilt a library by hand and
    checked the result.

## Engineering

1. **Detail for the whole library (RCA-046).** The 64 MiB detail budget leaves most of a multi-year
   library without a workbench. Keep a compact summary for every activity, rebuild full traces on
   demand from originals, count only detail that is stored, and name the real reason when detail is
   missing.
2. **Originals kept by default.** Keeping original files lets a model change rebuild a library with no
   re-import. It is decided (Architecture I) but not yet the account default.
3. **Remove dead exports.** Trim exports no app uses, so each package's public surface is what the
   apps depend on. The Stage D gate's list is done, except `analyze` (core/pipeline.ts) and `buildAccountExport`, which
   tests still use as a reference.
4. **Shared chart scaffolding.** Finish consolidating the axis, hover and frame code the charts still
   repeat.
5. **Move the grading and ride-cap rules to core (before the stage E connector).** The age-grade
   levels, the ride ceiling and the level-target solver live in the web app (`ui/grades.ts`,
   `ui/levelTarget.ts`, `ui/levelSolver.ts`). Stage E's connector needs the same rules, so they belong in
   `packages/core`, not in a second copy. Move them with their tests.
6. **Split the two largest test files.** `worker/analysis.worker.test.ts` and
   `ui/useAnalysis.test.ts` are each over 3,700 lines. Split them by behaviour into files under 400
   lines. Not started.
