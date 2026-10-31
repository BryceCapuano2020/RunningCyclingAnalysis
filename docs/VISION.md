# Vision

## Where this is going

RunningCyclingAnalysis becomes a platform that estimates an athlete's evolving performance in
running, cycling, strength and swimming. It works from the data people already have: ordinary
activity uploads, simple lifting logs and dated body measurements. It never requires test
protocols or detailed logging: experiments are opt-in, and a lifting log needs only sets, reps and
load.

It extends the existing physics and statistical models to pull useful evidence out of
inconsistent, incomplete data. It uses a model suited to each sport. It always separates what the
athlete has **demonstrated** from what it **estimates** they could do. It tracks how the profile is
shifting, and it says plainly how uncertain each estimate is and what evidence is missing.

## Commitments

1. **Demonstrated is not estimated.** A recorded best effort is a fact about the athlete.
   Capability is a model output with an interval. The UI never blurs the two.
2. **Most efforts are not maximal.** An ordinary run, ride, swim or set is evidence that the
   athlete can do at least that much. Models treat it as a lower bound, not as a measurement of
   capability.
3. **Missing data costs precision, not function.** No power meter, no heart rate, a sparse GPS
   track, no RPE or an old body-mass entry each widen the interval. Where the evidence cannot
   support an estimate, the demonstrated value is still shown, as a floor, with the evidence that
   would complete it. No activity leaves the library for missing data.
4. **Evidence ages.** Capability drifts between observations, so uncertainty grows with time since
   the last good evidence, at rates taken from published detraining evidence.
5. **One model per sport, no universal score.** Each discipline is reported in its own natural
   units: critical power, critical speed, critical swim speed, estimated one-rep max. Each is
   tracked against the athlete's own history. Cross-sport comparisons appear only where physics
   makes them meaningful, as the existing running-versus-cycling energy-rate comparison does.
6. **Transparent and reproducible.** Every estimate can show which activities it used, which
   model and assumptions, and why its interval is the width it is. The same inputs give the same
   outputs, bit for bit (seeded, versioned through `MODEL_REVISION`).
7. **No language model inside the product.** Every number comes from statistical and decision
   models. An athlete can connect their own assistant through the MCP connector: it reads checked
   evidence and saves plans, but it never computes or changes a number, and the product itself
   generates no text with a language model.

## The coaching loop

Many athletes already plan their training weeks with a general-purpose assistant, and Strava,
Garmin and Whoop now ship their own AI summaries and coaches. Nothing checks whether what any of
them says about an athlete is true, and no tool understands a hybrid week of running, riding and
lifting.

RCA does not become a coach. It makes the athlete's own assistant accurate:

1. **Read.** The assistant reads checked evidence through the connector: status per sport, recent
   weeks, findings with the activities behind them, and the evidence still missing. Every number it
   states comes from a tool.
2. **Plan.** The assistant writes the week, and the plan is saved to RCA.
3. **Check.** RCA compares the plan with the athlete's own history and reports where it departs
   from it. It gives no rest advice and no readiness score.
4. **Review.** After the week, RCA reports the plan against what was done and what changed.
5. **Learn.** Experiments turn "did it work?" into an answer. The athlete follows A and B weeks,
   and RCA reports the difference with an interval, or says the effect is too small to detect at
   that size. Ordinary training data is noisy: one athlete's weeks resolve only large effects, and
   a protocol pooled across athletes resolves smaller ones, so each experiment states up front the
   smallest effect it can detect.

Every step is measured. An eval scores whether the assistant's stated numbers match the evidence.
A benchmark built on synthetic athletes with planted changes (a slip, a recovery, a device change,
a lifting block) scores any system that makes claims about training data, and is published once
plan checks exist.

## Architecture direction

Every discipline plugs into one small, shared shape, so adding a sport adds a module rather than
complexity everywhere.

```
source data ──► importer ──► Evidence[] ──► discipline model ──► Estimate ──► UI card
 (FIT, GPX,      (per format)  (per activity,   (per sport)        (demonstrated,
  TCX, CSV,                     settings-free)                      capability ± interval,
  manual log)                                                       trend, evidence gaps)
```

- **Evidence** is the existing digest idea, generalised. It is what one activity or log entry
  shows, independent of user settings: a best-effort curve, a lift set, a swim length series, a
  body measurement. Each item carries its quality flags and whether it is likely maximal or only a
  lower bound.
- **Discipline models** (`packages/core/src/disciplines/<sport>/`) turn Evidence into an Estimate.
  Each owns its own physiology and is tested against independent references and real files.
- **A shared timeline engine** turns dated estimates into a trajectory with intervals that widen
  between observations. Disciplines supply the observation model; the engine is shared.
- **Body measurements** are dated. A W/kg or relative-strength figure uses the mass on the
  activity's date, not today's.
- **Estimate** is one shared type: demonstrated values, capability with an interval, trend, and a
  list of evidence gaps in plain language ("no ride over 20 minutes in the last 8 weeks").
- **The evidence ledger** stores each checked claim with its interval, the activities behind it
  and the model revision. The app, the MCP connector and the eval all read it. It syncs with the
  library, so the connector serves what the browser computed and never recomputes it.

The current running and cycling code becomes the first two disciplines. That move is a refactor,
not a rewrite.

## Phases

The phases describe capabilities. The order of work is the stage plan in
[design/README.md](design/README.md), which also records what has shipped.

1. **Foundations.** Shipped: dated body measurements (W/kg at the activity's date), and
   demonstrated values reported separately from capability. In stage D: best efforts count as
   capability only with evidence of a hard effort, and are otherwise shown as a floor. The shared
   `Evidence` and `Estimate` types are superseded by the evidence ledger (stage E).
2. **Evolving capability.** Fitness at the same heart rate per sport (stage C) and one calibrated
   change test (stage D) replace the per-period rolling best. Still to come: a capability trajectory
   whose interval widens between observations, and an evidence-gap line on every card.
3. **Strength, the third dimension.** Simple lifting logs (an in-app logger first, then earlier
   notes, common app CSV exports and FIT strength sets) and estimated one-rep max per lift, with
   intervals, using body mass for relative strength. Lifting sits beside running and riding in one
   week, so its effect on them can be measured.
4. **Swimming.** Pool-swim FIT parsing (lengths, laps, pool size) and critical swim speed from
   ordinary swims, freestyle first.
5. **Profile.** One page with a card per discipline, each showing its own trend, evidence and gaps.
   It has no composite score.

Research notes behind each model choice live in [research/](research/). Engineering rules are in
[ENGINEERING.md](ENGINEERING.md), and the detailed backlog is in [ROADMAP.md](ROADMAP.md).
