# Vision

## Where this is going

RunningCyclingAnalysis becomes a platform that estimates an athlete's evolving performance in
running, cycling, strength and swimming. It works from the data people already have: ordinary
activity uploads, simple lifting logs and dated body measurements. It never asks for test
protocols or detailed logging.

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
   track, no RPE or an old body-mass entry each widen the interval. None of them removes the
   analysis.
4. **Evidence ages.** Capability drifts between observations, so uncertainty grows with time since
   the last good evidence, at rates taken from published detraining evidence.
5. **One model per sport, no universal score.** Each discipline is reported in its own natural
   units: critical power, critical speed, critical swim speed, estimated one-rep max. Each is
   tracked against the athlete's own history. Cross-sport comparisons appear only where physics
   makes them meaningful, as the existing running-versus-cycling energy-rate comparison does.
6. **Transparent and reproducible.** Every estimate can show which activities it used, which
   model and assumptions, and why its interval is the width it is. The same inputs give the same
   outputs, bit for bit (seeded, versioned through `MODEL_REVISION`).
7. **No LLMs in the product.** Statistical and decision models are fine; generative language
   models are not.

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

The current running and cycling code becomes the first two disciplines. That move is a refactor,
not a rewrite.

## Phases

Each phase ships on its own and leaves the app more useful.

1. **Foundations.**
   - Dated body measurements: mass history, with W/kg taken at the activity's date.
   - Shared `Evidence` and `Estimate` types.
   - Running and cycling report demonstrated values separately from capability.
   - Best efforts are treated as lower bounds.
2. **Evolving capability.** The shared timeline engine replaces the 42-day rolling best with a
   capability trajectory and intervals. Each card lists its evidence gaps.
3. **Swimming.** Pool-swim FIT parsing (lengths, laps, pool size) and critical swim speed from
   ordinary swims, freestyle first.
4. **Strength.** Simple lifting logs (manual entry, common app CSV exports, FIT strength sets) and
   estimated one-rep max per lift, with intervals, using body mass for relative strength.
5. **Profile.** One page with a card per discipline, each showing its own trend, evidence and gaps.
   It has no composite score.

Research notes behind each model choice live in [research/](research/). Engineering rules are in
[ENGINEERING.md](ENGINEERING.md), and the detailed backlog is in [ROADMAP.md](ROADMAP.md).
