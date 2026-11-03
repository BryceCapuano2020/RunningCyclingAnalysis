# Threshold from many efforts (design)

Status: in progress. Approved by the owner; built in packages: the estimator in core (`packages/core/src/threshold/`),
then its wiring into the analysis, the zones and the window choice (built), then the screens that read it. It was built for
rides and now reads runs the same way (see "Runs"); everything below is the ride unless a section says run. The
simulations behind the evidence tables are `packages/core/src/threshold/threshold.sim.test.ts` (riders) and
`runThreshold.sim.test.ts` (runners). This note holds no owner data.

## Why

The ride threshold was a critical-power fit over the 3 to 20 min bests, vetoed whenever heart rate said the
best 20 min was not hard. A rider whose hard efforts are short climbs and whose 20 and 30 min bests are tempo
got "at least <best 30 min>": a floor 10 to 15% under the truth, with chips saying so. The new rule: the
headline is the best estimate from every effort in the window. Heart rate is a second estimate that can lift
the answer and never lowers it, so it is never a veto. A best effort is proof of a floor; heart rate is a hint.

The run threshold was critical speed fitted to the 3 to 20 min bests. For a runner who gives it all that reads over the pace
held for an hour (about 1% on the simulated runners under "Runs", and the more the better the runner's endurance): near the
pace of a 40 min effort, beside a ride threshold that means an hour, so the two could not be set against each other. And where a window held no hard run it was a fit to easy runs, which could read
slower than a 60 min run the athlete did in that same window. Runs now get the ride's method with a running duration table, so
both thresholds mean an hour.

## The estimate

All values are in the sport's curve unit: gross metabolic W/kg at the prior-mean efficiency for a ride (the unit of `rideCp`)
and at the prior-mean economy for a run (the unit of `runCp`), so the UI converts as it does today. The method is scale-free.
Only the duration table in step 1 differs by sport (`DURATION_TABLES`, keyed by `Sport`).

1. **Each ride's strongest effort, scaled to an hour.** For each ride and each best from 3 to 60 min,
   `e = value(t) / r(t)`, with `r(t) = 1.015 + 0.76 / t_min` up to 20 min (the 95% rule at 20 min, the 90%
   rule at 8 min) and `r(t) = 1.053 - 0.053 * ln(t_min / 20) / ln 3` from 20 to 60 min (1.00 at 60). A run
   uses its own table (Runs). The ride's estimate is its highest `e`, with that duration.
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
   answer and never lowers it.** With no heart rate the answer is the power estimate itself: the median from power
   alone, about 3% over it, is an allowance for bests short of all-out that nothing in the rides confirms. With a
   heart-rate estimate the answer is the median of its posterior, no higher than heart rate reads and no lower than the
   power estimate, so heart rate that agrees with the power estimate adds nothing. The range is the higher of each pair
   of 10th and 90th percentiles (elementwise, so the upper end that power alone allows stays when heart rate lifts the
   answer).
7. **A backed hour done is a floor, for both sports.** The answer and its low are never under the best measured effort of 60
   min or more in the window, as it was held (the scaled ratio is 1.00 at an hour, so it is the effort itself; a longer effort
   is taken at its own value, not scaled up), when something backs it. A threshold slower than an hour the athlete did is wrong
   on its face, but one odd file with nothing else near it is not an hour done. So the best hour sets the floor when a second
   hour in the window is within 4% of it, or when it is no higher than the 90th percentile of the mean of the rides' estimates
   (`fuse` from power alone, about 16% over the mean at the 2.5% floor of its error). Otherwise the floor is the second-best
   hour, or none. Only a measured hour counts: watts estimated without a meter never make an hour done. The floor is applied to
   the power estimate, before fusion: where it is higher than the mean, `efforts.value` is the hour and `efforts.strongest`
   names it, so a screen's "strongest effort" is the one that sets the number, and an answer above `efforts.value` still means
   heart rate lifted it. The low is the higher of the fused low and the hour. The floor reads every ride in the window whatever
   its age, since recency weights the mean and not the floor: a period's threshold may not deny a backed hour the period holds.
   The heart-rate line is fitted in a band of the power estimate, so a floor that lifts the estimate lifts the band: with the
   floor backed, only a backed hour lifts it, never one odd file (`hourFloor.test.ts`).

Null when the window has no ride effort of 3 min or more, and when no ride has any weight to give (an age that is
not a number, or so old the recency weight underflows). A single ride is enough: it is the estimate, with the
error that one ride carries.

## What it replaces

The effort gate no longer withholds a threshold. `gatedThreshold`'s veto, the best-30-min floor on the
headline and on zones, the 3 to 10 min fit as a range top, and the per-window hard check behind zones go.
The gate's verdict stays as a detail label. `runCp` and `rideCp` stay on the result as the critical-power fits (cp and W'),
with `runCpRefusal` and `runCpUneven`. Nothing reads them now: no screen does (the curve chart draws the bests and the estimate's
threshold line, and the race predictions read the bests and the heart-rate VO2max, not the fit), and neither is a headline. The tests and simulations read them,
and the heart-rate set-aside fits its own (`digest/setAside.ts`).

Runs first kept that fit without the veto, because a run version needed its own duration table. It has one now (Runs), and the
run threshold replaces the fit everywhere a headline reads one.

**The window choice keeps its hard check for now.** The default period still passes over a window in which a sport's
best 20 min was not hard (`easy`, and `most` when no window qualifies), as before. It was kept because run thresholds were
not floor-aware, and a default window of easy runs read a run threshold well under the longer windows'. The run threshold is
floor-aware now, which removes that reason; whether to remove the rule is a separate decision and
is not part of this change. The rule only picks which period opens first and never hides a number.

## Evidence

Rides. Simulated riders with a known threshold (1,200 per case, seeded; the harness is `threshold.sim.test.ts`, which
asserts the bounds below; `RECORD=1` prints these rows). Each rider's heart rate climbs 25 to 65 bpm from half to
full threshold power, and watts per beat follow from that, so the 20 to 70 bpm guard refuses almost no one with a
working strap (the first version drew watts per beat on its own, which put a quarter of riders over 70 bpm and
silently switched their heart rate off). Each cell is the median error, the share within 5%, and the share of
riders whose true threshold lies between the answer's low and high. The low and high are the 10th and 90th
percentiles, but most cells read about 96%: the range is wider than an 80% interval, so no screen may call it an
80% range.

| Case                              | This estimate   | Power alone (no heart rate) |
| --------------------------------- | --------------- | --------------------------- |
| Clean heart rate                  | -1.9%, 89%, 96% | -3.1%, 80%, 96%             |
| A bad strap on 1 ride in 4        | -2.0%, 90%, 96% | -3.2%, 77%, 96%             |
| Max heart rate off by about 8 bpm | -1.5%, 78%, 83% | -3.1%, 80%, 96%             |
| Flat (optical) heart rate         | -3.1%, 80%, 96% | -3.1%, 80%, 96%             |
| Never all-out (tempo only)        | -5.0%, 49%, 88% | -11.7%, 0%, 79%             |
| No heart rate                     | -3.1%, 80%, 96% | -3.1%, 80%, 96%             |
| Always all-out                    | +0.3%, 96%, 81% | -0.0%, 95%, 84%             |
| Always all-out, no heart rate     | -0.0%, 95%, 84% | -0.0%, 95%, 84%             |

The table includes the hour floor (step 7): it moved only the tempo-only row (power alone from -13.5% to -11.7%, since a
rider who never goes all out still rode an hour; the answer from -5.2% to -5.0%, and the range's hold from 81% to 88%) and a
point or two in the cells for a wrong maximum and for always all-out. Backing the floor (a second hour within 4%, or under the
estimate's 90th percentile) moved no cell: the best hour of these riders is a tempo or easy day, under the estimate.

The hard rides of the first six cases are 0 to 7% under all-out, so without heart rate the answer reads about 3% low.
The allowance read them better (+0.2% and 92% within 5% with no heart rate, +0.4% and 94% with a clean one) and read the
always-all-out rider +3.4% high (83% and 84%). It was dropped on the owner's call, from a real library whose strongest
rides keep reaching the same ceiling: the duration ratio already takes a best as all-out, so on a rider whose bests are,
the allowance counts the same doubt twice. Heart rate still lifts the riders whose bests fall short.

The old rules of thumb on the same riders, median error and share within 5%: best 30 min -11% and 0% (-9% and 0%
for tempo only), 95% of best 20 min -7% and 40% (-14% and 0% for tempo only).

The heart-rate line is refused for 0.3% of riders in the clean case (3 of 1,200, all `flat`), 1% with the bad strap,
and 88% with the optical strap, where the climb is a third of what it should be and the answer is the power-only one.
Heart rate alone, before fusion, reads 3.5% under the truth in the clean case with a spread of 5.2%, where it states
3.6%: it is biased low, so under lift-only fusion it can miss a lift but cannot cause a drop. Seeds 11 to 14 agree within 4
points on every cell, in this table and in the runners' below.

The test asserts, per case: clean heart rate within 3% on the median and 85% within 5%; a bad strap 85%; a maximum
heart rate off by about 8 bpm 65%; optical heart rate 70%; tempo only a median no lower than -7% and at least 6 points
above the power-only answer; no heart rate at most 4% low on the median and 75% within 5%; always all-out within 1% on
the median and 85% within 5% without heart rate, at most 2% high and 85% with it; in every case nearer the truth than
both rules of thumb, never under the answer without heart rate, and a range that holds the truth for 65% to 97% of
riders; under 2% of clean-heart-rate riders refused; with a clean or partly bad heart rate a within-5% share at least 5
points over the power-only answer, and with an optical one no more than 3 points under it.

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

## Runs

A run's threshold is built the same way and means the same thing: the pace held for an hour. `runThreshold` is the estimator
with a runner's table; `AnalysisResult.runThreshold: ThresholdEstimate | null` carries it, in the unit of `runCp`.

**The duration table.** Daniels and Gilbert's share of VO2max a runner holds for `m` minutes,
`pct(m) = 0.8 + 0.1894393 e^(-0.012778 m) + 0.2989558 e^(-0.1932605 m)`, over the share held for an hour:
`r_run(t) = pct(t / 60) / pct(60)`. It is 1.229 at 5 min, 1.137 at 10, 1.073 at 20, 1.029 at 40 and 1.000 at 60, so a run of 20
min at 1.073 times the oxygen cost of the hour's pace is an all-out run. It is a ratio of oxygen cost, and it is applied to
the cost of a speed, not to the run curve's gross metabolic W/kg. Daniels' cost, `VO2(v) = -4.60 + 0.182258 v + 0.000104 v^2`
(`v` in m/min), is convex in speed, where the curve's W/kg is linear in it (a resting part plus a cost per metre); dividing
W/kg by `r_run` reads the hour's pace too slow, by about 7% for a 3 min best, 5% for 5 min, 3% for 10, 2% for 20 and under 1%
for 40, nearly whatever the speed. So each run effort is taken through speed: the flat speed of its W/kg
(`metabolicToFlatSpeed`), Daniels' cost of that speed, that cost over `r_run(t)`, back to speed (the positive root of the
quadratic) and back to W/kg (`runThresholdOf`, `threshold/durationTables.ts`). A scaled value depends on the effort's value as
well as its length, so the run's best is chosen effort by effort (`bestOf`, through `DurationTable.threshold(value,
durationS)`); a ride's is still its effort over a ratio of its length alone, and its answers do not move. The efforts are the
same 3 to 60 min bests, with the same near-top weight, recency and Tukey mean. The spread of the ratio between runners starts as
the ride's (smallest at 20 min, growing with the log of the distance either side): the second simulation below doubles the
runners' departure from the curve and the stated range still holds for most of them, so there is no evidence for a wider one.
Check (`durationTables.test.ts`): an effort at the speed Daniels gives for `t` minutes at a VO2max scales to the speed he gives
for 60 min at that VO2max within 0.5%, and the 5 km and 10 km of one runner in his published tables read the same hour speed.

**The inputs** (`digest/runEfforts.ts`) are the run best curve's own: each curve point of a counted run from 3 to 60 min,
priced by `runCentralWkg` (a treadmill run holds no best, and a point past the world-record ceiling for its duration is
dropped, as the best curve drops it); the heart rate of a run set aside is none; and the 5 min blocks are the digest's
`hrBlocks`, whose value is the run's mean gross metabolic W/kg (`possibleRunWkg`), in the same unit. Nothing in a run is
estimated. Ages count from the newest activity of any sport in the set, as the ride's do.

**Runs read pace only, for now.** The estimator can read heart rate for a run as it does for a ride: run digests carry the 5 min
blocks in the run's unit, so the same line, guards and fusion took no new code. It was built that way first, and on a real
library the lift it gave read a run threshold well over the pace-only answer, which was right. So `thresholdReferenceOf`
(`digest/thresholdLibraries.ts`, a table keyed by `Sport`) gives a run no threshold heart rate: `runThreshold.heartRate` is
`{ refused: 'no-heart-rate' }`, no run line is fitted (which saves its cost too), and the answer is the power estimate, the
pace-only one. A run's heart rate still gates and labels what it did before (the effort gate, set-aside); it just no longer
raises the number. Turning heart rate on for runs is one entry in that table, once a line is found that holds for runners. The
simulation below therefore runs without heart rate.

**The zones' timeline, the evidence rule and the headline** read `runThreshold` where they read `runCp`. A zone window is
`runThreshold` over its runs, as a `{ cp, cpSe }` step, with the same standard error rule as a ride's. A window with any run
effort of 3 min or more has an estimate, so a run window never falls back to an older fit for lack of a long effort; it does
where its runs hold nothing past 3 min at all.

### The run card

The run's threshold card is the ride's, with the run's words (`apps/web/src/ui/`, rules in docs/DESIGN.md). Every screen reads the
estimate through `thresholdEstimate(result, sport)`, so the sport page's panel, Balance's tile, the curve chart's threshold line,
the range, the records and the share card show one number.

- **One pace, no chip, no shape.** The figure is the estimate as a flat pace in the page's units. There is no "Estimated" or "At
  least" chip and no range track; the name, "Threshold pace", says it is an estimate. `RangeTrack`, `StatTile`'s basis chip and
  track, the gate's floor (`thresholdFloor.ts`), the uneven-fit range and the "Best 12 min" heading are gone, because a run with an
  effort of 3 min or more has an estimate and no fit refusal can take it away. With no such effort the place reads "Needs an
  effort of 3 min or longer", as a ride's does.
- **The basis line** is "From 4 runs. Strongest: 40 min on 4 Mar.", from `efforts.rides` (the activity count; the field keeps the
  ride's name) and `efforts.strongest`. Where an hour the athlete ran sets the figure, that hour is the strongest effort. A run's
  efforts are never estimated, so the line never adds ", on estimated watts".
- **"How this was worked out"** opens the range ("Range 4:10 to 4:39 /km", the estimate's own 10th to 90th percentile, or "About
  4:24 /km" where the ends print the same) and the method in one sentence: the strongest effort of each run, scaled to an hour and
  averaged, with more weight on recent runs and on those near the athlete's top, and never under an hour the athlete ran.
- **Nothing about heart rate.** A run's threshold is worked out from pace alone, so its detail has no "Heart rate can raise the
  answer" sentence and no "Here it was not used" one, and the Method page's run lines say nothing of it (its heart-rate line
  names the ride: "A ride's threshold can be raised by heart rate and never lowered"). The estimator accepts a
  threshold heart rate and the run reading was built (above), but trying it on a real library lifted the estimate too far while pace
  alone was right, so the caller passes none and `runThreshold.heartRate` is `{ refused: 'no-heart-rate' }` for every run. A test
  holds the run detail to that: it carries no heart-rate sentence whether the estimate holds a reading or a refusal.
- **Elsewhere.** The zones' source line says "Threshold pace: 7:30 /mi, estimated from your runs" (with "up to Mar 2025" for an
  older estimate, as a ride's). The share card says "Threshold GAP, estimated from your runs", and a card needs an estimate on both
  sports. The Method page's Thresholds entry says the run's method beside the ride's and quotes the table's percentages from the
  code (`DURATION_TABLES.run`): an all-out 10 min effort is 14% above an hour's energy rate, 20 min 7%, 40 min 3%.
- **What stays on the fit.** `runCp` stays on the result as the critical-power fit, read by no screen (see "What it replaces").
  Its refusal, its uneven fit and the effort gate's floor no longer reach a threshold card.

### Evidence for runs

Simulated runners with a known 1-hour pace (1,200 per case, seeded; `runThreshold.sim.test.ts`; `RECORD=1` prints these rows).
The efforts are drawn from the Daniels curve as the estimate reads it (the inverse of `runThresholdOf`: the hour's cost times
`r_run(t)`, back to speed and W/kg), with an endurance tilt per runner (a sprinter's or a diesel's: 4% at 3 min and 2% at 60, the
riders' spread), 0 to 7% short of all-out in the hard runs, the same runs as the riders' (easy days at 68 to 80% of threshold, the
share a gross metabolic rate that includes rest leaves). No case has heart rate, since runs read none. The two last cases double
the tilt. Cells: the median error, the share within 5%, the share whose range holds the truth; then the median error and the share
within 5% of the rules of thumb the estimate replaces.

| Case                               | This estimate   | Critical speed, 3 to 20 min | Best 30 min |
| ---------------------------------- | --------------- | --------------------------- | ----------- |
| Hard runs 0 to 7% short of all-out | -3.1%, 79%, 96% | -1.9%, 69%                  | -8.6%, 6%   |
| Always all-out                     | -0.1%, 94%, 84% | +1.1%, 66%                  | -6.7%, 28%  |
| Never all-out (tempo only)         | -11.7%, 0%, 82% | -9.0%, 0%                   | -9.4%, 0%   |
| Endurance varying twice as much    | -3.2%, 71%, 88% | -2.0%, 68%                  | -8.5%, 6%   |
| Twice as much, always all-out      | -0.0%, 86%, 73% | +1.1%, 63%                  | -6.7%, 28%  |

What the table says, and does not:

- The simulation draws a runner from the curve the estimator inverts, so it tests the method and the weights, not whether Daniels
  and Gilbert's curve fits real runners. That is not tested here, and a runner whose curve differs from it by more than the tilt
  moves the answer by that much.
- Critical speed over the 3 to 20 min bests reads +1.1% for a runner who gives it all (near the pace of about 40 min), and close to
  zero on the median for runners 0 to 7% short only because the two errors cancel. It reads 63% to 69% of these runners within 5%,
  against 71% to 94% for this estimate.
- The best 30 min is 7 to 9% low, as a rider's is.
- With no heart rate to confirm a rise, a runner who never goes all out is read about 12% low and none within 5%, where critical
  speed (9% low) is no nearer. That is the cost of leaving heart rate out for runs: the first version of this simulation, with
  heart rate, lifted such a runner by about 6 points, and on a real library the same lift read runs far too fast.
- The hour floor changes nothing in these cases: the best hour of a simulated runner is a tempo or easy day, below the estimate.
  The unit tests pin it (`hourFloor.test.ts`).

The test asserts: hard runs short of all-out at most 4% low on the median and 75% within 5%; always all-out within 1% on the median
and 90% within 5%; in each case but never all-out more runners within 5% than critical speed and than the best 30 min, and a median
nearer the truth than the best 30 min; a range that holds the truth for 65% to 97% of runners in every case; twice the tilt 65%
within 5% (80% when always all-out); and never all-out between 8% and 14% low with under 2% within 5%.

## Interface

```ts
export interface ThresholdEstimate {
  value: number // gross metabolic W/kg
  low: number // 10th percentile
  high: number // 90th percentile
  efforts: {
    value: number
    relativeError: number // of the power estimate, as a share of value; never under 2.5%
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
export interface DurationTable {
  threshold(value: number, durationS: number): number // the threshold a best implies: a ride's value over a ratio, a run's through speed
  held(threshold: number, durationS: number): number // the inverse: the best an all-out athlete holds for this long
  spread(durationS: number): number // how far the ratio varies between athletes, as a share
}
export const DURATION_TABLES: Record<Sport, DurationTable>
export function thresholdOver(
  table: DurationTable,
  efforts: ThresholdEffort[],
  blocks: ThresholdBlock[],
  thresholdHr: number | null,
): ThresholdEstimate | null
// thresholdOver with the sport's table:
export function rideThreshold(efforts, blocks, thresholdHr): ThresholdEstimate | null
export function runThreshold(efforts, blocks, thresholdHr): ThresholdEstimate | null
```

`AnalysisResult.rideThreshold` and `AnalysisResult.runThreshold` (each `ThresholdEstimate | null`) carry them. `rideCp` and
`runCp` stay as the critical-power fits (cp and W') with no veto, and nothing reads them: the curve chart and the race predictions
do not (see "What it replaces"). A sport added to `Sport` has to say how its bests scale (an entry in `DURATION_TABLES`) before it has a threshold.
`efforts.value` is the mean of the rides' estimates or, where it is higher, a backed hour in the window (step 7);
`efforts.strongest` names the hour then.

## Decisions

- **The caller sets threshold heart rate** (0.9 of the sport's reference maximum, as the effort gate draws its hard
  line) and passes it in; the estimator holds no share of its own, so the two cannot drift apart.
- **Efforts under 3 min are ignored; efforts over 60 min are scaled by the same formula** (the ratio keeps falling
  under 1), so a caller that passes a 90 min best gets a slightly higher estimate from it, never a refusal. The same effort
  as a floor is taken as it was held (step 7), so it is not read twice.
- **`efforts.strongest` is the highest estimate among the rides the mean kept, or the backed hour where the hour sets the
  answer.** A ride the second-strongest rule threw out is never named as the proof of the floor, except by its own hour.
  `efforts.rides` counts every ride with an effort of 3 min or more.
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

### Wiring decisions

- **Inputs** (`digest/thresholdEfforts.ts`) are the ride best curve's own: each ride point from 3 to 60 min priced by
  `pointWkg` at the ride's body mass (a ride whose power is set aside, and an estimated point the athlete's heart rate
  does not back, give nothing), the heart rate of a ride set aside is none, and the 5 min blocks come from power-meter
  rides whose power and heart rate are both trusted.
- **Threshold heart rate is 0.9 of the ride effort reference** (`judged.referenceHr.ride`: the maximum the athlete entered,
  else the age-predicted one, else the activities'), the reference the gate judges by.
- **`ageDays` counts from the newest activity of any sport in the set**, so a ride set read after months of running only is
  the less sure for it. In a zone window that is the newest activity up to the window's end.
- **A zone window's step is `{ cp: value, cpSe }`**, for a run as for a ride, with the standard error the power estimate's own relative error times
  the value (`efforts.relativeError`, never under 2.5%): the uncertainty of one window against another, which is what the
  zones' hold asks. The 10th to 90th range is not that: it allows for an athlete above their best, so it is one-sided and about
  6.6% of the value, and settling on it ignored a real 5% rise.
- **A window with any effort of 3 min or more has an estimate**, so the older-fit rule applies to a sport only when a window
  holds none at all (a run with nothing past 2 min, say), and the best-30-min zone floor only where no window does. The
  "outgrown" rule, which kept an older fit from standing in for a window whose steady effort was far above it, had nothing
  left to do for either sport once every window with an effort had an estimate of its own, and is removed (with the
  "your threshold around this date is not settled" line it fed).
- **The window choice is as it was** (`answer/window.ts`): `easy` and `most` stay (see "What it replaces"). Its evidence test
  reads `rideThreshold` where it read `rideCp`, but counts the estimate only where its strongest effort is as long as the
  headline's (a best of 20 min counts as before): the estimate exists from a 3 min effort, and the headline compares at 20 min,
  so a ride known from 5 min efforts alone is not set against a run.
- **The heart-rate line is fitted once per library, not once per window.** The slope within rides, each ride's offset, the
  stuck and far-off rides and the spread come from all the library's power-meter rides, and a run's from all its runs'
  blocks (`librariesOf`, one line per sport, kept in `JudgedWork.lines`), and the timeline's windows and every period read
  that one line (`estimateOver`). Why: fitting it is the
  cost of the estimate (the Theil-Sen over 300 points), so a window per week of a four-year library took about 0.8 s on the
  session loads (3 s before the estimator's own speed-up), against the 0.05 s the loads were budgeted; and a window of a few weeks has too few blocks to fit a line as well as the library does. It also makes the headline
  and the zones agree: both read one line, where each fitting its own gave two thresholds from the same rides. A window keeps what
  is its own: its power estimate (the climb from half to full threshold power is asked of it, so a window of easy rides can
  refuse a line the library accepts), its pooled offset (the median of its own rides' offsets, which a ride with no blocks is read
  at), its highest block, and its efforts. One window that is the whole set gives exactly what fitting its own line gave
  (`thresholdOver` is that case).
- **Each ride is prepared once** (`PreparedRide`: its strongest scaled effort, the efforts the heart rate reads, its blocks), and
  the efforts' value at threshold heart rate and their quality are worked out once against the line, so a window multiplies by
  the recency of each ride and takes the two robust means. The weighted medians inside are found by selection, not sorting.
- **The power estimate's error is read to 0.05 points** (`ERROR_STEP`) for the two things worked out from it: the gap prior
  smeared by it (30,000 exponentials) and the quantiles of the posterior from power alone, which are fixed multiples of the
  power estimate for a given error. Most windows sit at the 2.5% floor. What the rounding costs, measured over errors from 2.5%
  to 25%: no quantile moves by more than one grid step (0.2% of the power estimate), and about 3% of them move at all.

### Decisions for runs and the hour floor

- **The table is a parameter, not a branch.** `PreparedRide` holds the scaled best and the variance of its ratio, worked out with
  the sport's `DurationTable` when the activity is prepared, so the power estimate, the line and the fusion read no sport.
  Rides keep `durationRatio` and `ratioSpread` exactly: their answers move only where the hour floor binds.
- **Runs read their own sport's activities only.** The efforts are the runs'; ages count from the newest activity of any
  sport, as a ride's do. A run's heart-rate blocks and its reference are still prepared the ride's way, and read only if a
  sport's entry in `thresholdReferenceOf` turns heart rate on.
- **The run threshold replaces the critical-power fit as the headline everywhere a headline reads one**: the zones' run steps,
  the evidence rule (`answer/evidence.ts`, with the same 20 min condition as a ride's) and, in the screens, the card, the tile,
  the share card, the records and the Method page. `runCp` stays on the result and nothing reads it.
- **Runs use no heart rate.** The run card and the Method page's run lines say nothing of it, and the run estimate is from pace
  alone (decided after trying heart rate for runs on a real library). The Method page's heart-rate lines name the ride, so a
  reader does not take them for the run's.
- **The hour floor is on the power estimate, not on the fused answer**, so `value > efforts.value` still means exactly that
  heart rate lifted it (a screen says so), and heart rate that reads under an hour done lifts nothing.
- **The floor counts every measured hour in the window, and backs it.** The first version counted any hour, estimated watts
  included, and let a single odd file set the number, since the mean's second-strongest rule does not guard the floor. Now an
  hour from estimated watts is never an hour done, and the best hour is believed only when a second hour in the window is
  within 4% of it or it is no higher than the 90th percentile of the mean's estimate; else the second-best hour stands in, or
  none. It does not weigh by recency: a library window of all time is floored by a backed hour anywhere in the library. The
  4% and the percentile are judgement, not fitted: no case of the simulations has a believable hour over the estimate.
  A lone outlying hour that is real (a day that was far better than the others, with nothing near it) is read as the
  estimate says until a second hour or the rides' own estimates agree; that is the cost.
- **What the floor does to the ride's table.** Riders who never go all out rode some hour, and the floor lifts their
  power-only answer from 13.5% low to 11.7% low; heart rate then has less to add, and its lift over power alone falls from 8.3
  points to 6.6 (the test's bound moves from 7 to 6). No other median moves by more than 0.2 points.
