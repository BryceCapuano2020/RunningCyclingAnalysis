# Design records

Designs written before the code, kept so later work follows the same decisions. Each ends with a
Decisions section. Status is one of designed, in progress or built.

- [same-route.md](same-route.md): repeat routes and climbs, matched on device, with progress on a
  fixed course. Status: in progress.
- [findings.md](findings.md): a findings engine that speaks only when something non-obvious is well
  supported. Status: in progress.
- [fitness.md](fitness.md): fitness at the same effort per sport, slipping to back, with its evidence. Status:
  core built, page not yet.
- [training-load.md](training-load.md): load per sport and short-against-long sentences, no fitness
  or fatigue curves. Status: designed.
- [architecture-1.md](architecture-1.md): a local originals store, an analysis-module registry and a
  unified local storage layer. Status: designed, deferred until findings need it.

## Stage plan

Between stages: quality, security and privacy review, a smoke test on a real local export (never
committed), hardening, performance and accessibility gates. Fix what is material, then move on.

| Stage | Work                                                                                                                                                                                                                                                                                                                       |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A     | Shipped (release 3e17b541, see [RELEASES.md](../RELEASES.md)): dated settings and zones, time in zones, the activity workbench, durability and drift, weekly volume, walking pace, performance, audit fixes.                                                                                                               |
| B     | Shipped (releases c9d9cb9b and 9fdb7f91): the visual system, the Balance home screen, the first impression, and operations quick wins.                                                                                                                                                                                     |
| C     | Shipped (release 96043823): fitness at the same heart rate per sport ([fitness.md](fitness.md)), reference max heart rate from three days, zones from current fitness.                                                                                                                                                     |
| D     | In progress: the 29 Oct audit fixes (effort evidence, one calibrated change test, capped ride levels, screened max heart rate, sign-up allowlist, sync integrity), then the "your years" look-back and the "since your last import" check-in. A read-only MCP server follows once findings are stored with their evidence. |
| E     | Lifting, the third dimension: a discipline registry (the sport seam, so shared code has no run or ride literals), lifting through Hevy CSV import and an in-app logger, and an interference analysis, for example long runs grouped by hours since the last lower-body lift.                                               |
| Later | Same-route ([same-route.md](same-route.md)), a watch folder for new files, and swimming when a swimmer asks. Training load ([training-load.md](training-load.md)) stays designed and unscheduled.                                                                                                                          |

## Deferred

- **Strava sync** is off the plan: the Strava API Policy in force from 1 June 2026 bars storing
  derived data, AI use and third-party MCP servers over Strava API data, and caps caching at seven
  days. The athlete's own file export stays the main input.
- **Architecture I** (a local originals store, an analysis-module registry, a unified local storage
  layer; [architecture-1.md](architecture-1.md)) is built when findings need it, not before. Until
  then the bespoke IndexedDB stores stay.
