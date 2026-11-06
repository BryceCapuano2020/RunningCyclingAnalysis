# Estimated one-rep max (spec)

Status: spec, nothing built. It follows the formula rule in [PROCESS.md](../PROCESS.md#formula-and-model-changes):
this spec, the prototype numbers below, then an Opus science review, then code. The first review asked for
changes (curve-centre coverage, the near-top rule, the floor clamp, the eval); this version makes them, and a
second review reads it. Where lifting lives is settled in [strength.md](strength.md), and the evidence is in
[research/strength.md](../research/strength.md). This note holds no owner data. Every lifter here is synthetic.

## What it answers

For each lift (an exercise with its equipment), on the date of its latest session:

- **e1RM**: the load the athlete could most likely lift once on a typical day, with an 80% range. The range is
  for that underlying max, not for one day's test, which varies by about 4% more (section 8).
- **Floor**: the heaviest load they lifted in the window. It is demonstrated, so it has no range.
- **Relative strength**: the e1RM over the body mass in effect on that date.
- **Weekly load**: working sets, hard sets and volume load per week, as the lifting row of weekly load per
  system.

## Sources

| Source                                                                                          | What this spec takes from it                                                                                                                 | Read                   |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Epley; Brzycki 1993; Lombardi (research note, section 2)                                        | The three equations. The point is their median, as the research note recommends.                                                             | Secondary              |
| Nuzzo, Pinto, Nosaka, Steele 2024, Sports Med 54:303, DOI 10.1007/s40279-023-01937-7            | Between-person SD of reps to failure: 2.51 reps at 80% 1RM, 4.36 at 60%. Means about 5 reps at 90% and 15 at 70%. 269 studies, 7,289 people. | Text; figures not read |
| Grgic, Lazinica, Schoenfeld, Pedisic 2020, Sports Med Open 6:31, DOI 10.1186/s40798-020-00260-z | 1RM test-retest CV: median 4.2% (range 0.5 to 12.1%) over 32 studies of familiarised lab tests.                                              | Abstract               |
| Halperin et al. 2022, Sports Med 52:377                                                         | Lifters under-predict reps to failure by 0.95 reps on average (95% CI 0.17 to 1.73), with I² of 98%; accuracy improves near failure.         | Abstract               |
| Zourdos et al. 2016, DOI 10.1519/JSC.0000000000001049                                           | The RIR-based RPE scale: RPE 10 is 0 reps in reserve.                                                                                        | Abstract               |
| Reynolds, Gordon, Robergs 2006; Mayhew 2008 (research note)                                     | Predictions get worse as reps rise.                                                                                                          | Abstract, secondary    |
| LeSuer et al. 1997 (research note)                                                              | Every equation tested under-estimated the deadlift.                                                                                          | Secondary              |
| Jaric 2002, DOI 10.2165/00007256-200232100-00002                                                | Allometric scaling of strength by body mass to the power 0.67.                                                                               | Summary                |

## 1. One set

A set is eligible when it is a working set, has at least one rep and a load above zero, its equipment is not
`bodyweight`, and its effort reads as below.

**Reps to failure.** With RPE logged, the reps in reserve are `k = 10 - rpe`, and `R = reps + 1.25 k`. The extra
quarter stands for Halperin's finding that lifters under-predict their reps in reserve; its size is a design
value (it gives Halperin's mean of about one rep at 4 in reserve). RPE below 6 is 4 or more in reserve, too far
from failure to read a rep count, so the set is not eligible. With no RPE, `R = reps + 2`, the middle of 0 to 4
in reserve. A set is eligible when `R <= 15`.

**Point.** `p = median(Epley, Brzycki, Lombardi)` at load `w` and `R`, with `p = w` at `R = 1`:

- Epley `w (1 + R / 30)`
- Brzycki `36 w / (37 - R)`
- Lombardi `w R^0.10`

**Error, in log units, split by whether it averages out over sessions.** The slope
`s = ln(p(R + 0.5) / p(R - 0.5))` turns an error in reps into one in load (one-sided, `ln(p(R + 1) / p(R))`,
when `R - 0.5 < 1`).

- Systematic, the same for every session of one lifter on one lift:
  - curve: `0.023 sqrt(R - 1)`. The lifter's own reps-to-load curve is not the equations' curve. Fitted to
    Nuzzo's between-person SD turned into load: 2.51 reps at 80% is about 6.3% of the 1RM near 9 reps, and the
    fit gives 4.6% at 5 reps and 8.6% at 15. Nuzzo's SD also holds the error of the tests themselves, so this
    term errs wide.
  - centre: `0.004 (R - 1)`. Where the population's curve sits is itself uncertain: Nuzzo's means put it above
    the equations and LeSuer's deadlifters below. A shift of 1.5 reps at 80% moves the estimate 3 to 4% near
    8 reps (section 7). This term is about one rep of that shift, the spread the generator draws the centre
    with.
  - equations: half the spread of the three equations at `R`, over `p / w`. About 2% at 5 reps and 9% at 14.
  - effort: `s` times 0.25 `k` reps with RPE (the spread of Halperin's bias), or 1.15 reps with none (the SD of
    a uniform 0 to 4, because a lifter's habit is the same set to set).
- Independent, different each session:
  - day: 0.042, Grgic's median test-retest CV, since a set measures that day's strength;
  - RPE noise: `s` times `0.5 + 0.25 k` reps. Smaller near failure, as Halperin found. Its size is a design value.

`sys` is the root sum of squares of the four systematic terms, and `ind` of the two independent ones.

## 2. One session, then the lift

A session is one lift on one date. Its estimate is its eligible set with the highest point: later sets carry
fatigue and read low.

The lift's estimate on date `t` uses the sessions in the 56 days up to `t`. `t` is the date of its newest
session, so a lift not trained lately still has an answer, dated. Each session gets the weight

`weight = recency * nearTop / (sys^2 + ind^2)`

- `recency = 0.5^(days before t / 14)`;
- `nearTop` is 1 for a session whose best set has RPE. For a session with no RPE it is
  `1 / (1 + exp(-(p / top - 0.96) / 0.015))`, with `top` the second-highest session point in the 28 days up to
  `t` (the highest when there is one). A deload with no RPE reads as a maximal effort at `reps + 2` and would
  pull the estimate down. With RPE it reads correctly and needs no help. The constants are the threshold
  estimator's ([threshold.md](threshold.md), step 2). Taking `top` from the last 28 days lets the estimate
  follow a real loss of strength.

Then, with `q` each session's share of the weights:

- `point = sum(q p)`;
- `sd = hypot(sum(q sys), sqrt(sum(q^2 ind^2)))`: the systematic part does not shrink with more sessions; the
  independent part does;
- range `[point exp(-1.2816 sd), point exp(1.2816 sd)]`, an 80% range;
- a lift the catalog puts in the deadlift family widens the top by 5% more, for LeSuer's under-estimate. An
  exercise the catalog does not know never gets it;
- the floor bounds it: `point`, `low` and `high` are each at least the floor, so `floor <= low <= point <= high`.

**Worked example,** one session of 100 kg for 5 at RPE 8: `R = 7.5`. The tests pin the exact figures from code.

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
- `e1RM / mass^0.67` (Jaric), for comparing across a change in body mass. The ratio is its sensitivity check
  (research note, section 6).

Mass error in log units: `0.01 + 0.005` per 30 days since the mass was entered, at most 0.04 (reached at 180
days). This is a design value: about the daily swing of body mass, then growing with age. It joins the e1RM's
`sd` in quadrature, times the exponent. With no mass entered, or the latest more than 365 days before the
estimate, relative strength is absent.

## 5. Weekly load

Weeks are the app's calendar weeks (Monday start, `weekOfDay`). Per week, for each body region of the catalog
(lower, upper, other):

- working sets;
- hard sets: working sets at RPE 7 or higher, so 3 or fewer in reserve. Sets with no RPE are counted apart as
  effort unknown, never guessed;
- volume load: the sum of reps times load, kg. A dumbbell lift the catalog marks as using a pair counts both
  dumbbells. A bodyweight lift counts its added load only, and the row says so.

A set not marked as a warm-up counts as one for weekly load when it is lighter than 70% of that session's top
load for the lift and comes before the top set. A CSV from an app with no set type (Strong has none) would
otherwise count its warm-ups as work. The estimator needs no such rule: light sets never carry a session's
best point.

These sit beside the run and ride rows as their own row. They are never summed with hours, kilojoules or heart
rate points ([strength.md](strength.md), decision 7).

## 6. Equipment and the exercise key

A lift is `exercise` plus `equipment`, and the two together are its key: `back-squat` on a `barbell` and on a
`smith` are two lifts. Machine maxima run higher than free-weight ones (research note, section 5), so pooling
them biases both. A dumbbell load is one dumbbell. The core catalog names each exercise, its body region,
whether it is in the deadlift family, whether it moves body weight, and whether its dumbbell form uses a pair.
An exercise the catalog does not know has region other. Two machines of one name in two gyms are two lifts if
the athlete names them apart (`leg-press-home`): the exercise is a slug the athlete may type.

## 7. Prototype on synthetic lifters

**Generator.** Each lifter's true reps-to-failure curve is drawn. Reps at 80% are normal with SD 2.51 (Nuzzo),
cut to 4 to 16, around a centre that is itself drawn per lifter from normal(8.5, 1): 8.5 sits between the
equations' median (8.2) and Nuzzo's means, and the spread of 1 stands for not knowing where real lifters sit.
The shape is one of two, half each: `R = 1 + K (1/f - 1)`, or `f = 0.45 + 0.55 exp(-c (R - 1))`. Neither is one
of the three equations. Each lifter trains for 40 weeks, twice a week, three working sets after warm-ups at
50%, 70% and 85%. True 1RM gains 0.4% a week. Each fifth week is a deload at 90% load with 3 more reps in
reserve. Each day's strength varies by 4.2%. Each earlier set costs 0.7 of a rep to failure. Logged RPE is
`10 - (0.75 x true RIR + noise)`, with noise SD `0.5 + 0.25 x true RIR`, rounded to halves, between 5 and 10.

**Scenarios,** 100 lifters each:

- strength 1 to 5 reps;
- hypertrophy 8 to 12;
- high reps 12 to 15;
- mixed 1 to 15;
- no RPE;
- half the sets with RPE, and a last set to failure;
- noisy RPE (double noise, 40% under-prediction);
- deloads every fourth week, unflagged warm-ups and a 6-week break;
- deadlift, at a curve centre of 7 (LeSuer's direction);
- novice, gaining 1.5% a week;
- a 5% loss over two weeks, scored from 2 to 4 weeks after it;
- misspecified: a third curve shape (`f = R^-p`, Lombardi's family), 50% under-prediction and a day SD of 6%,
  none of which the estimator assumes.

The estimate is scored at every session from day 14, against the underlying true 1RM. Coverage is the mean of
each lifter's share, so a lifter counts once; ± is 1.96 standard errors across lifters. Constants were set on
tuning seeds and checked on held-out seeds.

| Scenario (held-out)  |  Bias | 90th pct error | In range | True above range | True below | Range width |
| -------------------- | ----: | -------------: | -------: | ---------------: | ---------: | ----------: |
| strength 1 to 5      | +0.1% |           9.4% |  86 ± 6% |              14% |         1% |         13% |
| hypertrophy 8 to 12  |  0.0% |          18.1% |  85 ± 7% |              15% |         1% |         25% |
| high reps 12 to 15   | -0.6% |          20.7% |  86 ± 7% |              14% |         0% |         31% |
| mixed 1 to 15        | -0.1% |          13.8% |  84 ± 6% |              15% |         1% |         19% |
| no RPE               | +0.9% |          13.5% |  86 ± 7% |              13% |         1% |         20% |
| half RPE, to failure | +2.1% |          12.2% |  86 ± 6% |              11% |         3% |         19% |
| noisy RPE            | -1.7% |          15.6% |  79 ± 7% |              21% |         0% |         17% |
| deload and break     | -0.3% |          12.2% |  83 ± 6% |              16% |         1% |         16% |
| deadlift             | -2.6% |          14.7% |  82 ± 7% |              18% |         0% |         19% |
| novice               | -1.6% |          14.6% |  81 ± 7% |              19% |         0% |         17% |
| 5% loss              |  0.0% |          13.2% |  83 ± 7% |              15% |         2% |         16% |
| misspecified         | -4.5% |          10.4% |  77 ± 6% |              23% |         0% |         15% |

Pooled, 83% of held-out ranges hold the truth (82% on tuning seeds). Bias is the median signed error. Width is
the range over the truth. Without the deadlift's extra 5%, the deadlift scenario holds 69%.

**Alternatives, same held-out lifters:**

| Rule                                                                                  | Pooled in range | Weakest scenario | Bias          | Width     |
| ------------------------------------------------------------------------------------- | --------------: | ---------------- | ------------- | --------- |
| This spec                                                                             |             83% | misspecified 77% | -4.5 to +2.1% | 13 to 31% |
| Research note: highest set point, range from the highest low and highest high, cap 15 |             94% | 5% loss 87%      | +2.8 to +9.6% | 25 to 44% |
| This spec, cap 10                                                                     |             79% | high reps 63%    | -5.7 to +1.7% | 13 to 22% |
| This spec, near-top weight on every session                                           |             86% | 5% loss 74%      | +0.9 to +4.4% | 16 to 33% |
| This spec, no under-prediction term (`R = reps + k`)                                  |             81% | misspecified 72% | -5.2 to +1.5% | 12 to 31% |

- The research note's rule picks the luckiest set: it reads high everywhere and its range is wide.
- A cap of 10 applied after reading RPE lets through only the sets whose reserve was under-reported, so high
  reps read 5.7% low.
- The near-top weight on sessions with RPE kept the lucky ones and hid the low bias of RPE; it also held the
  old level after a loss.

**Sensitivity to where real lifters sit,** held-out, with every lifter at one fixed centre:

|                                 Centre (reps at 80%) | Pooled in range | Bias range    | Weakest scenario  |
| ---------------------------------------------------: | --------------: | ------------- | ----------------- |
| 7.0 (fewer reps per load, like LeSuer's deadlifters) |             69% | -6.8 to -1.5% | noisy RPE, 63%    |
|                                                  8.5 |             86% | -4.4 to +2.2% | misspecified, 80% |
|        10.0 (more reps per load, like Nuzzo's means) |             93% | -3.2 to +5.0% | half RPE, 88%     |

If real lifters do fewer reps per load than the equations assume, the ranges are too narrow and the estimate
reads low. Covering a centre of 7 as well would widen every range by about a third. The answer is the check on
the athlete's own data in section 10, not a wider range for everyone.

## 8. Calibration evals

`packages/core/src/lift/e1rm.sim.test.ts` runs the generator above with fixed seeds, 100 lifters a scenario, on
held-out seeds with the drawn centre, and fails when:

- pooled coverage leaves 80% to 90%;
- any scenario's coverage falls under 75%;
- any scenario's median bias leaves -5% to +5%;
- the 5% loss scenario's coverage, 2 to 4 weeks after the loss, falls under 75%;
- any estimate breaks `floor <= low <= point <= high`, or any figure is not finite.

It also prints the fixed-centre table, so a change that moves it shows in the log.

A fast unit test pins the worked example's point, each error term and its range, and that `R = 1`, `R = 15`, a
fractional RPE and a single session give finite figures.

A check on one day's heavy single uses `hypot(sd, 0.042)`: the day's own variation is not in the range of the
underlying max.

## 9. Constants

| Constant                    |                                                      Value | Source                                                 |
| --------------------------- | ---------------------------------------------------------: | ------------------------------------------------------ |
| Equations                   |                           Epley, Brzycki, Lombardi, median | Research note                                          |
| Rep cap on `R`              |                                                         15 | This prototype (section 7). The research note said 10. |
| RPE floor                   |                                                          6 | Zourdos scale                                          |
| Under-prediction            |                                        `0.25 k` reps added | Halperin 2022 direction; size a design value           |
| Reps in reserve with no RPE |                                                 2, SD 1.15 | Uniform 0 to 4, research note                          |
| Curve SD                    |                                        `0.023 sqrt(R - 1)` | Nuzzo 2024                                             |
| Centre SD                   |                                            `0.004 (R - 1)` | This prototype (section 7)                             |
| Day SD                      |                                                      0.042 | Grgic 2020                                             |
| RPE systematic SD           |                                              `0.25 k` reps | Halperin 2022 spread; size a design value              |
| RPE noise SD                |                                        `0.5 + 0.25 k` reps | Halperin 2022 shape; size a design value               |
| Window                      |                                                    56 days | Research note                                          |
| Recency half-life           |                                                    14 days | Design value                                           |
| Near the top (no RPE only)  |                              0.96, 0.015, top from 28 days | threshold.md                                           |
| Range                       |                                             80% (z 1.2816) | Design value                                           |
| Deadlift top                |                                                        +5% | LeSuer direction; size from the deadlift scenario      |
| Allometric exponent         |                                                       0.67 | Jaric 2002                                             |
| Mass SD                     | 0.01 + 0.005 per 30 days, at most 0.04; none past 365 days | Design value                                           |
| Hard set                    |                                            RPE 7 or higher | Design value                                           |
| Unmarked warm-up            |                  under 70% of the session's top, before it | Design value                                           |

`LIFT_REVISION` starts at 1 and moves with any change here. It is not `MODEL_REVISION` ([strength.md](strength.md),
decision 3).

## 10. Open

- Which curve centre real lifters sit at (section 7). Once the athlete has logged for a while, predict each heavy
  single from the sets before it and count how often it lands within `hypot(sd, 0.042)`. Run it as the first
  check after release, before the estimate leads anything.
- The sizes of the effort terms (`0.25 k` both ways): Halperin gives the direction and a pooled mean only.
