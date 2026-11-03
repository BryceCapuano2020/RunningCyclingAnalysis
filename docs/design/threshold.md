# Ride threshold from many efforts (design)

Status: in progress. Approved by the owner; built in two packages: the estimator in core
(`packages/core/src/threshold/`, no wiring), then the analysis, zones and screens that read it. The simulation behind
the evidence table is `packages/core/src/threshold/threshold.sim.test.ts`. This note holds no owner data.

## Why

The ride threshold was a critical-power fit over the 3 to 20 min bests, vetoed whenever heart rate said the
best 20 min was not hard. A rider whose hard efforts are short climbs and whose 20 and 30 min bests are tempo
got "at least <best 30 min>": a floor 10 to 15% under the truth, with chips saying so. The new rule: the
headline is the best estimate from every effort in the window. Heart rate is a second estimate that can lift
the answer, never a veto. A best effort is proof of a floor; heart rate is a hint.

## The estimate

All values are in the ride curve's unit (gross metabolic W/kg at the prior-mean efficiency), the unit of
`rideCp`, so the UI converts as it does today. The method is scale-free.

1. **Each ride's strongest effort, scaled to an hour.** For each ride and each best from 3 to 60 min,
   `e = value(t) / r(t)`, with `r(t) = 1.015 + 0.76 / t_min` up to 20 min (the 95% rule at 20 min, the 90%
   rule at 8 min) and `r(t) = 1.053 - 0.053 * ln(t_min / 20) / ln 3` from 20 to 60 min (1.00 at 60). The
   ride's estimate is its highest `e`, with that duration.
2. **Power estimate.** A Tukey-biweight weighted mean of the ride estimates (start at the weighted median,
   scale `max(1.4826 * MAD, 2%)`, c = 4.685, 6 iterations). Weight =
   `recency * nearTop * estimated / spread(t)^2`, where recency halves every 42 days back from the newest
   activity in the set, `nearTop = logistic((e / top - 0.96) / 0.015)` with `top` the second-highest ride
   estimate (the highest with one ride), `estimated` is 0.4 for watts without a power meter, and
   `spread(t) = 0.025 + 0.02 * |ln(t / 1200 s)|`. Its relative error is `max(1 / sqrt(sum w), 2.5%)`.
3. **Heart-rate line.** From the 5 min `hrBlocks` of power-meter rides with usable heart rate, with power
   between 45% and 105% of the power estimate: heart rate on power (heart rate is the noisy reading; fitting
   power on heart rate flattens the slope). The slope is Theil-Sen over values demeaned within each ride, so
   day-to-day offsets (heat, fatigue, strap placement) do not flatten it. A ride needs 3 such blocks to add to
   the slope; one with 1 or 2 still gives an offset. Each ride's offset is the median of `h - slope * p`; the
   pooled offset is their median.
4. **Heart-rate guards.** A ride with 4+ blocks whose heart rate varies under 1.5 bpm while power varies over
   3% is out (stuck or cadence-locked). A ride whose offset is more than 10 bpm from the pooled one is out
   (strap reading high or low that day). The line is refused when `slope * 0.5 * powerEstimate` (the climb
   from half to full threshold power) is under 20 or over 70 bpm: no working strap does that. Fewer than 20
   blocks (counting only rides with 3 or more): no line. Rides whose heart rate the analysis already sets aside
   are out.
5. **Heart-rate estimate.** Efforts of 8 to 30 min (shorter lag, longer drift) on power-meter rides that
   passed, with heart rate 85 to 102% of threshold heart rate (`0.9 * the sport's reference max`), and within
   12 bpm of their own ride's line (`u = residual / min(4 * max(spread, 3), 12)`, weight `(1 - u^2)^2`):
   `e_hr = value + (thresholdHr - hr) / slope`. Each gets weight `quality * recency / sd^2` with
   `sd = hypot(3 / slope, 0.1 * |thresholdHr - hr| / slope) / e_hr`. Add the line's own value at threshold heart
   rate with sd `hypot(3%, 0.15 * gap / slope / value)`, gap = how far threshold heart rate lies above the
   highest block. Tukey-biweight mean as in step 2. Its relative error is `hypot(1 / sqrt(sum w), 3.5%)`: a
   wrong max heart rate shifts every heart-rate estimate at once, so that part never averages away.
6. **Fusion.** The power estimate is a floor: threshold = power * (1 + g), g >= 0, prior
   `0.7 * Exponential(mean 2.5%) + 0.3 * Uniform(0, 25%)`, smeared by the power estimate's relative error.
   Heart rate, if there is a heart-rate estimate, is a Gaussian likelihood around it. On a grid from -15% to
   +45% in 0.2% steps (g in 0.25% steps), the answer is the posterior median, the range its 10th and 90th
   percentiles. So heart rate can lift the answer a long way and can pull it under the power estimate only
   within the power estimate's own noise. With no heart rate the answer is the power estimate plus about 3%.

Null when the window has no ride effort of 3 min or more, and when no ride has any weight to give (an age that is
not a number, or so old the recency weight underflows). A single ride is enough: it is the estimate, with the
error that one ride carries.

## What it replaces

The effort gate no longer withholds a threshold. `gatedThreshold`'s veto, the best-30-min floor on the
headline and on zones, the 3 to 10 min fit as a range top, and the per-window hard check behind zones go.
The gate's verdict stays as a detail label. Runs keep their critical-power fit without the veto: a run
version needs its own duration table (short running bests are often intervals or GPS noise), later.

## Evidence

Simulated riders with a known threshold (1,200 per case, seeded; the harness is `threshold.sim.test.ts`, which
asserts the bounds below). Median error, and share within 5%:

| Case                              | This estimate | Best 30 min (the old floor) | 95% of best 20 |
| --------------------------------- | ------------- | --------------------------- | -------------- |
| Clean heart rate                  | -1.4%, 90%    | -11%, 0%                    | -7%, 40%       |
| A bad strap on 1 ride in 4        | -1.6%, 88%    | -11%, 0%                    | -7%, 41%       |
| Max heart rate off by about 8 bpm | -1.3%, 71%    | -11%, 0%                    | -7%, 40%       |
| Flat (optical) heart rate         | -1.1%, 77%    | -11%, 0%                    | -7%, 40%       |
| Never all-out (tempo only)        | -4.7%, 51%    | -9%, 0%                     | -14%, 0%       |
| No heart rate                     | +0.2%, 92%    | -11%, 0%                    | -7%, 40%       |

The test asserts, per case: clean heart rate within 3% on the median and 85% within 5%; a bad strap 85%; a maximum
heart rate off by about 8 bpm 65%; optical heart rate 70%; tempo only a median no lower than -7% and at least 4 points
above the power-only answer; no heart rate within 2% on the median and 85% within 5%; and in every case nearer the truth
than both rules of thumb.

Rejected: letting heart rate judge how all-out each effort was (a strap reading high made tempo rides look
maximal and pulled the answer down 7 to 9%), and shrinking the allowance when several strong rides agree
(tempo riders cluster near their top too, so it cut the lift they need).

## Interface

```ts
export interface ThresholdEstimate {
  value: number // gross metabolic W/kg
  low: number // 10th percentile
  high: number // 90th percentile
  efforts: {
    value: number
    rides: number
    strongest: { activityId: string; durationS: number; estimated: boolean }
  }
  heartRate: { value: number; efforts: number } | { refused: HeartRateRefusal }
}
export type HeartRateRefusal =
  'no-heart-rate' | 'few-blocks' | 'stuck' | 'flat' | 'steep' | 'no-efforts'
export interface ThresholdEffort {
  activityId: string
  durationS: number
  value: number
  heartRate: number | null
  ageDays: number
  estimated: boolean
}
export interface ThresholdBlock {
  activityId: string
  heartRate: number
  value: number
}
export function rideThreshold(
  efforts: ThresholdEffort[],
  blocks: ThresholdBlock[],
  thresholdHr: number | null,
): ThresholdEstimate | null
```

`AnalysisResult.rideThreshold: ThresholdEstimate | null` carries it. `rideCp` stays as the critical-power fit
(cp and W') for the curve chart, with no veto.

## Decisions

- **The caller sets threshold heart rate** (0.9 of the sport's reference maximum, as the effort gate draws its hard
  line) and passes it in; the estimator holds no share of its own, so the two cannot drift apart.
- **Efforts under 3 min are ignored; efforts over 60 min are scaled by the same formula** (the ratio keeps falling
  under 1), so a caller that passes a 90 min best gets a slightly higher estimate from it, never a refusal.
- **`efforts.strongest` is the highest estimate among the rides the mean kept.** A ride the second-strongest rule
  threw out is never named as the proof of the floor. `efforts.rides` counts every ride with an effort of 3 min or more.
- **`efforts.strongest.estimated`** says whether that ride's watts were estimated, so a screen can say the proof of the
  floor is a guess.
- **`heartRate.efforts` counts the efforts that went into the mean**, not the line's own point.
- **Refusals** are the first guard to stop the line: `no-heart-rate` (no threshold heart rate or no blocks),
  `few-blocks` (under 20 blocks between 45% and 105% of the power estimate, from rides with 3 or more), `stuck` (20 or
  more such blocks before stuck rides were left out, fewer after), `flat` and `steep` (the climb from half to full
  threshold power; `flat` also where power never moved within a ride, so no slope can be read), `no-efforts` (a sound
  line, but no steady 8 to 30 min effort near it). An excluded ride is not a refusal: it only lowers `efforts`.
- **Medians keep the element at index `floor(n / 2)`, not core's `medianInPlace`**, which averages the two middle values
  of an even count. The ride-offset guard and the spread were tuned on the element, and the average moved simulated
  answers by up to 30%.
- **The fusion grids stop one step short of their last value** (300 points from -15%, 100 gaps from 0), as the
  prototype's loops did; the estimate matches it to rounding on 3,600 simulated riders.
- **The simulation draws from core's seeded generator**, not the prototype's, so its numbers differ from the first
  table by a point or two. It runs 1,200 riders per case rather than 400: across six seeds the within-5% share of the
  maximum-heart-rate case ranged from 66% to 77% at 400, and from 71% to 73% across four seeds at 1,200.
