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

| Stage | Work                                                                                                                                                                                                                      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A     | Shipped (release 3e17b541, see [RELEASES.md](../RELEASES.md)): dated settings and zones, time in zones, the activity workbench, durability and drift, weekly volume, walking pace, performance, audit fixes.              |
| B     | In progress: the visual system, the home screen (Balance), the first impression, and operations quick wins (CI split, release tags and ledger, build id in health, access log, docs drift).                               |
| C     | Findings v1 ([findings.md](findings.md)) and a persistent "what changed" ledger, so a finding is shown once and its change over time is kept.                                                                             |
| D     | A read-only MCP server per account: OAuth sign-in, read-only tools over the stored digests, and an evaluation of what a model gets right with them.                                                                       |
| E     | A discipline registry (the sport seam, so shared code has no run or ride literals), lifting through Hevy CSV import, and an interference analysis, for example long runs grouped by hours since the last lower-body lift. |
| Later | Same-route ([same-route.md](same-route.md)), a watch folder for new files, and swimming when a swimmer asks. Training load ([training-load.md](training-load.md)) stays designed and unscheduled.                         |

## Deferred

- **Strava sync** waits for a written answer on API policy section 6.2, which limits how long Strava
  data may be cached (seven days). Server-held tokens, a webhook and server-side digesting are not
  started until that is answered.
- **Architecture I** (a local originals store, an analysis-module registry, a unified local storage
  layer; [architecture-1.md](architecture-1.md)) is built when findings need it, not before. Until
  then the bespoke IndexedDB stores stay.
