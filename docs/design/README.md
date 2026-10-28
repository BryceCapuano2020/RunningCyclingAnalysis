# Design records

Designs written before the code, kept so later work follows the same decisions. Each ends with a
Decisions section. Status is one of designed, in progress or built.

- [same-route.md](same-route.md): repeat routes and climbs, matched on device, with progress on a
  fixed course. Status: in progress.
- [findings.md](findings.md): a findings engine that speaks only when something non-obvious is well
  supported. Status: in progress.
- [training-load.md](training-load.md): load per sport and short-against-long sentences, no fitness
  or fatigue curves. Status: designed.

## Stage plan

Between stages: quality, security and privacy review, a smoke test on a real local export (never
committed), hardening, performance and accessibility gates. Fix what is material, then move on.

| Stage | Work                                                                                                                                                                                                                                                            |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A     | Current wave: dated settings and zones, time in zones, performance, audit fixes.                                                                                                                                                                                |
| B     | Architecture I: a local originals store in OPFS so model upgrades recompute without re-import; an analysis-module registry replacing the growing `SessionState` with lazy cached modules; a unified local storage layer replacing the bespoke IndexedDB stores. |
| C     | Routes ([same-route.md](same-route.md)), built on the stage B layers.                                                                                                                                                                                           |
| D     | Findings engine ([findings.md](findings.md)).                                                                                                                                                                                                                   |
| E     | Training load ([training-load.md](training-load.md)).                                                                                                                                                                                                           |
| F     | Strava sync: server-held tokens, webhook for new activities, rate-limited queue, server-side digesting with the pure core. Requires sign-in; files-only use stays available signed out.                                                                         |
| G     | Architecture II: sport-owned evidence types and analysis, so shared code has no run or ride literals.                                                                                                                                                           |
| H     | Swimming.                                                                                                                                                                                                                                                       |
| I     | Lifting: an in-app set and rep logger plus Hevy import.                                                                                                                                                                                                         |
