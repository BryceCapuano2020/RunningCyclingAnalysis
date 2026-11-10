# Estimated one-rep max (spec)

Status: built (#465, `LIFT_REVISION` 1); this revision (2: the near-top window, the change rule in section 10)
is specified and waits for its code. It follows the formula rule in [PROCESS.md](../PROCESS.md#formula-and-model-changes):
spec, prototype numbers, Opus science review, then code. Each change here went through review rounds before code. Where lifting lives is settled in [strength.md](strength.md), and the evidence is in
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
`s = (1 / (30 + R) + 1 / (37 - R) + 0.1 / R) / 3`, the mean of the three equations' log-slopes, turns an error
in reps into one in load. It is smooth in `R`; the slope of the median would jump where the median changes
equation (near 5.8 and 7.3 reps).

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
  `1 / (1 + exp(-(p / top - 0.96) / 0.015))`, with `top` the second-highest session point among the sessions of
  the 14 days up to `t`, or of the last 3 sessions within 28 days when those 14 days hold fewer (the highest when there is one). The
  28-day limit keeps the first session back from a long break from taking a pre-break session as its top. A deload with no RPE reads as a maximal effort at `reps + 2` and would
  pull the estimate down. With RPE it reads correctly and needs no help. The constants are the threshold
  estimator's ([threshold.md](threshold.md), step 2). Taking `top` from the last 14 days lets the estimate
  follow a real loss of strength: with 28 days, a lifter with no RPE who lost 5% was still read 4.5% high two to
  four weeks later, and that scenario's range held the truth 72% of the time (`top28` below). The 3-session floor
  keeps a lift trained once a week from taking its own deload as the top: with 14 days alone, a once-a-week lift
  with no RPE read 2.1% low and held 82%.

Then, with `q` each session's share of the weights:

- `point = sum(q p)`;
- `sd = hypot(sum(q sys), sqrt(sum(q^2 ind^2)))`: the systematic part does not shrink with more sessions; the
  independent part does;
- range `[point exp(-1.1 sd), point exp(1.5 sd)]`, an 80% range with more of it above the point. A symmetric
  range missed above 11 to 23% of the time and below 0 to 3% (section 7): the error has a long upper tail, and
  the high end is the figure an athlete tries to beat;
- a lift the catalog puts in the deadlift family widens the top by 5% more, for LeSuer's under-estimate. An
  exercise the catalog does not know never gets it;
- the floor bounds it: `point`, `low` and `high` are each at least the floor, so `floor <= low <= point <= high`.

**Worked example,** one session of 100 kg for 5 at RPE 8, by hand: `R = 5 + 1.25 x 2 = 7.5`; Epley 125.00,
Brzycki 122.03, Lombardi 122.32 kg, so `p = 122.32`; `s = 0.02463`; curve 0.05864, centre 0.02600, equations
0.01212, effort 0.01232, so `sys = 0.06643`; day 0.042 and RPE noise 0.02463, so `ind = 0.04869`;
`sd = 0.08237`; range 111.7 to 138.4 kg. The unit test pins these hand figures.

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
estimate, relative strength is absent. A profile mass with no date is used at the largest error (0.04) and
its age is unknown; a placeholder mass the athlete never entered is not used.

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
reserve. The lifter sets each load from a belief about their max that lags two weeks and is off by a normal 2%,
so no set is a copy of the true max. Each day's strength varies by 4.2%. Each earlier set costs 0.7 of a rep to failure. Logged RPE is
`10 - (0.75 x true RIR + noise)`, with noise SD `0.5 + 0.25 x true RIR`, rounded to halves, between 5 and 10.

**Scenarios,** 100 lifters each:

- strength 1 to 5 reps;
- hypertrophy 8 to 12;
- high reps 12 to 15;
- mixed 1 to 15;
- no RPE;
- half the sets with RPE, and a last set to failure;
- noisy RPE (double noise, 40% under-prediction);
- deloads every fourth week, warm-ups with no flag and no RPE (as a Strong CSV has them) and a 6-week break;
- deadlift, at a curve centre of 7 (LeSuer's direction);
- novice, gaining 1.5% a week;
- a 5% loss over two weeks, scored from 2 to 4 weeks after it, with and without RPE;
- a block switch: four weeks of triples, then four of tens, in turn;
- a lift trained once a week with no RPE and a deload every fourth week, with and without a 6-week break;
- a return from a 6-week break with no RPE, at twice and once a week, scored 2 to 4 weeks after the return;
- misspecified: a third curve shape (`f = R^-p`, Lombardi's family), 50% under-prediction and a day SD of 6%,
  none of which the estimator assumes.

The estimate is scored at every session from day 14, against the underlying true 1RM. Coverage is the mean of
each lifter's share, so a lifter counts once; ± is 1.96 standard errors across lifters. Constants were set on
tuning seeds and checked on held-out seeds.

| Scenario (held-out)         |  Bias | 90th pct error | In range | True above range | True below | Range width |
| --------------------------- | ----: | -------------: | -------: | ---------------: | ---------: | ----------: |
| strength 1 to 5             | -0.1% |           9.2% |  88 ± 6% |              12% |         1% |         14% |
| hypertrophy 8 to 12         | -0.2% |          18.2% |  87 ± 6% |              12% |         1% |         26% |
| high reps 12 to 15          | -1.1% |          20.8% |  87 ± 6% |              12% |         1% |         32% |
| mixed 1 to 15               | -0.4% |          13.9% |  86 ± 6% |              13% |         1% |         19% |
| no RPE                      | +0.5% |          13.7% |  87 ± 6% |              12% |         1% |         20% |
| half RPE, to failure        | +1.9% |          11.8% |  83 ± 6% |              10% |         7% |         20% |
| noisy RPE                   | -2.3% |          15.8% |  81 ± 7% |              19% |         0% |         18% |
| deload and break            | -0.3% |          12.5% |  84 ± 6% |              14% |         2% |         16% |
| deadlift                    | -2.8% |          14.8% |  84 ± 6% |              16% |         0% |         20% |
| novice                      | -2.3% |          15.6% |  84 ± 7% |              16% |         0% |         19% |
| 5% loss                     | +0.5% |          11.9% |  82 ± 7% |              12% |         6% |         15% |
| 5% loss, no RPE             | +3.7% |          12.9% |  78 ± 8% |              10% |        12% |         21% |
| once a week, no RPE         | +0.9% |          10.7% |  89 ± 6% |              10% |         1% |         18% |
| once a week, no RPE, break  | +1.1% |          10.3% |  89 ± 6% |              10% |         1% |         18% |
| block switch, 3s and 10s    | +0.8% |          10.5% |  89 ± 6% |              10% |         1% |         18% |
| return from a break, no RPE | +1.7% |          13.7% |  86 ± 6% |              11% |         2% |         21% |
| return, once a week, no RPE | +1.6% |          10.0% |  90 ± 6% |              10% |         1% |         19% |
| misspecified                | -4.9% |          10.4% |  83 ± 5% |              17% |         0% |         16% |

Pooled, 85% of held-out ranges hold the truth (85% on tuning seeds). In the first two weeks back from the
break, with no RPE, the estimate reads 6.8% low and holds 66%: the first sessions back are easy, and with no RPE
nothing in the log says so. At once a week those two weeks hold 84%. Bias is the median signed error. Width is
the range over the truth. Without the deadlift's extra 5%, the deadlift scenario holds 72%. Every figure here
comes from the prototype's raw tables, kept with the stage notes.

**Alternatives, same held-out lifters** (the rows other than the two top-window rows were run before the
once-a-week scenarios existed):

| Rule                                                                                  | Pooled in range | Weakest scenario                      | Bias          | Truth above | Width     |
| ------------------------------------------------------------------------------------- | --------------: | ------------------------------------- | ------------- | ----------- | --------- |
| This spec                                                                             |             85% | 5% loss, no RPE, 78%                  | -4.9 to +3.7% | 10 to 19%   | 14 to 32% |
| Same, top from 14 days only (no 3-session floor)                                      |             84% | 5% loss, no RPE, 78%; once a week 82% | -4.9 to +3.7% | 10 to 19%   | 14 to 32% |
| Same, top from 28 days                                                                |             84% | 5% loss, no RPE, 72%                  | -4.9 to +4.5% | 10 to 19%   | 14 to 32% |
| Same, symmetric range (z 1.28 both sides)                                             |             83% | misspecified 75%                      | -4.9 to +3.7% | 10 to 25%   | 12 to 31% |
| Research note: highest set point, range from the highest low and highest high, cap 15 |             94% | 5% loss 83%                           | +2.2 to +9.9% | 0 to 10%    | 24 to 43% |
| This spec, cap 10                                                                     |             81% | high reps 72%                         | -5.7 to +3.7% | 10 to 25%   | 14 to 22% |
| This spec, near-top weight on every session                                           |             84% | 5% loss 71%                           | -0.8 to +3.7% | 4 to 12%    | 16 to 33% |
| This spec, no under-prediction term (`R = reps + k`)                                  |             83% | novice 78%                            | -5.5 to +3.7% | 10 to 22%   | 12 to 32% |

- The research note's rule picks the luckiest set: it reads high everywhere and its range is wide.
- A cap of 10 applied after reading RPE lets through only the sets whose reserve was under-reported, so high
  reps read 5.1% low.
- The near-top weight on sessions with RPE kept the lucky ones and hid the low bias of RPE; it also held the
  old level after a loss.
- The under-prediction term moves little once the slope is smooth. It stays because Halperin gives its
  direction, and it lifts the weakest scenario.

**Sensitivity to where real lifters sit,** held-out, with every lifter at one fixed centre:

|                                 Centre (reps at 80%) | Pooled in range | Bias range    | Weakest scenario         |
| ---------------------------------------------------: | --------------: | ------------- | ------------------------ |
| 7.0 (fewer reps per load, like LeSuer's deadlifters) |             74% | -6.8 to -0.3% | noisy RPE, 65%           |
|                                                  8.5 |             89% | -4.8 to +3.7% | 5% loss with no RPE, 84% |
|        10.0 (more reps per load, like Nuzzo's means) |             91% | -3.7 to +6.7% | 5% loss with no RPE, 71% |

The 80% holds under the spec's own prior on where real lifters sit, normal(8.5, 1). The drawn-centre eval
checks the spec against that prior; only the fixed-centre table tests outside it. If real lifters do fewer reps
per load than the equations assume, the ranges are too narrow and the estimate reads low. Section 11 says what a
check of this would need.

## 8. Calibration evals

`packages/core/src/lift/e1rm.sim.test.ts` runs the generator above with fixed seeds, 100 lifters a scenario, on
held-out seeds with the drawn centre, and fails when:

- pooled coverage leaves 80% to 90%;
- any scenario's coverage falls under 75%;
- any scenario's truth-above share passes 20%, or the pooled one passes 15%;
- any scenario's median bias leaves -5% to +5%, except the misspecified one, held to -8% to +8% because it is
  built to break the spec's assumptions;
- either 5% loss scenario's coverage, 2 to 4 weeks after the loss, falls under 75%;
- either return scenario's coverage, 2 to 4 weeks after the return, falls under 75%;
- any estimate breaks `floor <= low <= point <= high`, or any figure is not finite.

It also prints the fixed-centre table, so a change that moves it shows in the log.

A fast unit test pins the worked example's point, each error term and its range, and that `R = 1`, `R = 15`, a
fractional RPE and a single session give finite figures.

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
| Slope `s`                   |                          mean of the equations' log-slopes | Second review                                          |
| Near the top (no RPE only)  |       0.96, 0.015, top from 14 days or the last 3 sessions | threshold.md                                           |
| Change between periods      |              z 2.24 on the unshared error; mean R within 3 | This prototype (section 10)                            |
| Range                       |                                80%: z 1.1 below, 1.5 above | Design value                                           |
| Deadlift top                |                                                        +5% | LeSuer direction; size from the deadlift scenario      |
| Allometric exponent         |                                                       0.67 | Jaric 2002                                             |
| Mass SD                     | 0.01 + 0.005 per 30 days, at most 0.04; none past 365 days | Design value                                           |
| Hard set                    |                                            RPE 7 or higher | Design value                                           |
| Unmarked warm-up            |                  under 70% of the session's top, before it | Design value                                           |

`LIFT_REVISION` starts at 1 and moves with any change here. The top window of section 2 (14 days, or the last 3 sessions within 28 days) is revision 2. It is not `MODEL_REVISION` ([strength.md](strength.md),
decision 3).

## 10. Change between periods

The Lift page names a change only when the data shows one. It shows the word ("up", "down", "no clear change"),
never the two periods' estimates, so the lift has one figure on screen: the headline estimate of section 2.

The estimate at the end of a period and the estimate at the end of the previous period of the same length are
each made from that period's own sessions, so no session counts twice. Each is null when its period has no
eligible session, and then no change is named.

Two estimates of one lift share most of their systematic error: the same curve, the same equations, the same
effort habit. So the comparison uses only what they do not share. Each systematic term of section 1 (curve,
centre, equations, effort) is averaged over a period's sessions with their weights `q`, and

`sd_change = sqrt(ind_now^2 + ind_before^2 + sum over the four terms of (term_now - term_before)^2)`

"Up" when `ln(point_now / point_before) > 2.24 sd_change`, "down" when below `-2.24 sd_change`, else "no clear
change". The points are the weighted means before the floor clamp. Two guards say "no clear change" instead:

- the two periods' weighted mean `R` differ by more than 3, since then the curve error is not shared and the
  term differences under-state it (a lifter moving from triples to tens);
- the named direction disagrees with the clamped figures the page shows.

On the synthetic lifters with the drawn centre, 40 lifters a programme, ten period ends each (raw tables
`v6/change-*.txt` with the stage notes):

| Programme                                            | Period  | True change |   Named up | Named down |
| ---------------------------------------------------- | ------- | ----------: | ---------: | ---------: |
| Steady, RPE logged                                   | 28 days |          0% |    2 to 3% |    1 to 3% |
| Steady, no RPE                                       | 28 days |          0% |         0% |         0% |
| Steady, triples then tens                            | 28 days |          0% |         0% |         0% |
| Steady, 5s then 8s, each period mixing blocks        | 28 days |          0% |         0% |    0 to 1% |
| Steady, triples then tens, each period mixing blocks | 28 days |          0% |    0 to 1% |    0 to 2% |
| Flat true max, loads rising 0.5% a week              | 28 days |          0% |    1 to 3% |         0% |
| Novice, 1.5% a week                                  | 28 days |       +6.1% |  32 to 57% |         0% |
| 5% loss across the edge                              | 28 days |       -3.7% |    0 to 3% |   0 to 11% |
| Steady, RPE logged                                   | 56 days |          0% |    1 to 3% |    1 to 3% |
| Novice, 1.5% a week                                  | 56 days |      +12.6% | 97 to 100% |         0% |
| Flat true max, loads rising 0.5% a week              | 56 days |          0% |    7 to 9% |    0 to 1% |
| 5% loss across the edge                              | 56 days |       -3.7% |         0% |  20 to 21% |

Alternatives on the same lifters at 28 days:

- ranges that do not overlap: novice named up 0%, since the full ranges carry the systematic error twice;
- z 1.96: steady lifters with RPE named changed 5 to 11% of periods; novice 42 to 73%;
- no rep guard: a steady lifter switching from triples to tens is named changed 12 to 13% of periods.

The target is a steady lifter named changed in 5% of periods or fewer, in total; z 2.24 gives 1 to 6% here, and
z 1.96 misses it. A month is short: a 1.3% gain or a 3.7% loss is seldom named in one. Over eight weeks the
novice's gain almost always is.

What the word means without RPE: a session with no RPE reads its effort from the reps alone, so for a lift logged
without RPE "up" means the loads rose at the same reps. That is what the log can show. A programme that adds
plates while the true max stays flat is named up in 1 to 3% of 28-day periods and 7 to 9% of 56-day ones.

The cost of the rep guard: a lifter whose rep range moves by more than 3 from one period to the next is told "no
clear change" for that pair of periods, whatever happened.

## 11. Open

- **Which curve centre real lifters sit at** (section 7). The check first planned here predicted each
  near-failure set's reps from the estimate before it. It cannot see the centre, because it maps reps to load and
  back through the same equations, so a lifter whose curve sits elsewhere cancels out (science review of #482). A
  pairwise comparison of nearby low-rep and high-rep sessions moves the right way with the centre. As prototyped it
  was scored against the population's centre, but each synthetic lifter draws their own curve with SD 2.51 reps
  around it, so many lifters "at the right centre" do sit far from the equations (raw tables `check-v2-results.txt`).
  A per-lifter check to try: within 14 days, pair a set the curve cannot bias (3 reps or fewer at RPE 9.5 or more)
  with the estimate from sessions of 6 reps or more only, take the trimmed mean of the log differences, and score it
  against each synthetic lifter's own error at high reps. It has low power (about 9 points of SE at 20 events), so
  it is research, not a gate (decision [lift-estimate-leads.md](decisions/lift-estimate-leads.md)).
- The sizes of the effort terms (`0.25 k` both ways): Halperin gives the direction and a pooled mean only.
