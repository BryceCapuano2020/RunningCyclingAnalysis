# Estimated one-rep max (spec)

Status: spec, nothing built. It follows the formula rule in [PROCESS.md](../PROCESS.md#formula-and-model-changes):
this spec, the prototype numbers below, then an Opus science review, then code. Where lifting lives (the set
record, storage, `LiftState` beside the session state) is settled in [strength.md](strength.md); the evidence is
in [research/strength.md](../research/strength.md). This note holds no owner data. Every lifter here is synthetic.

## What it answers

For each lift (an exercise with its equipment), on the date of its latest session:

- **e1RM**: the load the athlete could most likely lift once, with an 80% range.
- **Floor**: the heaviest load they lifted in the window. It is demonstrated, so it has no range.
- **Relative strength**: the e1RM over the body mass in effect on that date.
- **Weekly load**: working sets, hard sets and volume load per week, as the lifting row of weekly load per
  system.

## Sources

| Source                                                                                          | What this spec takes from it                                                                                                                 | Read                   |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Epley; Brzycki 1993; Lombardi (research note, section 2)                                        | The three equations. The point is their median, as the research note recommends.                                                             | Secondary              |
| Nuzzo, Pinto, Nosaka, Steele 2024, Sports Med 54:303, DOI 10.1007/s40279-023-01937-7            | Between-person SD of reps to failure: 2.51 reps at 80% 1RM, 4.36 at 60%. Means about 5 reps at 90% and 15 at 70%. 269 studies, 7,289 people. | Full text, figures not |
| Grgic, Lazinica, Schoenfeld, Pedisic 2020, Sports Med Open 6:31, DOI 10.1186/s40798-020-00260-z | 1RM test-retest CV: median 4.2% (range 0.5 to 12.1%) over 32 studies.                                                                        | Abstract               |
| Halperin et al. 2022, Sports Med 52:377                                                         | Lifters under-predict reps to failure by 0.95 reps on average (95% CI 0.17 to 1.73), with I² of 98%; accuracy improves near failure.         | Abstract               |
| Zourdos et al. 2016, DOI 10.1519/JSC.0000000000001049                                           | The RIR-based RPE scale: RPE 10 is 0 reps in reserve.                                                                                        | Abstract               |
| Reynolds, Gordon, Robergs 2006; Mayhew 2008 (research note)                                     | Predictions get worse as reps rise.                                                                                                          | Abstract, secondary    |
| LeSuer et al. 1997 (research note)                                                              | Every equation tested under-estimated the deadlift.                                                                                          | Secondary              |
| Jaric 2002, DOI 10.2165/00007256-200232100-00002                                                | Allometric scaling of strength by body mass to the power 0.67.                                                                               | Summary                |

## 1. One set

A set is eligible when it is a working set (not a warm-up), has at least one rep and a load above zero, its
equipment is not `bodyweight`, and its effort reads as below.

**Reps to failure.** With RPE logged, the reps in reserve are `k = 10 - rpe` and `R = reps + k`. RPE below 6 is
4 or more in reserve, too far from failure to read a rep count, so the set is not eligible. With no RPE,
`R = reps + 2`, the middle of 0 to 4 in reserve. A set is eligible when `R <= 15`.

**Point.** `p = median(Epley, Brzycki, Lombardi)` at load `w` and `R`, with `p = w` at `R = 1`:

- Epley `w (1 + R / 30)`
- Brzycki `36 w / (37 - R)`
- Lombardi `w R^0.10`

**Error, in log units, split by whether it averages out over sessions:**

- Systematic, the same for every session of one lifter on one lift:
  - curve: `0.023 sqrt(R - 1)`. The lifter's own reps-to-load curve is not the equations' curve. Fitted to
    Nuzzo's between-person SD turned into load: 2.51 reps at 80% is about 6.3% of the 1RM near 9 reps, and
    the fit gives 4.6% at 5 reps and 8.6% at 15.
  - equations: half the spread of the three equations at `R`, over `p / w`. About 2% at 5 reps and 9% at 14.
    The research note names this spread as an uncertainty term.
  - effort: the rep error times the slope `s = ln(p(R + 0.5) / p(R - 0.5))`. Logged RPE: `0.25 k` reps, which
    stands for Halperin's mean under-prediction of about one rep. No RPE: 1.15 reps, the SD of a uniform 0 to 4,
    because a lifter's habit is the same set to set.
- Independent, different each session:
  - day: 0.042, Grgic's median test-retest CV, since a set measures that day's strength.
  - RPE noise: `(0.5 + 0.25 k)` reps times `s`. Smaller near failure, as Halperin found. Its size is a design
    value.

`sys = hypot(curve, equations, effort)` and `ind = hypot(day, rpe noise)`.

The mean under-prediction is carried as error, not added to `R`. Its I² is 98%, so moving every lifter by the
pooled mean would be wrong for most. On the prototype, adding `0.25 k` to `R` raised the bias of the strength
lifters from +1.5% to +3.5% and cut coverage in two scenarios (out of 9) below 80%.

## 2. One session, then the lift

A session is one lift on one date. Its estimate is its eligible set with the highest point: later sets carry
fatigue and read low.

The lift's estimate on date `t` uses the sessions in the 56 days up to `t`. `t` is the date of its newest
session, so a lift not trained lately still has an answer, dated. Each session gets the weight

`weight = recency * nearTop / (sys^2 + ind^2)`

- `recency = 0.5^(days before t / 14)`;
- `nearTop = 1 / (1 + exp(-(p / top - 0.96) / 0.015))`, with `top` the second-highest session point (the
  highest when there is one session). Deload and light sessions sit far below the top and drop out, as easy
  rides do in the threshold estimate ([threshold.md](threshold.md), step 2, the same two constants).

Then, with `q` each session's share of the weights:

- `point = sum(q p)`;
- `sd = hypot(sum(q sys), sqrt(sum(q^2 ind^2)))`: the systematic part does not shrink with more sessions; the
  independent part does;
- range `[point exp(-1.2816 sd), point exp(1.2816 sd)]`, an 80% range;
- a lift in the deadlift family widens the top by 5% more, for LeSuer's under-estimate. This value is a
  placeholder;
- the floor bounds it: point and low are at least the floor.

## 3. Floor and rep bests

**Floor:** the heaviest load of any working set in the window, with its reps and date. The athlete lifted it,
so it is never a range. A bodyweight lift has rep bests at each added load instead, and no e1RM until the
share of body mass a pull-up or dip moves is known (research note, section 5).

**Rep bests:** the heaviest load at each rep count from 1 to 15 in the window, shown beside the estimate and
never as one.

## 4. Relative strength

Body mass is the dated mass in effect on the estimate's date (`bodyMassOn`, the rule every sport uses). Two
figures:

- `e1RM / mass`, "times body mass", the figure lifters use;
- `e1RM / mass^0.67` (Jaric), for comparing across a change in body mass. The exponent is a constant, and the
  ratio is its sensitivity check (research note, section 6).

Mass error in log units: `0.01 + 0.005` per 30 days since the mass was entered, at most 0.04. This is a design
value: about the daily swing of body mass, then growing with age. It joins the e1RM's `sd` in quadrature, times
the exponent. With no mass entered, relative strength is absent.

## 5. Weekly load

Weeks are the app's calendar weeks (Monday start, `weekOfDay`). Per week, for each body region of the catalog
(lower, upper, other):

- working sets;
- hard sets: working sets at RPE 7 or higher, so 3 or fewer in reserve. Sets with no RPE are counted apart as
  effort unknown, never guessed;
- volume load: the sum of reps times load, kg. A bodyweight lift counts its added load only, and the row says
  so.

These sit beside the run and ride rows as their own row. They are never summed with hours, kilojoules or heart
rate points ([strength.md](strength.md), decision 7).

## 6. Equipment and the exercise key

A lift is `exercise` plus `equipment`, and the two together are its key: `back-squat` on a `barbell` and on a
`smith` are two lifts. Machine maxima run higher than free-weight ones (research note, section 5), so pooling
them biases both. A dumbbell load is one dumbbell. The core catalog names each exercise, its body region, and
whether it is in the deadlift family or moves body weight. An exercise the catalog does not know has region
other.

## 7. Prototype on synthetic lifters

**Generator.** Each lifter's true reps-to-failure curve is drawn: reps at 80% ~ normal(8.5, 2.51), cut to 4 to 16. The SD is Nuzzo's. The centre sits between the equations' median (8.2) and Nuzzo's means (about 8.7). The
shape is one of two, half each: `R = 1 + K (1/f - 1)`, or `f = 0.45 + 0.55 exp(-c (R - 1))`. Neither is one of
the three equations. Each lifter trains for 40 weeks, twice a week, three working sets after warm-ups at 50%,
70% and 85%. True 1RM gains 0.4% a week. Each fifth week is a deload at 90% load and 3 more reps in reserve.
Each day's strength varies by 4.2%. Each earlier set costs 0.7 of a rep to failure. Logged RPE is
`10 - (0.75 x true RIR + noise)`, with noise SD `0.5 + 0.25 x true RIR`, rounded to halves and kept between 5 and 10.

**Scenarios,** 100 lifters each:

- strength 1 to 5 reps;
- hypertrophy 8 to 12;
- high reps 12 to 15;
- mixed 1 to 15;
- no RPE;
- half the sets with RPE, and a last set to failure;
- noisy RPE (double noise, 40% under-prediction);
- deloads every fourth week, unflagged warm-ups and a 6-week break;
- deadlift.

The estimate is scored at every session from day 14, against the underlying true 1RM, not that day's.
Constants were set on tuning seeds and checked on held-out seeds.

| Scenario (held-out)  |  Bias | 90th pct error | In range | True above range | True below | Range width |
| -------------------- | ----: | -------------: | -------: | ---------------: | ---------: | ----------: |
| strength 1 to 5      | +2.8% |           7.6% |      92% |               5% |         3% |         15% |
| hypertrophy 8 to 12  | +3.1% |          13.4% |      88% |              10% |         2% |         26% |
| high reps 12 to 15   | +1.6% |          15.0% |      89% |              10% |         1% |         31% |
| mixed 1 to 15        | +2.6% |          10.4% |      90% |               8% |         2% |         19% |
| no RPE               | +1.4% |           9.7% |      88% |              12% |         1% |         19% |
| half RPE, to failure | +3.7% |          12.1% |      83% |               7% |        10% |         18% |
| noisy RPE            | +2.6% |          10.5% |      89% |               9% |         3% |         18% |
| deload and break     | +2.3% |           9.0% |      89% |               8% |         3% |         16% |
| deadlift             | +2.7% |           8.2% |      93% |               3% |         4% |         21% |

Pooled, 89% of held-out ranges hold the truth, and 87% of tuning ranges. Bias is the median signed error.
Width is the range over the truth.

**Alternatives, same held-out lifters:**

| Rule                                                                          | Pooled in range | Bias          | Width     | Note                                                                                  |
| ----------------------------------------------------------------------------- | --------------: | ------------- | --------- | ------------------------------------------------------------------------------------- |
| This spec                                                                     |             89% | +1.4 to +3.7% | 15 to 31% |                                                                                       |
| Research note: highest set point, range from the highest low and highest high |             93% | +1.5 to +6.3% | 22 to 33% | Picks the luckiest set. 30% of high-rep sessions have no estimate (cap 10).           |
| This spec with the cap at 10 reps                                             |             85% | -5.9 to +3.0% | 14 to 19% | High reps read 5.9% low and 64% in range: only the sets that fell short pass the cap. |

**Sensitivity to the population's curve,** held-out:

|                                 Centre (reps at 80%) | Pooled in range | Bias range    | Weakest scenario |
| ---------------------------------------------------: | --------------: | ------------- | ---------------- |
| 7.0 (fewer reps per load, like LeSuer's deadlifters) |             78% | -4.6 to +0.3% | no RPE, 68%      |
|                                                  8.5 |             89% | +1.4 to +3.7% | half RPE, 83%    |
|        10.0 (more reps per load, like Nuzzo's means) |             85% | +4.6 to +7.5% | half RPE, 72%    |

The range is honest at the centre the population is drawn from, and the bias moves 3 to 4% for each 1.5 reps
of curve shift. Which centre real lifters sit at is the open question: Nuzzo's means imply the equations read
high, LeSuer's deadlifters imply low.

## 8. Calibration evals

`packages/core/src/lift/e1rm.sim.test.ts` runs the generator above (seeded, at least 30 lifters a scenario) and
fails when, on held-out seeds at centre 8.5: pooled coverage leaves 80% to 95%; any scenario's coverage falls
under 75%; any scenario's median bias leaves -4% to +5%; or the floor is ever above the estimate's low end. A
fast unit test pins the worked example: 100 kg for 5 at RPE 8 gives `R = 7`, and Epley 123.3, Brzycki 120.0 and
Lombardi 121.5 kg, so a point of 121.5 kg, with the set's `sys` and `ind` from section 1.

## 9. Constants

| Constant                    |                                  Value | Source                                                 |
| --------------------------- | -------------------------------------: | ------------------------------------------------------ |
| Equations                   |       Epley, Brzycki, Lombardi, median | Research note                                          |
| Rep cap on `R`              |                                     15 | This prototype (section 7). The research note said 10. |
| RPE floor                   |                                      6 | Zourdos scale                                          |
| Reps in reserve with no RPE |                             2, SD 1.15 | Uniform 0 to 4, research note                          |
| Curve SD                    |                    `0.023 sqrt(R - 1)` | Nuzzo 2024                                             |
| Day SD                      |                                  0.042 | Grgic 2020                                             |
| RPE systematic SD           |                          `0.25 k` reps | Halperin 2022, size a design value                     |
| RPE noise SD                |                    `0.5 + 0.25 k` reps | Halperin 2022 shape, size a design value               |
| Window                      |                                56 days | Research note                                          |
| Recency half-life           |                                14 days | Design value                                           |
| Near the top                |                            0.96, 0.015 | threshold.md                                           |
| Range                       |                         80% (z 1.2816) | Design value                                           |
| Deadlift top                |                                    +5% | LeSuer direction, size a placeholder                   |
| Allometric exponent         |                                   0.67 | Jaric 2002                                             |
| Mass SD                     | 0.01 + 0.005 per 30 days, at most 0.04 | Design value                                           |
| Hard set                    |                        RPE 7 or higher | Design value                                           |

`LIFT_REVISION` starts at 1 and moves with any change here. It is not `MODEL_REVISION` ([strength.md](strength.md),
decision 3).

## 10. Open for the review

- Which curve centre to trust (section 7). A later check on the athlete's own data: predict each heavy single
  from the sets before it and count how often it lands in the range.
- Whether `0.25 k` is the right size for the effort error.
- Whether the deadlift's +5% should stay without a sourced size.
