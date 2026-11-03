# Ride threshold from many efforts (design)

Status: in progress. Approved by the owner; built in packages: the estimator in core (`packages/core/src/threshold/`),
then its wiring into the analysis, the zones and the window choice (built), then the screens that read it. The
simulation behind the evidence table is `packages/core/src/threshold/threshold.sim.test.ts`. This note holds no owner data.

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
   answer and never lowers it.** With no heart rate the answer is the power estimate itself: the median from power
   alone, about 3% over it, is an allowance for bests short of all-out that nothing in the rides confirms. With a
   heart-rate estimate the answer is the median of its posterior, no higher than heart rate reads and no lower than the
   power estimate, so heart rate that agrees with the power estimate adds nothing. The range is the higher of each pair
   of 10th and 90th percentiles (elementwise, so the upper end that power alone allows stays when heart rate lifts the
   answer).

Null when the window has no ride effort of 3 min or more, and when no ride has any weight to give (an age that is
not a number, or so old the recency weight underflows). A single ride is enough: it is the estimate, with the
error that one ride carries.

## What it replaces

The effort gate no longer withholds a threshold. `gatedThreshold`'s veto, the best-30-min floor on the
headline and on zones, the 3 to 10 min fit as a range top, and the per-window hard check behind zones go.
The gate's verdict stays as a detail label. Runs keep their critical-power fit without the veto: a run
version needs its own duration table (short running bests are often intervals or GPS noise), later.

**The window choice keeps its hard check for now.** The default period still passes over a window in which a sport's
best 20 min was not hard (`easy`, and `most` when no window qualifies), as before. Run thresholds are not floor-aware
yet, and on a real library a default of 12 weeks of easy runs read a run threshold 10% slow against 6 and 12 months.
The rule only picks which period opens first and never hides a number. It goes when runs get the floor-aware estimate.

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
| Clean heart rate                  | -1.9%, 89%, 96% | -3.1%, 80%, 96%             |
| A bad strap on 1 ride in 4        | -2.0%, 90%, 96% | -3.2%, 77%, 96%             |
| Max heart rate off by about 8 bpm | -1.5%, 77%, 83% | -3.1%, 80%, 96%             |
| Flat (optical) heart rate         | -3.1%, 80%, 96% | -3.1%, 80%, 96%             |
| Never all-out (tempo only)        | -5.2%, 48%, 81% | -13.5%, 0%, 63%             |
| No heart rate                     | -3.1%, 80%, 96% | -3.1%, 80%, 96%             |

These riders' bests sit a few percent under all-out, so without heart rate the answer reads about 3% low. The
allowance read them better (+0.2% and 92% within 5% with no heart rate, +0.4% and 94% with a clean one) and was dropped
on the owner's call, from a real library: a rider whose strongest rides keep reaching the same ceiling read about 3%
high with it. The duration ratio already takes a best as all-out, so on a rider whose bests are, the allowance counts the
same doubt twice. Heart rate still lifts the riders the simulation draws short of all-out.

The old rules of thumb on the same riders, median error and share within 5%: best 30 min -11% and 0% (-9% and 0%
for tempo only), 95% of best 20 min -7% and 40% (-14% and 0% for tempo only).

The heart-rate line is refused for 0.3% of riders in the clean case (3 of 1,200, all `flat`), 1% with the bad strap,
and 88% with the optical strap, where the climb is a third of what it should be and the answer is the power-only one.
Heart rate alone, before fusion, reads 3.5% under the truth in the clean case with a spread of 5.2%, where it states
3.6%: it is biased low, so under lift-only fusion it can miss a lift but cannot cause a drop. Seeds 11 to 14 agree within 4
points on every cell.

The test asserts, per case: clean heart rate within 3% on the median and 85% within 5%; a bad strap 85%; a maximum
heart rate off by about 8 bpm 65%; optical heart rate 70%; tempo only a median no lower than -7% and at least 4 points
above the power-only answer; no heart rate at most 4% low on the median and 75% within 5%; in every case nearer the truth
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

### Wiring decisions

- **Inputs** (`digest/thresholdEfforts.ts`) are the ride best curve's own: each ride point from 3 to 60 min priced by
  `pointWkg` at the ride's body mass (a ride whose power is set aside, and an estimated point the athlete's heart rate
  does not back, give nothing), the heart rate of a ride set aside is none, and the 5 min blocks come from power-meter
  rides whose power and heart rate are both trusted.
- **Threshold heart rate is 0.9 of the ride effort reference** (`judged.referenceHr.ride`: the maximum the athlete entered,
  else the age-predicted one, else the activities'), the reference the gate judges by.
- **`ageDays` counts from the newest activity of any sport in the set**, so a ride set read after months of running only is
  the less sure for it. In a zone window that is the newest activity up to the window's end.
- **A zone window's ride step is `{ cp: value, cpSe }`**, with the standard error the power estimate's own relative error times
  the value (`efforts.relativeError`, never under 2.5%): the uncertainty of one window against another, which is what the
  zones' hold asks. The 10th to 90th range is not that: it allows for an athlete above their best, so it is one-sided and about
  6.6% of the value, and settling on it ignored a real 5% rise. Run windows keep their critical-power fit and read the runs alone.
- **A window with any ride effort has an estimate**, so the older-fit and outgrown rules apply to rides only when a window
  holds no ride effort at all, and the best-30-min zone floor only where no window does.
- **The window choice is as it was** (`answer/window.ts`): `easy` and `most` stay (see "What it replaces"). Its evidence test
  reads `rideThreshold` where it read `rideCp`, but counts the estimate only where its strongest effort is as long as the
  headline's (a best of 20 min counts as before): the estimate exists from a 3 min effort, and the headline compares at 20 min,
  so a ride known from 5 min efforts alone is not set against a run.
- **The heart-rate line is fitted once per library, not once per window.** The slope within rides, each ride's offset, the
  stuck and far-off rides and the spread come from all the library's power-meter rides (`rideLibraryOf`, kept in
  `JudgedWork.rideLine`), and the timeline's windows and every period read that one line (`estimateOver`). Why: fitting it is the
  cost of the estimate (the Theil-Sen over 300 points), so a window per week of a four-year library took about 0.8 s on the
  session loads (3 s before the estimator's own speed-up), against the 0.05 s the loads were budgeted; and a window of a few weeks has too few blocks to fit a line as well as the library does. It also makes the headline
  and the zones agree: both read one line, where each fitting its own gave two thresholds from the same rides. A window keeps what
  is its own: its power estimate (the climb from half to full threshold power is asked of it, so a window of easy rides can
  refuse a line the library accepts), its pooled offset (the median of its own rides' offsets, which a ride with no blocks is read
  at), its highest block, and its efforts. One window that is the whole set gives exactly what fitting its own line gave
  (`rideThreshold` is that case).
- **Each ride is prepared once** (`PreparedRide`: its strongest scaled effort, the efforts the heart rate reads, its blocks), and
  the efforts' value at threshold heart rate and their quality are worked out once against the line, so a window multiplies by
  the recency of each ride and takes the two robust means. The weighted medians inside are found by selection, not sorting.
- **The power estimate's error is read to 0.05 points** (`ERROR_STEP`) for the two things worked out from it: the gap prior
  smeared by it (30,000 exponentials) and the quantiles of the posterior from power alone, which are fixed multiples of the
  power estimate for a given error. Most windows sit at the 2.5% floor. What the rounding costs, measured over errors from 2.5%
  to 25%: no quantile moves by more than one grid step (0.2% of the power estimate), and about 3% of them move at all.
