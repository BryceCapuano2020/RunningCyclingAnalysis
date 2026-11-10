# Lift age grade (spec)

Status: designed, prototyped on the public OpenPowerlifting data, waiting for the Opus science review and the
owner's read. Nothing is built. It follows the formula rule in
[PROCESS.md](../PROCESS.md#formula-and-model-changes). The estimate it grades is in [e1rm.md](e1rm.md), the
run and ride grades it sits beside are in [threshold.md](threshold.md) and [cross-sport.md](cross-sport.md),
and where lifting lives is [strength.md](strength.md). This note holds no owner data. Every lifter here is
synthetic, and every population figure is from the public data.

## 1. What it is

A back squat, a bench press and a deadlift each get an age grade: the e1RM as a share of the world-class lift
for the athlete's age, sex and body mass. The run grade is a share of the age standard (the WMA tables) and the
ride grade a share of the best riders' hour. The lift grade is a share of the best lifters' lift, so run, ride and
lift can stand on one three-corner hero, each corner at its own age grade. The three are never summed.

Four things are fixed by the owner's decision of 9 Nov 2026: three lifts, graded like the run grade, body
mass in the standard, one scale shared with run and ride. This note proposes the rest.

## 2. Source, licence, attribution

- **Source:** the OpenPowerlifting bulk CSV, `openpowerlifting-2026-11-07` (4,063,068 meet entries), from
  https://openpowerlifting.gitlab.io/opl-csv/. The data is public domain. Credit is requested, not required.
- **Attribution text** (for the Sources line on the Lift card and the docs, as the project's own sample reads):
  "Lift standards are fitted to results from the OpenPowerlifting project, https://www.openpowerlifting.org.
  You may download a copy of the data at https://data.openpowerlifting.org."
- **Not used:** Strength Level values or tables (its licence forbids use in another product). The 2026 BMC
  paper, doi:10.1186/s13102-026-02195-6, is CC BY-NC-ND: cited for context, no table taken from it.
- **Shipped:** the fitted coefficients in section 4 (42 numbers). No row of the data is in the repo, the
  app or a request. The standard is computed on the device from the coefficients.

## 3. The population and its filters

The population is people who entered a powerlifting meet. It is a selected group: the median competitor is
stronger than a typical gym lifter, so most app users will grade below the competitors' middle (section 6).

| Filter                    | Rule                                                                                             | Why                                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Equipment                 | `Raw` only. `Wraps` dropped.                                                                     | Wraps add to the squat: with them in, the standard rises 4% (men) and 7% (women) at the median, other lifts 0 to 1%. The app's sets are raw. |
| Events                    | Any event holding the lift (`SBD`, `SB`, `SD`, `BD`, `S`, `B`, `D`).                             | A lift's best does not depend on the other two.                                                                                              |
| Result                    | Best of three lifts above 0. `DQ`, `NS` and guest places dropped.                                | A failed lift is not a performance.                                                                                                          |
| Age                       | `Age` present, 10 or over. Standard fitted for 14 to 80.                                         | Class-only ages are not exact. Under 14 is 1% of rows, over 80 is under 0.1%.                                                                |
| Body mass                 | `BodyweightKg` present, 25 to 250. Standard fitted for 55 to 150 kg (men), 45 to 130 kg (women). | 97% of rows are inside. Beyond that the cells are thin and the curve bends (section 4).                                                      |
| One entry per lifter-year | Per lifter, per lift and per integer age, the best.                                              | A lifter who meets often would otherwise count for more. Peak of the year, as a record is.                                                   |
| Tested                    | Not filtered: tested and untested together. Tested-only is the sensitivity case.                 | See below.                                                                                                                                   |

**Tested against all.** The fit on drug-tested meets only (about 80% of the rows) gives a standard 1 to 5%
lower at the median (men: squat 1.4, bench 3.2, deadlift 2.0; women: 2.8, 5.0, 2.8), with corners down to
10 to 20% lower for heavy and old women. That is inside the standard's own error (section 7) for most athletes.
Proposed: all raw. The "world class" anchor is a rank in a field, and the app cannot see whether the athlete
is tested. The tested standard is the first change if the owner prefers it (open question 2).

Rows after the filters, one per lifter-year: squat 459,091 men and 213,673 women; bench 659,159 and 258,121;
deadlift 529,933 and 238,122.

## 4. The standard S

`S(lift, sex, age, mass)` is the world-class lift in kg for that athlete.

```
x      = ln(mass / ref)                       ref = 80 kg (men), 65 kg (women)
ln Sq  = a + b x + c x^2
       + ln(1 - exp(-(age - 10) / k))         juniors rise
       - d1 max(age - P, 0) - d2 max(age - P, 0)^2   masters decline, d1 and d2 >= 0
S      = exp(ln Sq) / 0.9
```

`Sq` is the fitted upper envelope: the 99.9th percentile of the competitors' lifts at that age and mass, found
by quantile regression (pinball loss at tau 0.999, Nelder-Mead from the sample's own start, on all rows). The
division by 0.9 puts that envelope at 90%, the run grade's "world class" line (section 6). Seven numbers per lift
and sex, 42 in all, are the whole model.

| Curve           | a      | b      | c       | k     | P     | d1      | d2      |
| --------------- | ------ | ------ | ------- | ----- | ----- | ------- | ------- |
| squat, men      | 5.7188 | 0.6360 | -0.0933 | 3.189 | 34.18 | 0.00474 | 0.00012 |
| squat, women    | 5.3271 | 0.6121 | -0.1838 | 3.100 | 33.00 | 0.00616 | 0       |
| bench, men      | 5.4299 | 0.4718 | 0.1524  | 4.174 | 40.52 | 0.00636 | 0.00014 |
| bench, women    | 4.9400 | 0.4435 | -0.2073 | 3.664 | 44.54 | 0.01030 | 0       |
| deadlift, men   | 5.8429 | 0.5004 | -0.2773 | 3.063 | 33.00 | 0.00510 | 0.00006 |
| deadlift, women | 5.4557 | 0.4995 | -0.4074 | 3.251 | 39.59 | 0.00550 | 0       |

The prototype and the JSON are in `.claude/stage-x/proto/liftgrade/` (git-ignored): `extract.py` (CSV to
rows), `model.py` and `fit_all.py` (the fit), `analyse.py`, `heldout.py`, `compare.py`, `rank.py`,
`synthetic.py`, and `coefficients.json`. Run them with the data path as an argument.

**Mass scaling.** The allometric exponent is not one number. `e1rm.md` uses 0.67 (Jaric) for relative
strength. The envelope's local exponent, `d ln S / d ln mass`, at the plateau age:

| Lift, sex     | 60 kg | 80 kg | 100 kg | 120 kg | 140 kg |
| ------------- | ----- | ----- | ------ | ------ | ------ |
| squat, men    | 0.69  | 0.64  | 0.59   | 0.56   | 0.53   |
| bench, men    | 0.38  | 0.47  | 0.54   | 0.60   | 0.64   |
| deadlift, men | 0.66  | 0.50  | 0.38   | 0.28   | 0.19   |

| Lift, sex       | 50 kg | 60 kg | 70 kg | 90 kg | 110 kg |
| --------------- | ----- | ----- | ----- | ----- | ------ |
| squat, women    | 0.71  | 0.64  | 0.58  | 0.49  | 0.42   |
| bench, women    | 0.55  | 0.48  | 0.41  | 0.31  | 0.23   |
| deadlift, women | 0.71  | 0.56  | 0.44  | 0.23  | 0.07   |

0.67 holds for the squat near 70 to 80 kg and not elsewhere. The upper bench and the deadlift flatten with
mass: heavy lifters are not proportionally stronger at the top. A single 0.67 would over-credit heavy
deadlifters and under-credit light benchers by 10% or more at the ends. The standard carries its own curve, so
the grade does not use `ALLOMETRIC_EXPONENT`, and the relative-strength figure on the Lift card keeps 0.67
unchanged. Two figures with two exponents is fine: one compares a lifter with their past, the other with the
field.

**Age.** The standard at 80 kg (men) and 65 kg (women), kg:

| Age             | 15  | 18  | 25  | 35  | 45  | 55  | 65  | 75  |
| --------------- | --- | --- | --- | --- | --- | --- | --- | --- |
| squat, men      | 268 | 311 | 335 | 337 | 317 | 291 | 261 | 228 |
| bench, men      | 177 | 216 | 247 | 253 | 246 | 224 | 199 | 172 |
| deadlift, men   | 308 | 355 | 380 | 379 | 357 | 332 | 305 | 276 |
| squat, women    | 183 | 211 | 227 | 226 | 212 | 200 | 188 | 177 |
| bench, women    | 116 | 138 | 153 | 155 | 155 | 139 | 126 | 113 |
| deadlift, women | 204 | 238 | 258 | 260 | 252 | 239 | 226 | 214 |

Juniors rise fast: the squat standard for men at 70 kg is 246 kg at 15, 276 at 17, 297 at 20. The plateau runs
from about the early 20s to the mid 30s (the late 40s for the women's bench). The decline from the plateau is
0.7 to 1% a year.

## 5. The grade

```
grade = e1RM / S(lift, sex, age, mass)
```

Point and range come from the e1RM's point, low and high (e1rm.md, section 2).

- **Which lift.** A table keyed by exercise slug: `back-squat` to squat, `bench-press` to bench, `deadlift`
  and `sumo-deadlift` to deadlift (OPL's deadlift is either stance). Equipment `barbell` only. A front squat,
  a box squat, a machine or a dumbbell press has no grade: its load is not the competition lift's.
- **Age.** `ageAt(birthYear, date of the estimate)`, as the run grade does. Only the birth year is known, so
  the age is a year or one less: evaluate the standard at `age - 0.5`.
- **Mass.** `bodyMassOn` at the estimate's date, as relative strength does, with its dated-mass rules.
- **Level.** `levelOf` and `gradePercent` as for run and ride, so the words are the same.

**Range.** The e1RM range is 80% and the run and ride ranges are 90% (5th to 95th). Widen the e1RM's log
distances by 1.645 / 1.2816 = 1.2835, as cross-sport.md does for the threshold. Add the standard's own error in
quadrature on the log scale:

```
sdS   = hypot(0.02, slopeMass * massSd, slopeAge * 0.289)
low   = grade * exp(-hypot(1.2835 * ln(point / low_e), 1.645 * sdS))
high  = grade * exp(+hypot(1.2835 * ln(high_e / point), 1.645 * sdS))
```

`0.02` is the bootstrap error of the fit (section 7). `slopeMass` is `d ln S / d ln mass` from the curve and
`massSd` is `massSdFor` from `relative.ts`. `slopeAge` is `d ln S / d age` per year and 0.289 is the standard
deviation of a birth-year-only age (a uniform year). For a 30-year-old man the age term is nil. For a 16-year-old
it is 5% a year, so a junior's range is wide, which is right.

**Worked example.** Man, 30, 80 kg, squat e1RM 140 kg (low 125, high 158). `S = 337.6` kg at age 29.5.
Grade 41.5%. Mass slope 0.64 with `massSd` 0.01, so `sdS = 0.021`. Low distance
`1.2835 x ln(140/125) = 0.145` and high `0.155`, with `1.645 sdS = 0.035`: range 35.7% to 48.6%. Shown as 41%.

## 6. Calibration against the run scale

The run grade's levels are WMA: about 60 local, 70 regional, 80 national, 90 world class, and 100 the age
standard, near the best of that age and sex. The ride grade is a share of the best riders' hour on the same scale.
The lift grade is built the same way: a share of the best.

**The anchor.** The repo holds no run field, so the prototype ties the scales at the top, where the level names
are about rank in the world: the 99.9th percentile of competitors for the athlete's age, sex and mass is 90%,
"world class". Records sit above it: the largest grades among all competitor-years are 1.04 to 1.24, and the
share at or above 100% is 0.004 to 0.013% (one entry in 8,000 to 25,000). The raw envelope without the 0.9
(a ratio to the 99.9th percentile) would put the world-class line at 100% and a record at 115 to 140%, which is
off the run scale.

**What the rest of the scale reads.** Rank among competitors at each grade (percent of lifter-years below it),
with this scale:

| Lift, sex       | 30%  | 40%  | 50%  | 60%  | 70%  | 80%  | 90%  |
| --------------- | ---- | ---- | ---- | ---- | ---- | ---- | ---- |
| squat, men      | 1.0  | 5.8  | 24.8 | 61.4 | 89.2 | 98.5 | 99.9 |
| bench, men      | 1.2  | 8.8  | 36.2 | 73.5 | 93.8 | 99.1 | 99.9 |
| deadlift, men   | 0.6  | 2.9  | 16.8 | 54.4 | 88.1 | 98.6 | 99.9 |
| squat, women    | 3.6  | 18.2 | 49.3 | 79.6 | 94.8 | 99.1 | 99.9 |
| bench, women    | 10.3 | 44.7 | 77.7 | 93.1 | 98.1 | 99.5 | 99.9 |
| deadlift, women | 1.0  | 9.5  | 37.7 | 74.0 | 93.8 | 99.1 | 99.9 |

The level names imply ranks too: national about the top 1 to 2% of a field, regional about the top 10%, local
about the top 40%. Reading the table at 80, 70 and 60: national is the top 0.5 to 1.5%, regional the top 5 to
12% (bench for women 2%), local the top 20 to 46% (bench for women 7%). So the shape agrees with the level
names for the squat and deadlift of both sexes and for men's bench. The median competitor grades 50 to 59%.
The implied ranks are a reading of the level names, not a measurement on runners. The Opus review should
check them against a run field (open question 1).

**Where it does not agree.** Women's bench grades low: its median competitor is 41%, against 50 to 59% for the
rest. Its top is far above its middle, so a 99.9th percentile anchor leaves the middle low. One constant per
lift and sex cannot fix both ends. Two constants (a scale and a power) would, at the cost of the grade no longer
being a plain share. Proposed: keep the plain share. A bench for women is read as it is: 60% on the women's
bench is a rarer lift than 60% on the squat. The table above is the honest statement, and the card can say it
(open question 4).

**Where the app's lifters sit.** A man of 80 kg who squats 140 kg grades 41%, at about the 7th percentile of men
competitors. A typical gym lifter reads low against a competitor's standard. The run grade's local line is 60%, so a lift corner will often sit inside the run corner.
That is true to the standard, and the owner should see it before the build (open question 3).

**Sensitivity of the anchor.** Anchoring 90% at the 99.5th percentile instead lowers S by 6 to 11%, and at the 99th by 9 to 16%, and grades
rise by the same fraction. Ratio of the envelope at 99% and 99.5% to 99.9%, median over ages and masses:
men 0.89 to 0.91 and 0.92 to 0.94, women 0.84 to 0.88 and 0.90 to 0.92.

## 7. Validation

**Held-out lifters.** Fit on 80% of lifters, scored on the other 20% (never seen). The share of rows at or
above the fitted 99.9th percentile envelope (the 1.0 line), per mille, should read 1.0:

| Lift, sex       | Seen | Unseen |
| --------------- | ---- | ------ |
| squat, men      | 1.01 | 0.90   |
| bench, men      | 1.00 | 1.28   |
| deadlift, men   | 1.00 | 1.33   |
| squat, women    | 1.00 | 0.82   |
| bench, women    | 1.01 | 0.58   |
| deadlift, women | 1.00 | 0.95   |

The unseen counts are 30 to 130 rows, so each figure carries 10 to 20% sampling noise. The same share at
80% and 90% of the envelope (hundreds of rows) agrees within 7% for men and within 30% for women (fewer
rows): for example squat, men, 7.5% and 1.2% seen against 7.7% and 1.2% unseen. By age band the standard
holds in the open ages and the middle masses. For masters it sits a little high for the men's squat (at 90% of
the envelope, per mille: 12.7 at 20 to 34, 8.8, 6.5 and 1.7 at 35 to 49, 50 to 64 and 65 to 80) and for the
women's squat and deadlift from 50, and a little low for the men's bench. The oldest bands and the heaviest
women's bench are thin and noisy.

**Held-out years.** Fit on meets to 2018, scored on 2019 on. Bench is stable (the share above the 1.0 line
falls, 0.6 against 1.0). The squat and the deadlift are not: 3.2 to 4.8 per mille against 1.0. The fit on early
years gave squat and deadlift standards 1 to 7% lower (women's squat 7%, deadlift 5%), and bench 1 to 6% higher.
Squat and deadlift competitors got stronger. The fit on 2019 on differs from the fit on all years by under 2%
at the median, so the all-years standard tracks the present. The standard is a snapshot of the data's date: refit once a year (section 10).

**Stability.** Four bootstrap refits, lifters resampled: the standard's log error is 0.9 to 2.0% at the median
over a grid of ages 16 to 65 and masses, up to 2 to 12% in the corners, where the cells are thin (over 65, and over 110 kg
for women). Section 5 uses 0.02.

**Sensitivity to the filters.** Against the base fit, median ratio of S: tested only 0.95 to 0.99 (section 3);
with wraps 1.00 to 1.07 (the squat only; other lifts within 1%); drop the one-per-year rule, not run (the best per year is the
record-like input). The grade moves by the same fraction.

**Synthetic lifters.** None is owner data.

| Lifter           | Lift     | e1RM kg | S kg | Grade |
| ---------------- | -------- | ------- | ---- | ----- |
| man, 30, 80 kg   | squat    | 140     | 338  | 41.5% |
| man, 30, 80 kg   | bench    | 100     | 251  | 39.8% |
| man, 30, 80 kg   | deadlift | 180     | 383  | 47.1% |
| woman, 30, 65 kg | squat    | 100     | 228  | 43.8% |
| woman, 30, 65 kg | bench    | 55      | 155  | 35.6% |
| woman, 30, 65 kg | deadlift | 120     | 260  | 46.2% |
| man, 55, 90 kg   | squat    | 150     | 313  | 47.9% |
| man, 55, 90 kg   | deadlift | 190     | 351  | 54.1% |
| girl, 16, 58 kg  | squat    | 90      | 182  | 49.4% |
| man, 28, 110 kg  | bench    | 140     | 295  | 47.4% |
| woman, 62, 70 kg | deadlift | 110     | 238  | 46.2% |
| man, 25, 80 kg   | squat    | 250     | 335  | 74.6% |

The model's calibration case in the build PR pins these.

## 8. Edge rules

| Case                                                                | Result                                                                                                            |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| No year of birth or no sex                                          | No grade, gap `no-profile`, the run grade's wording.                                                              |
| Sex other than the two in `AgeProfile`                              | No grade. The app has `female` and `male` only; the standard is fitted for those.                                 |
| No body mass, or older than 365 days                                | No grade (the standard needs mass). The e1RM and its floor stay. Same rule as relative strength.                  |
| A placeholder mass the athlete never entered                        | Not used, as in `relative.ts`.                                                                                    |
| Age under 14 or over 80                                             | No grade. Both ends are under 1.4% of competitors.                                                                |
| Mass under 55 or over 150 kg (men), under 45 or over 130 kg (women) | No grade. Holding S at the edge would grade a 160 kg lifter against a 150 kg standard.                            |
| Lift with no eligible set                                           | No estimate, so no grade. Nothing is shown for it on the hero.                                                    |
| Grade over 110%                                                     | Not graded: an input beyond all but fewer than one competitor in 50,000 (`gradeCeiling` for lifts, as for rides). |
| Estimate is a floor only                                            | The floor is not a grade: graded points need an estimate.                                                         |

## 9. The hero: which grade is "lift"

When two or three of the lifts are graded, the corner needs one number. Same lifter, same age year, all three
lifts, 443,326 men and 206,330 women:

- The three lifts agree: correlations 0.63 to 0.83. The lifter's own spread is a standard deviation of 5.6
  points (men) and 7.2 (women).
- The best of three runs 5.1 points (men) and 6.4 (women) above the mean on average.
- Rank, not grade, is the comparison with run. Median, 90th and 99th percentile of the corner, men:
  squat 57, 71, 82; bench 52, 65, 76; deadlift 59, 71, 81; mean of three 56, 68, 77; best of three 61, 73, 84.

| Rule                     | For                                                                      | Against                                                                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Mean of the graded lifts | Uses all the evidence; steady as a lift is added or missed; no flattery. | A lift left out changes it. It compresses toward the middle: 99th percentile 77 against 81 to 82 for the squat and deadlift, so a lifter strong in one lift reads under that lift's grade. |
| Best graded lift         | Simple; matches how a lifter speaks of a lift.                           | Flatters by 5 to 6 points and more as lifts are added. Jumps when a lift is first logged.                                                                                                  |
| One chosen lift          | The most stable.                                                         | The athlete must choose; two lifts are ignored.                                                                                                                                            |

Proposed: the mean of the graded lifts, the corner labelled with the lifts it holds ("squat, bench"), and the
range the mean of the lows and the mean of the highs (the lifts' errors are not independent). A corner with one
lift is that lift's grade. Each lift keeps its own grade and range on the Lift card. Owner decides (open
question 5).

## 10. Limits

- **Competition against gym.** The data is meet-day lifts to a judge's standard: depth, a pause, a lockout. The
  e1RM is a typical-day max from gym sets. A meet adds peaking and adrenaline (up) and a judge (down). The sign
  and size are not measured here.
- **A selected group.** Competitors are not the population. The grade says where a lift sits against the best
  of those who compete, not against everyone.
- **A snapshot.** The squat and deadlift level rose between the data's early and late years (above). The standard
  is as old as its data.
- **One lift, one curve.** The same envelope covers a conventional and a sumo pull, a low-bar and a high-bar
  squat, as the data does.
- **Thin corners.** Over 65 and over 110 kg for women the standard is a wide estimate. Section 5 widens the
  range there only through the age and mass slopes and the single 0.02.
- **Sex as two options.** The standard is sex-specific as the run tables are. It makes no claim beyond that.

## 11. Open questions for the owner

1. **The run anchor.** Is 90% at the 99.9th percentile of competitors the right tie to the run scale? It is
   the only point tied. The rest follows the lifters' own spread. A run field to check the national, regional
   and local ranks against would settle it.
2. **Tested or all.** All raw is proposed. Tested-only lowers S 1 to 5% and is a one-line change to the fit.
3. **A low reading.** An ordinary gym lifter grades 40 to 50%. The hero will often show lift as the lowest
   corner. Accept that, or add a second reading against the general public (not available in open data).
4. **Women's bench.** It reads about 10 points under the other lifts at the same rank. Keep the plain share, or
   add a per-lift scale.
5. **The hero rule.** Mean, best or chosen (section 9).
6. **The range.** 90% to match run and ride (proposed), or the e1RM's own 80%.
7. **A ceiling.** 110% proposed, below which a grade is shown.

## 12. Wording the older notes need (not edited here)

**strength.md, decision 8.** Replace with:

> 8. **Run, ride and lift share the hero. Each is a corner at its own age grade.** Why: run and ride share a
>    unit, the age grade, and the lift grade is the same measure: the e1RM as a share of the world-class lift
>    for the athlete's age, sex and body mass, fitted on public powerlifting results
>    ([lift-grade.md](lift-grade.md)). The three are never summed. The Lift card keeps e1RM with its range,
>    the floor against the estimate, relative strength at the dated body mass, and weekly load per system.

Decision 7 (hours and load never summed) and decision 9 (a lift and run pair needs a measured effect) stand.
Decision 8's old reason, that an e1RM and a grade share no unit, is replaced by this note: the grade is the unit.

**VISION.md, commitment 5.** Replace with:

> 5. **One model per sport, no universal score.** Each discipline is reported in its own natural units:
>    critical power, critical speed, critical swim speed, estimated one-rep max. Each is tracked against the
>    athlete's own history. Where a sport has a published standard for age, sex and mass (run, ride, lift) it also
>    gets an age grade, and the grades are placed side by side, never summed into one number. Other
>    cross-sport comparisons appear only where physics makes them meaningful, as the existing running-versus-
>    cycling energy-rate comparison does.

Also: `e1rm.md` relative strength is unchanged; the model ledger gets a row in the build PR ("Lift grade (new):
the e1RM as a share of the fitted world-class lift for age, sex and mass") with the synthetic lifters of
section 7 as its before and after.

## 13. Build notes (for the slice)

- `packages/core/src/grade/liftStandard.ts`: the 42 coefficients in a table keyed by lift and `Sex`, `liftStandardKg`
  and `liftGrade`. The lift for a slug from a table keyed by slug. No literal sport comparisons.
- The range reads `slopeMass` and `slopeAge` by a centred difference of `liftStandardKg`.
- A calibration test pins the synthetic lifters of section 7 and the edge rules of section 8.
- `MODEL_REVISION` moves only when a digest field changes; the grade lives in standing, not the digest.
