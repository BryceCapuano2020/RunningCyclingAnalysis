# Roadmap

Planned work, grouped by the phases in [VISION.md](VISION.md), then by model accuracy, input
formats, operations and engineering. Shipped behaviour is in the [README](../README.md), and the
design is in [ARCHITECTURE.md](ARCHITECTURE.md). Open review findings are in [REVIEWS.md](REVIEWS.md).

## Phase 1: Foundations

- **Dated body measurements.** A mass history, so W/kg and relative strength use the mass on each
  activity's date.
- **Evidence and Estimate types.** One shared shape that every importer and discipline model uses.
- **Demonstrated versus estimated.** Running and cycling report recorded best efforts separately
  from capability, and the UI never blurs the two.
- **Lower-bound treatment.** An ordinary effort is a lower bound on capability, not a measurement
  of it.

## Phase 2: Evolving capability

Today the fitness trend is a 42-day rolling best (PR #17).

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

- **Lifting logs** from manual entry, common app CSV exports and FIT strength sets.
- **Estimated one-rep max per lift**, with an interval, relative to body mass on the lift's date.
  It keeps its own units and is not placed on a shared axis with energy rate. Research:
  [strength.md](research/strength.md).

## Phase 5: Profile

- **One page, a card per discipline**, each with its own trend, evidence and gaps. No composite
  score.
- **Public links** (future, opt-in only). Today sharing is the downloaded image (PR #15).

## Model accuracy

1. **Running-versus-cycling bias (headline).** [validation/physiology.md](validation/physiology.md)
   finds flat running about 13% below the ACSM equation, and matched-effort
   running at 0.79 to 0.86 of cycling. Parity falls outside the 90% range at 3, 4 and 5 m/s. Most of
   the gap is attributed to the running slope. The economy prior (mean 1.0) sits below the
   ACSM-implied scale of about 1.16. Cycling reads 25% low at 1 W/kg, because it has no resting term.
   A literature-based correction is proposed in
   [research/headline-bias.md](research/headline-bias.md).
   Next: check the running slope and its gross or net basis against primary text before changing
   the prior or the slope.
2. **Running air resistance.** Research: [running-air-resistance.md](research/running-air-resistance.md).
   Define the mechanical-to-metabolic conversion before adding a drag correction or prior. A
   mechanical drag term cannot be added to gross metabolic power.
3. **Cycling efficiency and the gross-efficiency prior.** Research:
   [cycling-efficiency.md](research/cycling-efficiency.md). Reconcile gross, net and delta
   efficiency against primary literature, then widen the prior (0.215, sd 0.012) in the same change.
   The additive resting-energy formula proposed earlier is not approved; the note shows it
   double-counts resting energy.
4. **Heart-rate discrepancy (0.05).** Validate it on independent athletes and conditions. The
   proposed 0.12 is a hypothesis. Do not tune the value to recover the simulator's own data.
5. **Effective-sample-size threshold.** The 20-draw and 1% rule is in place. Validate it on
   independent data.
6. **Done: sport-specific all-out heart-rate reference, signed virtual-power bias and altitude-aware
   air density (model revision 4).**

## Input formats

1. **CSV.** Strava CSV summaries, and the lifting CSV exports used in Phase 4.
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
9. **Done: browser-side rebuild of saved libraries from retained originals.**

## Engineering

1. **Remove dead exports.** Trim exports no app uses, so each package's public surface is what the
   apps depend on.
2. **Shared chart scaffolding.** Finish consolidating the axis, hover and frame code the charts still
   repeat.
