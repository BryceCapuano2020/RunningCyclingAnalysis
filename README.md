# RunningCyclingAnalysis

How do your running and cycling energy estimates compare? Watts on the bike and pace on the run
cannot be compared directly. This app converts both into **gross metabolic power** (watts of energy burned per
kilogram of body weight), compares your best efforts in each sport, and reports the gap with a
model range. This estimates energy use; it does not rank sporting ability.

[Open the live app](https://rca-api.nutritioncoachapp.workers.dev) ·
[Engineering review](docs/REVIEW.md) · [Operations and verification](docs/PRODUCTION.md)

The live Worker was verified at commit `493ce15` on 22 October 2026. The current `main` tree is
`310264a`; the hardening changes described in this branch have not been deployed. Branch-specific
limits and operations below describe source behavior, not live production behavior.

Analysis always runs in your browser: activity files are parsed and analysed on your device. An
account is optional. With one, your profile and activity library are stored on Cloudflare so they
follow you between devices (see [Accounts and sync](#what-it-does)).

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/screenshot-dark.png" />
    <img
      src="docs/screenshot-light.png"
      width="640"
      alt="Results page with sample data. The headline compares estimated running and cycling energy use, followed by the Best efforts in one unit chart, where running and cycling power curves are plotted in gross metabolic watts per kilogram against duration from 1 minute to 2 hours."
    />
  </picture>
</p>

## What it does

- **Reads FIT files** from Garmin, Wahoo and similar devices, singly, gzipped, or inside a Strava
  account-export zip.
- **One unit for both sports.** Cycling power is divided by gross efficiency. Running speed and
  gradient go through the Minetti et al. (2002) energy-cost-of-running curve. Both become W/kg.
- **Uncertainty, not a single number.** Efficiency and running economy differ between people and
  cannot be read from a file, so they are sampled from population priors and the result is a 90%
  range.
- **Heart-rate cross-check.** Under the assumption that heart rate responds similarly to energy
  use in both sports, the slope ratio can adjust the population priors. Weights are normalised in
  log space. If their effective sample size is below 20 draws or 1% of the simulation, the app keeps
  the population-based result and explains that the adjustment was unsupported. This numerical
  diagnostic does not validate the physiological assumptions.
- **Virtual power meter.** For rides without a power meter, power on climbs is estimated from
  speed, gradient and mass. The bike model is calibrated on rides that do have a power meter and
  scored leave-one-ride-out, so the accuracy figure is out-of-sample.
- **Effort context.** Heart rate below the highest sustained value on file can suggest missing
  harder efforts. Being near that recorded value does not establish that an effort was all-out.
- **Period filter.** Fitness changes, so the comparison can be limited to the last 6 weeks, 3
  months or year.
- **Data-quality checks.** Sensor dropouts, spikes and physiologically implausible readings (for
  example 103 bpm while holding 322 W) are detected, excluded and listed per activity.
- **Accounts and sync.** Sign in with Google to keep your profile and activity library on
  Cloudflare. Per-activity digests are stored in D1; original files stay on your device by default.
  Users can opt in to R2 retention subject to per-user and application-wide limits. Direct bucket
  access outside the app is not covered by those limits and could incur charges. Each user sees
  only their own data. Account deletion immediately blocks access and starts cleanup; if file
  deletion is interrupted, a tombstone lets retries and scheduled maintenance finish it. The
  [privacy policy](https://rca-api.nutritioncoachapp.workers.dev/privacy.html) lists exactly what is
  stored.

The system design is described in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and planned work is
in [docs/ROADMAP.md](docs/ROADMAP.md). Operational limits, release gates and remaining launch
evidence are in [docs/PRODUCTION.md](docs/PRODUCTION.md); the local benchmark is in
[docs/PERFORMANCE.md](docs/PERFORMANCE.md). Service and storage limits are in
[apps/api/LIMITS.md](apps/api/LIMITS.md).

## The model

| Step             | Formula                                                                            |
| ---------------- | ---------------------------------------------------------------------------------- |
| Cycling          | `M = P / (GE × mass)`, with `GE ~ N(0.215, 0.012)`                                 |
| Running          | `M = rest + s × C(grade) × speed`, with `C` from Minetti 2002 and `s ~ N(1, 0.06)` |
| Comparison       | `ratio(t) = M_run(t) / M_ride(t)` over 4,000 seeded Monte Carlo draws              |
| Heart-rate check | `κ = slope_ride / slope_run` of heart rate against `M`, on 5-minute block means    |
| Update           | each draw is weighted by the likelihood of the observed `κ` (importance sampling)  |
| Virtual power    | `P = (m g (sin θ + Crr cos θ) v + ½ ρ CdA v³ + m a v) / η`, climbs only            |

`M` is gross metabolic power in W/kg, `P` is mechanical power in W, and `rest` is 1.22 W/kg.

![Heart-rate check and virtual power meter accuracy cards for the sample data](docs/screenshot-checks.png)

The heart-rate check plots each five-minute block for both sports, and the virtual power meter is
scored only on rides it was not tuned on.

## Validation

The repository includes a deterministic simulator (`packages/core/src/synthetic`) that generates
physically consistent activities for an athlete whose true efficiency, running economy and
critical power are known. The integration tests in `packages/core/src/pipeline.test.ts` run the
whole pipeline on that data and assert that it recovers the simulated parameters. These tests
validate implementation consistency, not accuracy or interval coverage on real athletes. Real
device-file validation is still outstanding.

## Limits

- Best-effort curves are only as good as the hardest efforts on file.
- Heart-rate blocks enter the regression only when their power is at or below each sport's critical
  power, because heart rate stops rising linearly with power above it. Blocks are selected on power,
  not heart rate, to avoid directly truncating the dependent variable. Other sources of bias remain. The first 10 minutes of each activity are
  skipped as warm-up.
- The heart-rate check assumes heart rate maps to metabolic power the same way in both sports. A
  fixed model-discrepancy term allows some disagreement, but its calibration has not been validated.
- The 90% model range samples efficiency and running economy; it does not include every sensor,
  virtual-power, terrain, effort-coverage or physiological error.
- Heat, altitude, fatigue and cardiac drift shift heart rate and are not modelled.
- Treadmill and indoor activities have no gradient.
- Virtual power is used on climbs only, because wind and drafting dominate on flat roads.

## Development

Requires Node 22.

```bash
npm install
npm run dev
```

| Command                           | What it does                                                             |
| --------------------------------- | ------------------------------------------------------------------------ |
| `npm run dev`                     | Web app dev server (Vite)                                                |
| `npm run dev:api`                 | Local API Worker on port 8787 (`wrangler dev`)                           |
| `npm run build`                   | Production build of the web app into `apps/web/dist`                     |
| `npm test`                        | Unit and component tests across all packages (Vitest)                    |
| `npm run test:coverage`           | Same, with coverage thresholds                                           |
| `npm run e2e`                     | Playwright tests against the production build; run `npm run build` first |
| `npm run check`                   | Format check, lint, typecheck, tests with coverage, and build            |
| `npm run fixtures -w @rca/web`    | Regenerates the deterministic FIT fixtures used by the e2e suite         |
| `npm run screenshots -w @rca/web` | Builds, then regenerates the README screenshots in `docs/`               |

### Layout

npm workspaces monorepo. Shared TypeScript, Vitest, Prettier and oxlint config live at the root.

```
packages/core/       @rca/core: analysis library, pure TypeScript, no DOM
  fit/               FIT decoding, 1 Hz resampling, zip and gzip extraction
  quality/           sensor data-quality rules
  metabolic/         gradient smoothing, Minetti cost, metabolic power
  curves/            mean-maximal duration curves
  cp/                critical power fit
  virtualPower/      physics power estimate, calibration, accuracy scoring
  hr/                heart-rate block regression and cross-check
  compare/           Monte Carlo comparison and Bayesian update
  effort/            heart-rate check that best efforts were close to maximal
  synthetic/         ground-truth activity simulator
  pipeline.ts        ties the modules together
packages/contract/   zod schemas shared by the API and the web app
apps/web/            @rca/web: React + Vite app
  src/worker/        Web Worker that runs the analysis
  src/ui/            React components and hand-written SVG charts
  e2e/               Playwright tests
  scripts/           FIT fixture and README screenshot generators
apps/api/            @rca/api: Cloudflare Worker API with Hono, D1 and R2
docs/                architecture, roadmap and README screenshots
```

The repository contains CI workflow definitions for formatting, lint, types, deployment and
operations tests, unit tests with coverage, builds, Playwright, and dependency audits. The hardening
branch has not run those workflows from the default branch.

## Deploy

The deployment uses Cloudflare Workers Free and D1 Free, plus a dedicated R2 Standard bucket; it
does not enroll in Workers Paid. The web app is served as static assets and the API lives under
`/api`, so everything shares one `workers.dev` origin. Worker and D1 limits are hard quotas: when
exceeded, requests fail until limits reset or storage is freed. Application-level R2 limits cap
app-handled traffic, but do not protect against direct bucket access or guarantee zero charges.
Setup, Google sign-in, local development with real sign-in, costs and rollback are in
[docs/DEPLOY.md](docs/DEPLOY.md). The hardening branch adds source for a gated **Deploy** workflow;
it has not been deployed or run from the default branch. The encrypted-backup and uptime workflow
files are also source only: the age recipient, GitHub environments and secrets, and remote workflow
setup are not configured, so there is no active backup job or uptime monitor yet. See
[docs/PRODUCTION.md](docs/PRODUCTION.md).

## Built with

TypeScript, React, Vite, Vitest, Playwright, fflate and an in-house FIT decoder/encoder. The Garmin
FIT SDK is a development-only reference for differential tests. The API runs on
Cloudflare Workers with D1 and R2, using Hono, Drizzle ORM and zod. Written with Claude Code; no
language model runs in the product.

## Privacy, security and license

- The [privacy policy](https://rca-api.nutritioncoachapp.workers.dev/privacy.html) describes what is
  stored, where, for how long, and how to delete it.
- Report security problems through GitHub's private security advisory form, not a public issue. The
  contact details are in `apps/web/public/.well-known/security.txt`.
- Licensed under the [MIT License](LICENSE).

## References

- Minetti AE, Moia C, Roi GS, Susta D, Ferretti G. Energy cost of walking and running at extreme
  uphill and downhill slopes. _J Appl Physiol._ 2002;93(3):1039-1046.
- Monod H, Scherrer J. The work capacity of a synergic muscular group. _Ergonomics._
  1965;8(3):329-338.
- Martin JC, Milliken DL, Cobb JE, McFadden KL, Coggan AR. Validation of a mathematical model for
  road cycling power. _J Appl Biomech._ 1998;14(3):276-291.
