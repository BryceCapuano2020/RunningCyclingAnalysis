# RunningCyclingAnalysis

Read before working here:

- [docs/PROCESS.md](docs/PROCESS.md): how agents build, review and merge (the coordinator never
  waits, no local squashes, test slots, short reports).
- [docs/ENGINEERING.md](docs/ENGINEERING.md): the goal and pillars (maintainability first, the
  400-line ratchet, every fix starts with a failing test).
- [docs/DESIGN.md](docs/DESIGN.md) before UI work: read the section you need.
- [docs/design/README.md](docs/design/README.md) for the stage plan, and
  [docs/VISION.md](docs/VISION.md) and [docs/ROADMAP.md](docs/ROADMAP.md) for direction.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [apps/api/LIMITS.md](apps/api/LIMITS.md).

Hard rules:

- Never put the owner's real activity data (exports, paces, dates, heart rates, names) in the
  repository, tests, commits or pull request text. Use synthetic values.
- Auto-merge is always on: right after opening a pull request that is ready for review (or marking
  a draft ready), run `gh pr merge --auto --squash <number>`. Never merge by hand after waiting on
  CI.
- No production deploy, remote Wrangler or `--remote` unless the owner asks.
- Node 22 and npm workspaces. CI runs the full gate on every pull request; locally, run the tests
  for what you touched.
