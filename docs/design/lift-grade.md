# Lift age grade (spec)

Status: designed and prototyped on the public OpenPowerlifting data. The Opus science review returned "ready with
fixes"; this revision takes them. Nothing is built. It follows the formula rule in
[PROCESS.md](../PROCESS.md#formula-and-model-changes). The estimate it grades is in [e1rm.md](e1rm.md), the run and
ride grades it sits beside are in [threshold.md](threshold.md) and [cross-sport.md](cross-sport.md), and where lifting
lives is [strength.md](strength.md). This note holds no owner data. Every lifter here is synthetic, and every
population figure is from the public data.

## 1. What it is

A back squat, a bench press and a deadlift each get an age grade: the e1RM as a share of the world-class lift for the
athlete's age, sex and body mass. The run grade is a share of the age standard (the WMA tables) and the ride grade a
share of the best riders' hour. The lift grade is a share of the best lifters' lift, so run, ride and lift can stand
on one three-corner hero, each corner at its own age grade. The three are never summed.

The owner fixed four things on 9 Nov 2026: three lifts, graded like the run grade, body mass in the standard, one
scale shared with run and ride. This note proposes the rest. One rule follows from section 6: until the middle of
the scale is tied to a race field, lift is drawn on the hero but stays out of the lean and gap sentences.

## 2. Source, licence, attribution

- **Source:** the OpenPowerlifting bulk CSV, `openpowerlifting-2026-11-07` (4,063,068 meet entries), from
  https://openpowerlifting.gitlab.io/opl-csv/. The data is public domain. Credit is requested, not required.
- **Attribution text** (the Sources line on the Lift card and the docs, as the project's sample reads): "Lift standards
  are fitted to results from the OpenPowerlifting project, https://www.openpowerlifting.org. You may download a copy
  of the data at https://data.openpowerlifting.org."
- **Not used:** Strength Level values or tables (its licence forbids use in another product). The 2026 BMC paper,
  doi:10.1186/s13102-026-02195-6, is CC BY-NC-ND: cited for context, no table taken from it.
- **Shipped:** the 42 fitted coefficients and a few constants (section 4). No row of the data is in the repo, the app
  or a request. The standard is computed on the device.

## 3. The population and its filters

The population is people who entered a powerlifting meet. It is a selected group: the median competitor is stronger
than a typical gym lifter, so most app users grade below the competitors' middle (section 6).

| Filter                    | Rule                                                                                    | Why                                                                                                               |
| ------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Equipment                 | `Raw` only. `Wraps` dropped.                                                            | Wraps add to the squat (+4% men, +7% women at the median, on the earlier all-events fit). The app's sets are raw. |
| Tested                    | `Tested = Yes`.                                                                         | The app's athletes are not on drugs the field may be. See below.                                                  |
| Events                    | Full power (`SBD`) entries only.                                                        | Bench-only meets select bench specialists. See below.                                                             |
| Result                    | Best of three lifts above 0. `DQ`, `NS` and guest places dropped.                       | A failed lift is not a performance.                                                                               |
| Age                       | `Age` present, 10 or over. Standard fitted for 14 to 80.                                | Class-only ages are not exact. Under 14 is 1% of rows, over 80 under 0.1%.                                        |
| Body mass                 | `BodyweightKg` 25 to 250. Standard fitted for 55 to 150 kg (men), 45 to 130 kg (women). | 97% of rows are inside. Beyond that the cells are thin.                                                           |
| One entry per lifter-year | Per lifter, lift and integer age, the best.                                             | A lifter who meets often would otherwise count for more. Peak of the year, as a record is.                        |
| Meet years                | 2022 on (about 450,000 entries).                                                        | The standard has moved. See below.                                                                                |

Rows after the filters, one per lifter-year: squat 204,157 men and 102,837 women; bench 204,149 and 102,836;
deadlift 204,160 and 102,835.

**Tested and event, as effects on S** (median over ages and masses, against the base fit on all years of tested full
power, which sits within 2% of the 2022 base):

- Adding the untested full-power entries raises S 1 to 2% for men and 2 to 4% for women, up to 13% in the
  corners. Tested is the standard: it is the fairer one for a natural lifter, and the entries it keeps are ample.
  The untested standard is one flag away.
- Letting in bench-only and other partial-event entries raises the bench standard 7% (men) and 5% (women), up to 19%
  in the corners. The squat and deadlift do not move. Bench specialists are not a sample of lifters.

**Meet years.** A fit on meets to 2018 puts squat and deadlift standards 3% under the 2019-on fit for men and 6 to 8%
under for women (bench 0 to 4%). Fits from 2016, 2019 and 2022 agree within 1.6%, so the trend is settled before 2019. It continues in small steps: the 2025-on fit sits 1 to 4% above a fit on 2022 to 2024 (squat men 3.6%). Scored
on 2025 on, the 2022-to-2024 fit has 1.6 to 2.5 per mille of entries above its 99.9th percentile line, against 1.0.
2022 on is the standard: the latest four years, 450,000 entries, 1 to 2% a year behind the newest. A refit each year
tracks it (section 10).

## 4. The standard S

`S(lift, sex, age, mass)` is the world-class lift in kg for that athlete.

```
x      = ln(mass / ref)                        ref = 80 kg (men), 65 kg (women)
x      = min(x, -b / (2c))   when c < 0        flat, never falling, past the peak
ln Sq  = a + b x + c x^2
       + ln(1 - exp(-(age - 10) / k))          juniors rise
       - d1 max(age - P, 0) - d2 max(age - P, 0)^2     masters decline, d1 and d2 >= 0
S      = exp(ln Sq) / 0.9
```

`Sq` is the fitted upper envelope: the 99.9th percentile of competitors' lifts at that age and mass, by quantile
regression (pinball loss, Nelder-Mead). The age shape (`k`, `P`, `d1`, `d2`) is fitted at the 99th percentile, where
the cells are thick, and held when `a`, `b` and `c` are fitted at the 99.9th. This keeps the masters' curve out of
the thin tail: fitted at the 99.9th alone (on the first all-raw fit), the men's squat standard sat high after 50 (12.7 per mille above the 0.9
line at 20 to 34, 6.5 at 50 to 64, 1.7 at 65 to 80 on unseen lifters); now the bands agree for men. The division by
0.9 puts the envelope at 90%, the run grade's world-class line (section 6). Seven numbers per lift and sex are the
model. The clamp on `x` is a guard: no curve peaks inside the fitted masses (the men's deadlift peaks at 155 kg).

| Curve           | a      | b      | c       | k     | P     | d1      | d2      |
| --------------- | ------ | ------ | ------- | ----- | ----- | ------- | ------- |
| squat, men      | 5.7231 | 0.6114 | -0.2038 | 3.010 | 34.60 | 0.00626 | 0.00010 |
| squat, women    | 5.3264 | 0.5747 | -0.1185 | 2.940 | 30.56 | 0.00681 | 0.00007 |
| bench, men      | 5.3366 | 0.5927 | -0.2856 | 3.355 | 36.00 | 0.00483 | 0.00014 |
| bench, women    | 4.8797 | 0.5140 | -0.3195 | 3.545 | 26.35 | 0.00420 | 0.00011 |
| deadlift, men   | 5.8590 | 0.4248 | -0.3196 | 3.121 | 30.30 | 0.00485 | 0.00008 |
| deadlift, women | 5.4586 | 0.4377 | -0.2599 | 3.193 | 34.24 | 0.00751 | 0       |

The id is `LIFT_GRADE_STANDARD = 1`. A refit changes the id and gets a model-ledger row (the before and after of the
synthetic lifters of section 7). The prototype and `coefficients.json` are in `.claude/stage-x/proto/liftgrade/`
(git-ignored): `extract.py`, `model.py`, `fit2.py`, `sdS.py`, `analyse.py`, `heldout.py`, `compare.py`, `rank.py`,
`synthetic.py`. Run them with the data path as an argument.

**Mass scaling.** The envelope's local exponent, `d ln S / d ln mass`, at the plateau age:

| Lift, sex     | 60 kg | 70 kg | 80 kg | 100 kg | 120 kg | 140 kg |
| ------------- | ----- | ----- | ----- | ------ | ------ | ------ |
| squat, men    | 0.73  | 0.67  | 0.61  | 0.52   | 0.45   | 0.38   |
| bench, men    | 0.76  | 0.67  | 0.59  | 0.47   | 0.36   | 0.27   |
| deadlift, men | 0.61  | 0.51  | 0.42  | 0.28   | 0.17   | 0.07   |

| Lift, sex       | 50 kg | 60 kg | 70 kg | 90 kg | 110 kg |
| --------------- | ----- | ----- | ----- | ----- | ------ |
| squat, women    | 0.64  | 0.59  | 0.56  | 0.50  | 0.45   |
| bench, women    | 0.68  | 0.57  | 0.47  | 0.31  | 0.18   |
| deadlift, women | 0.57  | 0.48  | 0.40  | 0.27  | 0.16   |

`e1rm.md` uses 0.67 (Jaric) for relative strength. The standard's exponent falls with mass for every lift: heavy
lifters are not proportionally stronger at the top, and the deadlift flattens most. One 0.67 would over-credit heavy
lifters by 10% or more at the ends. The standard carries its own curve, so the grade does not use
`ALLOMETRIC_EXPONENT`, and the relative-strength figure on the Lift card keeps 0.67 unchanged: one compares a lifter
with their past, the other with the field.

**Age.** The standard at 80 kg (men) and 65 kg (women), kg:

| Age             | 15  | 18  | 25  | 35  | 45  | 55  | 65  | 75  |
| --------------- | --- | --- | --- | --- | --- | --- | --- | --- |
| squat, men      | 275 | 316 | 338 | 339 | 315 | 287 | 257 | 225 |
| bench, men      | 179 | 210 | 228 | 231 | 219 | 200 | 179 | 155 |
| deadlift, men   | 311 | 359 | 386 | 380 | 356 | 329 | 299 | 267 |
| squat, women    | 187 | 214 | 227 | 221 | 204 | 185 | 166 | 147 |
| bench, women    | 111 | 131 | 144 | 140 | 130 | 119 | 106 | 92  |
| deadlift, women | 206 | 240 | 258 | 259 | 241 | 223 | 207 | 192 |

Juniors rise fast. The plateau runs from the early 20s to the mid 30s, and the decline from it is about 0.7 to 1% a
year. Women's squat from 65 to 80 is the thinnest cell; its decline there rests on the 99th percentile shape.

## 5. The grade

```
grade = e1RM / S(lift, sex, age, mass)
```

- **Which lift.** A table keyed by exercise slug: `back-squat` to squat, `bench-press` to bench, `deadlift` and
  `sumo-deadlift` to deadlift (the data's deadlift is either stance). Equipment `barbell` only. A front squat, a box
  squat, a machine or a dumbbell press has no grade.
- **Age.** The estimate's date is known, the birth year is all there is. A birthday uniform in the year puts the age
  at `ageAt - 0.5 + f`, `f = (dayOfYear - 0.5) / 365`, with a spread of 0.289 years (a uniform year). The flat
  `- 0.5` of the first draft is right only at mid-year.
- **Mass.** `bodyMassOn` at the estimate's date, as relative strength does, with its dated-mass rules.
- **Level.** `levelOf` and `gradePercent` as for run and ride.
- **Display.** `min(grade, 100%)`, shown as "top of scale" at the cap, as a ride is. A grade over 110% is not graded.
  Entries at or above 100% are 0 to 0.02% of competitors and the 99.99th percentile is 0.96 to 1.04 (bench for women
  the top), so 100% is about one lifter-year in 10,000.

**The standard's own error.** From 30 bootstrap refits per curve (lifters resampled, 180 refits), the spread of `ln S`
over a grid of ages and masses, fitted as

```
sdS^2 = s0^2 + (sa u)^2 + (sm x)^2      u = (age - 30) / 30 above 30, (30 - age) / 10 below;  x = ln(mass / ref)
men    s0 0.015   sa 0.0106   sm 0.0298
women  s0 0.015   sa 0.0181   sm 0.0366
```

The bootstrap alone gives `s0` 0 to 0.005. 0.015 adds the year-on-year drift of section 3. The fit tracks the bootstrap
spread within a third (median). The bootstrap spread tops out at 4.4% (men) and 5.1% (women) in the corners, where the
formula before the floor reads 2.6 and 3.9%. Typical `sdS`: 0.015 at 30 and 80 kg; 0.021 at 16; 0.022 at 140 kg (men).

**Range.** The 90% range of the grade. The e1RM range of e1rm.md is not a percentile pair: it is
`point exp(-1.1 sd)` to `point exp(1.5 sd)` with a floor clamp and 5% more on top for the deadlift. So the grade
range is cut from the estimate's `sd` (the estimate exposes it, and the deadlift flag), not from its `low` and `high`:

```
sdT   = hypot(sdS, slopeMass * massSd, slopeAge * 0.289)
sd'   = hypot(sd, sdT)
low   = max(point * exp(-1.0 * sd'), floor * exp(-1.645 * sdT)) / S
high  = point * exp(+2.5 * sd') / S             (times 1.05 for the deadlift family)
```

`slopeMass` is `d ln S / d ln mass`, `massSd` is `massSdFor`, `slopeAge` is `d ln S / d age` per year, both by a
centred difference. For a 16-year-old man the age term is 1.5%, nil at 30: a junior's range is not widened much, and
most of the width is the estimate's.

_Retuning `zLo` and `zHi`._ On the e1RM simulation (`e1rm.sim.test.ts` harness: 18 scenarios, 100 synthetic lifters
each, 98,400 scored points, the truth of the day against the estimate) with the standard's error added at 2.5%
independently: the 5th and 95th percentile of the standardised error are -0.98 and +2.51. At `zLo` 1.0 and `zHi` 2.5
the pooled truth falls below the range 4.6% of the time and above 5.1%. By scenario below runs 1.1 to 16.5% (no-RPE drop
16.5, half-RPE AMRAP 13.1; the typical lifter 2 to 7%) and above 1.0 to 10.1% (the deadlift scenario 10.1, noisy RPE
8.7). Pooled it cannot be held tighter than that; a drop in strength is the miss on the low side. With no standard
error the values are 0.86 and 2.64. The current 1.1 and 1.5 read as a 90% range would miss 1.2% below and 14.3% above.
The long high side is the estimator's: the truth sits above its point more often than below. The deadlift scenario
here has no 5% top; that factor is not tested. The floor term never lets the low fall under what was lifted.

**Worked example.** A man, 30, 80 kg, one session of 100 kg for 5 at RPE 8 (the e1rm.md example: point 122.3 kg,
`sd` 0.0824, floor 100 kg), in mid-January. `S = 339.3` kg at age 29.5, so the grade is 36.0%. `sdS` 0.015,
mass slope 0.61 with `massSd` 0.01, age term nil: `sdT = 0.016`, `sd' = 0.084`. Low `36.0 x exp(-0.084) = 33.1%`;
the floor term gives 28.7%, lower, so 33.1%. High `36.0 x exp(0.210) = 44.5%`. Shown as 36% (33 to 44).

## 6. Calibration against the run scale

The run grade's levels are WMA: about 60 local, 70 regional, 80 national, 90 world class; 100 is the age standard,
near the best of that age and sex. The ride grade is a share of the best riders' hour. The lift grade is a share of
the best lifters' lift.

**Equal share is not equal rarity.** Strength differs more between people than hour speed does. A recreational runner
grades about 45 to 55% on WMA, not 60 (a reading, not measured here: the repo holds no run field), and an ordinary
gym lifter grades 40 to 50% on this scale. That is mostly true to the standards: a typical lifter is far from
competition strength.

**The anchor.** The scales are tied at the top, where the level names are about rank in the world: the 99.9th
percentile of competitors for the athlete's age, sex and mass is 90%, "world class". The 99.99th percentile is 0.96
to 1.04, record-like, so 100% is about one lifter-year in 10,000. Without the 0.9 the world-class line would sit at
100% and a record at 115 to 140%.

**What the rest of the scale reads.** Rank among competitors at each grade (percent of lifter-years below it):

| Lift, sex       | 30% | 40%  | 50%  | 60%  | 70%  | 80%  | 90%  |
| --------------- | --- | ---- | ---- | ---- | ---- | ---- | ---- |
| squat, men      | 0.9 | 4.4  | 20.0 | 55.0 | 86.3 | 98.1 | 99.9 |
| bench, men      | 0.6 | 5.4  | 26.7 | 64.9 | 90.8 | 98.7 | 99.9 |
| deadlift, men   | 0.5 | 2.2  | 13.6 | 49.6 | 86.0 | 98.3 | 99.9 |
| squat, women    | 2.5 | 12.9 | 39.7 | 72.8 | 92.6 | 98.8 | 99.9 |
| bench, women    | 4.2 | 27.0 | 62.6 | 86.8 | 96.7 | 99.3 | 99.9 |
| deadlift, women | 0.6 | 5.8  | 28.7 | 66.7 | 91.7 | 98.8 | 99.9 |

The median competitor grades 56 to 60% (men) and 46 to 56% (women). The level names read as ranks: national is the top
0.7 to 1.9% (80% and over), regional the top 3 to 14% (70%), local the top 13 to 50% (60%). Women's bench is the
outlier: its median is 46% and its top is far above its middle, so a 99.9th percentile anchor leaves the middle low.
One constant per lift and sex cannot fix both ends. The plain share is kept: a bench of 60% for women is a rarer lift
than a squat of 60%. The card can say it.

**The middle is not tied.** Only the top is. So lift is drawn on the hero, and stays out of the lean and gap sentences:
the headline and the line under it use run and ride only. The tie of the middle is an open research item:

1. Take a public race field with age-graded results (a mass-participation road race or a weekly timed run with open
   results), keeping a comparable tier of serious entrants (a finisher in a timed field is not an entrant to a
   powerlifting meet).
2. For percentiles 10, 25, 50, 75, 90, 99, 99.9 read the run grade `r(p)` and the lift grade `l(p)` per lift and sex.
3. If they differ by more than a few points, set a monotone map from the lift grade to the run grade by percentile,
   keeping 90% at the 99.9th, and give it a ledger row. The lead and gap sentences open to lift once that holds.

**Sensitivity of the anchor** (on the earlier all-raw fit). Anchoring 90% at the 99.5th percentile instead lowers S 6
to 11%, at the 99th 9 to 16%; grades rise by the same fraction. The envelope at 99% and 99.5% over the 99.9th, men
0.89 to 0.91 and 0.92 to 0.94, women 0.84 to 0.88 and 0.90 to 0.92.

## 7. Validation

**Held-out lifters.** Fit on 80% of lifters, scored on the other 20%. Share of rows at or above the fitted 99.9th
percentile line, per mille, should read 1.0:

| Lift, sex       | Seen | Unseen |
| --------------- | ---- | ------ |
| squat, men      | 0.99 | 1.48   |
| bench, men      | 1.00 | 0.45   |
| deadlift, men   | 1.01 | 1.08   |
| squat, women    | 1.01 | 0.75   |
| bench, women    | 1.00 | 0.75   |
| deadlift, women | 1.00 | 0.85   |

The unseen counts are 20 to 40 rows, so the figures carry 15 to 30% noise. At 80% of the line (thousands of rows) seen
and unseen agree within 8%, and at 90% within 20%. By band on unseen lifters, men are uniform across ages and masses
(squat, 90% line, per mille: 16.9, 16.8, 14.1, 15.3, 15.4 from 14 to 80). Women's bench and deadlift read thin at 50
to 64 (1.6 and 2.4 against 5 and 10): the women's standard sits high there. Men's bench above 120 kg reads thin (3.0
against 9).

**Held-out years.** Fit on 2022 to 2024, scored on 2025 on: 1.6 to 2.5 per mille against 1.0 (section 3). The standard
is a snapshot that ages 1 to 2% a year.

**Stability.** The bootstrap of section 5: the standard's log error 1 to 2% at the median, to 4 to 5% in the corners.

**Sensitivity to the filters.** Section 3 gives untested, bench-only and years. The anchor's are in section 6.

**Synthetic lifters.** None is owner data.

| Lifter           | Lift     | e1RM kg | S kg | Grade |
| ---------------- | -------- | ------- | ---- | ----- |
| man, 30, 80 kg   | squat    | 140     | 339  | 41.3% |
| man, 30, 80 kg   | bench    | 100     | 230  | 43.4% |
| man, 30, 80 kg   | deadlift | 180     | 389  | 46.3% |
| woman, 30, 65 kg | squat    | 100     | 228  | 43.8% |
| woman, 30, 65 kg | bench    | 55      | 143  | 38.4% |
| woman, 30, 65 kg | deadlift | 120     | 260  | 46.1% |
| man, 55, 90 kg   | squat    | 150     | 307  | 48.8% |
| man, 55, 90 kg   | deadlift | 190     | 344  | 55.2% |
| girl, 16, 58 kg  | squat    | 90      | 186  | 48.4% |
| man, 28, 110 kg  | bench    | 140     | 270  | 51.9% |
| woman, 62, 70 kg | deadlift | 110     | 218  | 50.4% |
| man, 25, 80 kg   | squat    | 250     | 338  | 74.1% |

(These use the age as given, not the `ageAt - 0.5 + f` shift.) The build PR's calibration case pins them.

## 8. Edge rules

| Case                                                                | Result                                                                                       |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| No year of birth or no sex                                          | No grade, gap `no-profile`, the run grade's wording.                                         |
| Sex other than the two in `AgeProfile`                              | No grade.                                                                                    |
| No body mass, or older than 365 days                                | No grade. The e1RM and its floor stay. Same rule as relative strength.                       |
| A placeholder mass the athlete never entered                        | Not used, as in `relative.ts`.                                                               |
| Age under 14 or over 80                                             | No grade. Both ends are under 1.1% of competitors.                                           |
| Mass under 55 or over 150 kg (men), under 45 or over 130 kg (women) | No grade. Holding S at the edge would grade a 160 kg lifter against a 150 kg standard.       |
| Lift with no eligible set                                           | No estimate, so no grade.                                                                    |
| Grade 100% to 110%                                                  | Shown as "top of scale" at 100%. Over 110% not graded (fewer than one competitor in 50,000). |
| Estimate is a floor only                                            | The floor is not a grade.                                                                    |

## 9. The hero: which grade is "lift"

When two or three lifts are graded the corner needs one number. Same lifter, same age year, all three lifts: 198,887
men and 99,911 women. The lifts agree (correlations 0.65 to 0.84); the lifter's own spread is 4.9 points (men) and 6.1
(women); the best of three runs 4.6 and 5.5 points above the mean.

Proposed: the **share of the total**, `sum(e1RM) / sum(S)` over the graded lifts. A lift with a larger standard
counts more (the deadlift about 1.15 of the squat, the bench 0.68). Rank of the corner, median, 90th and 99th
percentile, men: squat 59, 72, 83; bench 56, 70, 81; deadlift 60, 72, 82; **total 59, 70, 80**; mean of the three 58,
70, 79; best of three 63, 75, 85. Women: total 53, 66, 78; squat 53, 68, 81; bench 46, 62, 78; deadlift 56, 69, 81. The
total tracks a single lift's rank, as the run corner does; the best flatters by 5 to 6 points and by the number of
lifts logged.

The corner is labelled with its lifts ("squat, bench"). The range is `sum(low) / sum(S)` to `sum(high) / sum(S)`,
the lows and highs of section 5, so it assumes the lifts' errors move together: the widest the range can be. The
errors are in part shared (one lifter's habit with RPE, the standard's age and mass) and in part not, so the true
range is a little narrower. A corner with one lift is that lift's grade. Each lift keeps its own grade on the Lift
card. Owner decides (open question 5).

## 10. Limits

- **Gym against judged meet lifts.** The data is meet-day lifts to a judge: depth, a pause, a lockout. The e1RM is a
  typical-day max from gym sets. Expect the bench and deadlift e1RM to read about 3 to 8% under a meet max (a rested,
  peaked day), and the squat either way (depth lowers a meet squat, peaking raises it). Not measured, no correction.
  The card says "against judged meet lifts".
- **A selected group.** Competitors are not the population. The grade says where a lift sits against those who
  compete, and older athletes' corners read low among competitors too (the masters' fields are small and hold few
  strong lifters, so the standard is thin there).
- **The tie to run.** Only the top is tied (section 6), and it carries no anchor error yet: the lift-to-run tie has a
  range of its own once the race field exists.
- **A snapshot.** The standard is as old as its data and ages 1 to 2% a year. Refit once a year; each refit changes
  `LIFT_GRADE_STANDARD` and gets a ledger row.
- **One lift, one curve.** The same envelope covers a conventional and a sumo pull, a low-bar and a high-bar squat.
- **Thin corners.** Women over 65 and the heaviest lifters of both sexes; women's 50 to 64 bench and deadlift read a
  little high (section 7).

## 11. Open questions for the owner

1. **The middle.** The top is tied (99.9th percentile is 90%); the middle waits on a race field (section 6). Until
   then lift stays out of the lean and gap sentences. Agree?
2. **Tested.** Tested full power is the standard. The untested standard is 1 to 4% higher in S.
3. **A low reading.** An ordinary gym lifter grades 40 to 50%, so the hero will often show lift as the lowest corner.
4. **Women's bench.** It reads about 10 points under the other lifts at the same rank. Keep the plain share, or add a
   per-lift scale.
5. **The hero rule.** Share of the total (proposed), mean, best or chosen.
6. **The range.** 90% to match run and ride, from the retuned e1RM error (section 5).
7. **The ceiling.** Show at most 100%; drop above 110%.

## 12. Wording the older notes need (not edited here)

**strength.md, decision 8.** Replace with:

> 8. **Run, ride and lift share the hero. Each is a corner at its own age grade.** Why: run and ride share a unit,
>    the age grade, and the lift grade is the same measure: the e1RM as a share of the world-class lift for the
>    athlete's age, sex and body mass, fitted on public powerlifting results ([lift-grade.md](lift-grade.md)). The
>    three are never summed. Lift stays out of the lean and gap sentences until its scale is tied to run in the
>    middle. The Lift card keeps e1RM with its range, the floor against the estimate, relative strength at the dated
>    body mass, and weekly load per system.

Decision 7 (hours and load never summed) and decision 9 (a lift and run pair needs a measured effect) stand.

**VISION.md, commitment 5.** Replace with:

> 5. **One model per sport, no universal score.** Each discipline is reported in its own natural units: critical
>    power, critical speed, critical swim speed, estimated one-rep max. Each is tracked against the athlete's own
>    history. Where a sport has a published standard for age, sex and mass (run, ride, lift) it also gets an age
>    grade, and the grades are placed side by side, never summed into one number. Other cross-sport comparisons
>    appear only where physics makes them meaningful, as the existing running-versus-cycling energy-rate comparison
>    does.

Also: `e1rm.md` relative strength is unchanged. The build PR adds the ledger row ("Lift grade (new)") with the
synthetic lifters of section 7.

## 13. Build notes (for the slice)

- `packages/core/src/grade/liftStandard.ts`: the 42 coefficients in a table keyed by lift and `Sex`, the `sdS` terms,
  `LIFT_GRADE_STANDARD`, `liftStandardKg` and `liftGrade`. The lift for a slug from a table keyed by slug. No literal
  sport comparisons.
- The estimate exposes `sd` and its deadlift flag; the grade range reads them, not `low` and `high`.
- A calibration test pins the synthetic lifters of section 7 and the edge rules of section 8.
- The grade lives in standing, not the digest, so `MODEL_REVISION` does not move.
