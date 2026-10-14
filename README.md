# RunningCyclingAnalysis

Are you a stronger runner or cyclist? Watts on the bike and pace on the run cannot be compared
directly. This app converts both into **gross metabolic power** (watts of energy burned per
kilogram of body weight), compares your best efforts in each sport, and reports the gap with an
honest uncertainty range.

It runs entirely in the browser. Activity files are read and analysed on your device and are never
uploaded. There is no backend and no AI model in the product.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/screenshot-dark.png" />
    <img
      src="docs/screenshot-light.png"
      width="640"
      alt="Results page with sample data. The headline reads 'Your running is 10% stronger than your cycling', followed by the Best efforts in one unit chart, where running and cycling power curves are plotted in gross metabolic watts per kilogram against duration from 1 minute to 2 hours."
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
- **Heart-rate cross-check.** Heart rate rises linearly with metabolic power. If it rises faster
  per estimated watt in one sport, the efficiency assumptions are wrong for that athlete. The app
  measures that slope ratio and uses it as evidence to update the priors, which narrows the range.
- **Virtual power meter.** For rides without a power meter, power on climbs is estimated from
  speed, gradient and mass. The bike model is calibrated on rides that do have a power meter and
  scored leave-one-ride-out, so the accuracy figure is out-of-sample.
- **Was it really all-out?** A best effort far below your highest recorded heart rate was probably
  not maximal, which understates that sport. The headline says so when it happens.
- **Period filter.** Fitness changes, so the comparison can be limited to the last 6 weeks, 3
  months or year.
- **Data-quality checks.** Sensor dropouts, spikes and physiologically implausible readings (for
  example 103 bpm while holding 322 W) are detected, excluded and listed per activity.

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

The heart-rate check plots each five-minute block for both sports, and the virtual power meter is scored only on rides it was not tuned on.

## Validation

The repository includes a deterministic simulator (`src/core/synthetic`) that generates
physically consistent activities for an athlete whose true efficiency, running economy and
critical power are known. The integration tests in `src/core/pipeline.test.ts` run the whole
pipeline on that data and assert that it recovers the truth.

## Limits

- Best-effort curves are only as good as the hardest efforts on file.
- Only heart-rate blocks below 93% of the highest recorded heart rate enter the regression,
  because heart rate stops tracking power linearly near maximum.
- The heart-rate check assumes heart rate maps to metabolic power the same way in both sports. A
  fixed model-discrepancy term keeps the updated range from becoming over-confident.
- Heat, altitude, fatigue and cardiac drift shift heart rate and are not modelled.
- Treadmill and indoor activities have no gradient.
- Virtual power is used on climbs only, because wind and drafting dominate on flat roads.

## Development

Requires Node 22.

```bash
npm install
npm run dev
```

| Command                            | What it does                                                     |
| ---------------------------------- | ---------------------------------------------------------------- |
| `npm run check`                    | Format check, lint, typecheck, unit tests with coverage, build   |
| `npm test`                         | Unit and component tests (Vitest)                                |
| `npm run test:coverage`            | Same, enforcing coverage thresholds on `src/core`                |
| `npm run e2e`                      | End-to-end tests against the production build (Playwright)       |
| `npm run screenshots`              | Rebuilds, then regenerates the README screenshots in `docs/`     |
| `npm run lint`                     | oxlint, warnings are errors                                      |
| `npx tsx scripts/make-fixtures.ts` | Regenerates the deterministic FIT fixtures used by the e2e suite |
| `npm run format`                   | Prettier                                                         |

### Layout

```
src/core/         analysis library: pure TypeScript, no DOM, runs in a Web Worker or Node
  fit/            FIT decoding, 1 Hz resampling, zip and gzip extraction
  quality/        sensor data-quality rules
  metabolic/      gradient smoothing, Minetti cost, metabolic power
  curves/         mean-maximal duration curves
  cp/             critical power fit
  virtualPower/   physics power estimate, calibration, accuracy scoring
  hr/             heart-rate block regression and cross-check
  compare/        Monte Carlo comparison and Bayesian update
  effort/         heart-rate check that best efforts were close to maximal
  synthetic/      ground-truth activity simulator
  pipeline.ts     ties the modules together
src/worker/       Web Worker wrapper
src/ui/           React components and hand-written SVG charts
e2e/              Playwright tests
```

CI (GitHub Actions) runs the full check, the end-to-end suite on desktop and mobile viewports, and
a dependency audit on every push and pull request.

## Built with

TypeScript, React, Vite, Vitest, Playwright, the Garmin FIT SDK and fflate. Written with Claude
Code; no language model runs in the product.

## References

- Minetti AE, Moia C, Roi GS, Susta D, Ferretti G. Energy cost of walking and running at extreme
  uphill and downhill slopes. _J Appl Physiol._ 2002;93(3):1039-1046.
- Monod H, Scherrer J. The work capacity of a synergic muscular group. _Ergonomics._
  1965;8(3):329-338.
- Martin JC, Milliken DL, Cobb JE, McFadden KL, Coggan AR. Validation of a mathematical model for
  road cycling power. _J Appl Biomech._ 1998;14(3):276-291.
