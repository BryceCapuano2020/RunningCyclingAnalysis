# Strength estimation: demonstrated performance and estimated capability

Status: research note for the strength module; changes no model code. "Unverified" means not checked against a primary text. "Secondary" means an abstract, search snippet, or summary.

## 1. Evidence

| Source                                                                      | Finding used                                                                                                                    | Status                                    |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| LeSuer et al. 1997, DOI `10.1519/1533-4287(1997)011<0211:taopef>2.3.co;2`   | 67 untrained adults, 7 equations, bench, squat, deadlift. Correlations r > 0.95, yet all equations underestimated deadlift 1RM. | DOI confirmed; findings secondary         |
| Reynolds, Gordon, Robergs 2006, DOI 10.1519/00124278-200608000-00020        | 70 adults, bench and leg press, 1/5/10/20RM tests. 5RM predictions most accurate; accuracy fell at higher reps.                 | Abstract only; error values not retrieved |
| Mayhew et al. 1995, J Sports Med Phys Fit 35(2):108-113 (DOI not found)     | Six equations correlated 0.82-0.98 with bench 1RM; Brzycki most accurate; averaging two equations suggested.                    | Secondary                                 |
| Ribeiro et al. 2024, Int J Strength Cond 4(1), DOI 10.47206/ijsc.v4i1.327   | 62 women, 57 men, 16-week program; nine equations on bench, squat, arm curl. Lombardi most accurate for men on bench and squat. | Abstract only                             |
| Zourdos et al. 2016, DOI 10.1519/JSC.0000000000001049                       | 29 squatters; RIR-based RPE scale (RPE 10 = 0 RIR). Velocity inversely related to RPE (r = -0.77 to -0.88).                     | Abstract read                             |
| Helms et al. 2016, DOI 10.1519/SSC.0000000000000218                         | RIR-based RPE scale presented as more precise near limit loads.                                                                 | Abstract summary                          |
| Vanderburgh and Batterham 1999, DOI 10.1097/00005768-199912000-00027        | Wilks adjustment valid for bench and total only; squat and deadlift showed body-mass bias.                                      | DOI confirmed; summary                    |
| Jaric 2002, Sports Med 32(10):615-631, DOI 10.2165/00007256-200232100-00002 | Normalise dynamometer force by body mass^0.67; torque uses exponent 1.                                                          | DOI confirmed; summary                    |
| Hammer Strength study 2010, DOI 10.1519/JSC.0b013e3181e726c6                | 31 men; machine 1RMs significantly higher than free-weight equivalents in every pair.                                           | Abstract                                  |
| Pull-up velocity study 2018, DOI 10.1519/JSC.0000000000002431               | 49 adults; single-rep bar velocity predicted max pull-up reps (reported R = 0.841). No added-load 1RM.                          | Summary                                   |

## 2. Equations and rep cap

Formulas, with w = load and R = reps to failure, as reported by secondary sources (check primaries before use):

- Epley: w(1 + R/30)
- Brzycki: 36w/(37 - R)
- Lombardi: w * R^0.10
- Lander: 100w/(101.3 - 2.67123R)
- Mayhew: 100w/(52.2 + 41.9e^(-0.055R))
- Wathen: 100w/(48.8 + 53.8e^(-0.075R))
- O'Conner: formula not verified.

Origins are weak. Epley came from a poundage chart, not a study. Lander, Lombardi, O'Conner, and Wathen came from practitioner sources (secondary). Brzycki 1993 is JOPERD 64(1):88-90; its DOI is unconfirmed. Mayhew 2008 (secondary, 103 women) found equations more accurate below 10 reps to failure.

**Rep cap:** use only sets with R <= 10 for e1RM. Prefer 1-5 rep sets, since Reynolds found 5RM predictions most accurate. Correlation is not accuracy: LeSuer's r > 0.95 coexisted with large absolute errors.

**Error bands:** no sourced numeric band per rep range was retrieved. The bands in Section 3 are design placeholders to calibrate.

**Point estimate:** the median of Epley, Brzycki, and Lombardi. Their spread is a usable uncertainty term. Do not pick equations by sex, since Ribeiro 2024 found the best one differs.

## 3. Recommended estimator

For each working set with load w, reps r, and optional RIR k (k = 10 - RPE):

1. Exclude from e1RM if r < 1, w <= 0, the set is flagged warm-up, or R > 10. Keep it as a demonstrated record.
2. Proximity to failure: a set taken to failure gives R = r, the tightest case. If k is logged, R = r + k. If not, R ranges over [r, min(r + 4, 10)]; the 4 is a placeholder.
3. Lower bound: a set not taken to failure means true R >= r. The estimate rises with R, so the value at R = r is a floor. The load w itself is a demonstrated floor on the 1RM.
4. Set estimate: point = median of the three equations at the mid R; interval = [minimum over equations at the low R, maximum at the high R].
5. Residual: widen by +/-5% for R <= 5 and +/-8% for R 6-10. Calibrate by backtesting: predict each later heavier set from earlier data and check coverage.
6. Lift estimate on date t: working sets in a trailing window (design choice: 8 weeks). Point = maximum set point; interval = [maximum lower end, maximum upper end].

**Example:** 5 reps at 100 kg. RIR unknown gives R in [5, 9] and an interval of 112.5-130.0 kg before the residual (Brzycki low, Epley high). RIR = 2 (R = 7) gives 120.0-123.3 kg, median 121.5 kg. Missing RIR widens the interval about fivefold (17.5 kg vs 3.3 kg).

## 4. Missing RPE and body mass

- **Missing RIR/RPE:** widen R as in step 2. Keep the load, flag "effort unknown," and treat it as a floor.
- **Scale mixing:** store RIR; convert RPE once at import (RPE 8 is RIR 2).
- **Missing body mass:** e1RM is unaffected, but relative strength cannot be computed. With a stale measurement, carry it forward and widen the relative interval; a 2 kg error at 80 kg moves BM^0.67 by about 1.7%, combined in quadrature with the e1RM interval.

## 5. Exercise, equipment, and bodyweight

- **Equipment:** keep barbell, dumbbell, machine, and Smith as separate keys. Machine 1RMs exceeded free-weight equivalents in every pair (Hammer Strength 2010), so pooling biases estimates.
- **Deadlift:** every equation LeSuer tested underestimated it. Flag deadlift estimates as likely low until the user's data supports a bias term.
- **Overhead press:** no source found; use the default estimator and mark it unverified.
- **Pull-ups and chin-ups:** effective load = alpha x body mass + added load. Alpha (bodyweight fraction) is not established in any source found. Store reps and added load; report demonstrated reps at added load; compute an added-load e1RM only after alpha is calibrated. The 2018 velocity study predicts rep count only.

## 6. Relative strength

Use allometric normalisation, e1RM / BM^b, with b = 0.67 for force (Jaric 2002; b = 1 for torque). A ratio (b = 1) assumes strength rises in proportion to mass, so gaining mass without gaining strength lowers the ratio more than the allometric index. Prefer allometric scaling when comparing over body-mass changes. This is reasoning, not a tested result for this app: keep b configurable and show b = 1 as a sensitivity check. Relative strength stays in the strength module and is never merged with endurance scores.

## 7. Demonstrated vs estimated outputs

- **Demonstrated:** the heaviest load lifted at each rep count, with date, equipment, RIR when logged, and an "effort unknown" flag. No interval.
- **Estimated:** e1RM point and interval, sets used, R range, equations, last session date, and staleness.
- **Change:** report change between windows only when intervals separate; otherwise "no clear change." Show demonstrated and estimated values side by side. Never present an estimate as a lift performed.

## 8. Data sources

- **Strong export** (secondary; a 2021 community post, not Strong's documentation): Date, Workout Name, Duration, Exercise Name, Set Order, Weight, Reps, Distance, Seconds, Notes, Workout Notes, RPE. Delimiter and units not shown. Hevy imports only English Strong exports.
- **Hevy and FitNotes headers:** not verified; the Hevy help page returned 403 and no FitNotes header documentation was found. A third-party FitNotes converter groups rows by Date but names no columns.
- **Garmin FIT** (official Python SDK profile, read via summary; not checked against Profile.xlsx): `set` (225): field 3 repetitions (uint16); field 4 weight (uint16, kg, scale 16); field 5 set_type (0 rest, 1 active); field 7 category (exercise_category, array); field 8 category_subtype (uint16). exercise_category includes bench_press = 0, run = 32, bike = 33, unknown = 65534. Exercise names map via exercise_title (message 264), per a forum post (unverified).

## 9. Minimal manual schema

```text
sets: date (YYYY-MM-DD), exercise (canonical key), equipment (barbell | dumbbell | machine | smith | bodyweight | other), load_kg (external load; 0 if none), reps (int >= 1), rir (int 0-5, optional), rpe (1-10, optional), set_type (working | warmup), session_id (optional), notes (optional)
body_mass: date, body_mass_kg, source
exercise_params: exercise, bodyweight_fraction (nullable)
```

One row per set; a sets count is derived. Store kg and convert lb at import.

## 10. Failure modes

- Reps above 10 used for e1RM; non-failure sets read as maxima.
- RPE and RIR confused; warm-ups counted as working sets (Strong's header has no set-type column).
- Equipment pooled across barbell and machine; lb and kg mixed.
- Duplicate rows after re-import.
- Correlation mistaken for accuracy; deadlift and equation-choice bias.
- Stale body mass.
- Sparse data: short trends with wide intervals. Require several sessions before claiming change.
- RIR accuracy evidence is thin (Martikainen 2025, DOI 10.1007/s42978-025-00338-8, snippet only); RIR-based estimates may be biased.

## 11. Gaps

- No numeric per-rep-range error bands retrieved.
- Primaries not read or not found: Brzycki (DOI unconfirmed), Mayhew 1992 (DOI not found), Wathen 1994, O'Conner 1989.
- Hevy and FitNotes headers unverified; Strong headers secondhand.
- Bodyweight fraction (alpha) and overhead press evidence missing.
