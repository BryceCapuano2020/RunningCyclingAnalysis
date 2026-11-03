# Ride threshold from many efforts (design)

Status: in progress. Approved by the owner; built in two packages: the estimator in core
(`packages/core/src/threshold/`, no wiring), then the analysis, zones and screens that read it. The simulation behind
the evidence table is `packages/core/src/threshold/threshold.sim.test.ts`. This note holds no owner data.

## Why

The ride threshold was a critical-power fit over the 3 to 20 min bests, vetoed whenever heart rate said the
best 20 min was not hard. A rider whose hard efforts are short climbs and whose 20 and 30 min bests are tempo
got "at least <best 30 min>": a floor 10 to 15% under the truth, with chips saying so. The new rule: the
headline is the best estimate from every effort in the window. Heart rate is a second estimate that can lift
the answer and never lowers it, so it is never a veto. A best effort is proof of a floor; heart rate is a hint.

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
   `0.7 * Exponential(mean 2.5%) + 0.3 * Uniform(0, 25%)`, smeared by the power estimate's relative error. On a
   grid from -15% to +45% in 0.2% steps (g in 0.25% steps) that gives a posterior from power alone. If there is a
   heart-rate estimate, a second posterior takes it as a Gaussian likelihood around it. **Heart rate may raise the
   answer and never lowers it.** The answer is the higher of the two medians, and the range the higher of each pair of
   10th and 90th percentiles (elementwise, so the upper end that power alone allows stays when heart rate lifts the
   answer). With no heart rate the answer is the power estimate plus about 3%.

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
asserts the bounds below; `RECORD=1` prints these rows). Each rider's heart rate climbs 25 to 65 bpm from half to
full threshold power, and watts per beat follow from that, so the 20 to 70 bpm guard refuses almost no one with a
working strap (the first version drew watts per beat on its own, which put a quarter of riders over 70 bpm and
silently switched their heart rate off). Each cell is the median error, the share within 5%, and the share of
riders whose true threshold lies between the answer's low and high. The low and high are the 10th and 90th
percentiles, but most cells read about 96%: the range is wider than an 80% interval, so no screen may call it an
80% range.

| Case                              | This estimate   | Power alone (no heart rate) |
| --------------------------------- | --------------- | --------------------------- |
| Clean heart rate                  | +0.4%, 94%, 96% | +0.2%, 92%, 96%             |
| A bad strap on 1 ride in 4        | +0.4%, 94%, 96% | +0.1%, 92%, 96%             |
| Max heart rate off by about 8 bpm | +0.9%, 82%, 83% | +0.2%, 92%, 96%             |
| Flat (optical) heart rate         | +0.2%, 92%, 96% | +0.2%, 92%, 96%             |
| Never all-out (tempo only)        | -5.2%, 49%, 81% | -10.6%, 0%, 63%             |
| No heart rate                     | +0.2%, 92%, 96% | +0.2%, 92%, 96%             |

The old rules of thumb on the same riders, median error and share within 5%: best 30 min -11% and 0% (-9% and 0%
for tempo only), 95% of best 20 min -7% and 40% (-14% and 0% for tempo only).

The heart-rate line is refused for 0.3% of riders in the clean case (3 of 1,200, all `flat`), 1% with the bad strap,
and 88% with the optical strap, where the climb is a third of what it should be and the answer is the power-only one.
Heart rate alone, before fusion, reads 3.5% under the truth in the clean case with a spread of 5.2%, where it states
3.6%: it is biased low, so under lift-only fusion it can miss a lift but cannot cause a drop. Seeds 11 to 14 agree within 4
points on every cell.

The test asserts, per case: clean heart rate within 3% on the median and 85% within 5%; a bad strap 85%; a maximum
heart rate off by about 8 bpm 65%; optical heart rate 70%; tempo only a median no lower than -7% and at least 4 points
above the power-only answer; no heart rate within 2% on the median and 85% within 5%; in every case nearer the truth
than both rules of thumb, never under the answer without heart rate, and a range that holds the truth for 65% to 97%
of riders; under 2% of clean-heart-rate riders refused; and, with a clean, partly bad or optical heart rate, a
within-5% share no more than 3 points under the power-only answer.

Rejected:

- Letting heart rate judge how all-out each effort was (a strap reading high made tempo rides look maximal and
  pulled the answer down 7 to 9%).
- Shrinking the allowance when several strong rides agree (tempo riders cluster near their top too, so it cut the
  lift they need).
- **Two-sided fusion**, where heart rate is a likelihood that can also pull the answer under the power-only one
  (within the power estimate's noise). On the realistic riders heart rate alone reads 3.5% under the truth with a
  spread of 5.2% against a stated 3.6%, so it dragged good answers down. Clean: -2.3% median, 81% within 5% against
  92% for power alone, range holding the truth for 61%; bad strap 83%; wrong maximum 58% and 42%; tempo only 48%.
  Five bounds failed. Lift-only meets all of them.
- Lift-only with the range taken from whichever posterior gives the answer, not elementwise: the heart-rate
  posterior is narrow round a reading that sits 3% low, so the tempo-only range held the truth for 57% of riders
  (bound 65%). Elementwise holds 81%.
- Lift-only with the heart-rate error set to its observed spread (stated 5.2% instead of 3.6%). Wrong maximum
  improves (85% within 5% against 82%), but tempo only falls to -6.8% (lift 3.7 points against power alone, bound 4)
  and 34% within 5%.
- Removing each ride's offset from the pooled one before sliding its efforts to threshold heart rate. Heart rate
  alone got worse, not better: spread 5.4% against 5.2%, bias -4.0% against -3.5%, and no cell of the clean, strap
  or wrong-maximum cases moved by more than a point.

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
- **Heart rate lifts and never lowers.** The range is the elementwise higher of the two posteriors' percentiles,
  which keeps the upper end power alone allows. `low <= value <= high` still holds (each is a max of pairs that satisfy it).
- **Medians keep the element at index `floor(n / 2)`, not core's `medianInPlace`**, which averages the two middle values
  of an even count. The ride-offset guard and the spread were tuned on the element, and the average moved simulated
  answers by up to 30%.
- **The fusion grids stop one step short of their last value** (300 points from -15%, 100 gaps from 0), as the
  prototype's loops did; the estimate matches it to rounding on 3,600 simulated riders.
- **The simulation draws from core's seeded generator**, not the prototype's, so its numbers differ from the first
  table by a point or two. It runs 1,200 riders per case rather than 400, which moved the within-5% share of the
  first version's maximum-heart-rate case by up to 11 points between seeds. With the realistic riders and lift-only
  fusion that case ranges from 82% to 85% across four seeds at 1,200.
