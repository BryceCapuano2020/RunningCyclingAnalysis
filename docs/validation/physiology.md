# Physiology validation: app energy model against ACSM and independent sources

Status: validation note. The executable checks are in
`packages/core/src/validation/physiology.test.ts`. Values marked **unverified** were not checked
against the primary text. The model described here is revision 6 (`MODEL_REVISION` 6), whose cost
curves are those of revision 5. Sections 4 and 8 record the revision 4 results as they were before
the correction. Section 10 gives the revision 4 and revision 5 results side by side. Revision 6
changed only the gradient fed to these costs, which is now taken over the distance the speed stream
implies so that gradient times speed is the recorded climb rate; every result here is unchanged.

## 1. Question

Does the app's gross metabolic power agree with equations that were not used to build it?

- Running: `runMetabolicPower` / `flatSpeedToMetabolic` in `packages/core/src/metabolic/power.ts` and
  `converters.ts`. Gross W/kg = 1.22 + s × C(g) × v, with the economy scale s = 1 at the prior mean.
  Revision 4 used C = Minetti's cost. Revision 5 uses C = Minetti + 0.30 J/kg/m (`runCost`).
- Cycling: `ridePowerToMetabolic` in `converters.ts`. Gross W/kg = P / (GE × m), with GE = 0.215
  (`PRIORS.grossEfficiency.mean`, `constants.ts`).

## 2. Sources

| Ref    | Source                                                                                                                                                          | Identifier                                                                                                                                                    | Status                                                                                                                                                                                                            |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M02    | Minetti AE, Moia C, Roi GS, Susta D, Ferretti G (2002). Energy cost of walking and running at extreme uphill and downhill slopes. _J Appl Physiol_ 93:1039–1046 | doi:10.1152/japplphysiol.01177.2001                                                                                                                           | Citation and abstract verified (search). Full text not parsed. Level cost quoted as 3.40 ± 0.24 J/kg/m in a search snippet. Net vs gross: **unverified**. Polynomial coefficients: **unverified** against the PDF |
| ACSM-R | ACSM running equation, VO2 = 0.2 S + 0.9 S G + 3.5 (S m/min, G fraction; ml/kg/min)                                                                             | ACSM Guidelines for Exercise Testing and Prescription. Form quoted in Jang WY et al. (2020) _J Clin Med_ 9(6):1889, Table 1, which cites the 1980 2nd edition | Form verified by secondary quotation. Current edition text: **unverified**. The 134 m/min validity threshold is from a secondary summary only                                                                     |
| ACSM-C | ACSM leg-cycling equation, VO2 = 1.8 × (work rate, kg·m/min) / mass + 7 = 7 + 10.8 × W/kg (1 W = 6 kg·m/min)                                                    | ACSM Guidelines (edition not confirmed). Secondary: IDEA and Physiological Society abstract                                                                   | Form verified by secondary sources. Primary text: **unverified**. Using 1 W = 6.12 kg·m/min gives 11.0 W/kg (see §5)                                                                                              |
| EE     | Energy equivalent of O2, 20.9 J/ml at RER 1.0 and 20.1 J/ml at RER 0.82                                                                                         | Péronnet F, Massicotte D (1991) _Can J Sport Sci_ 16:23–29 (DOI not verified)                                                                                 | **Unverified**. A letter (_Int J Sports Med_ 2000;21:540–541, doi:10.1055/s-2000-8147) reports 5.047–5.189 kcal/L at RQ ≥ 1.0 (21.1–21.7 kJ/L). A secondary source gives about 20 kJ/L at RQ 0.82                 |
| LM84   | Léger L, Mercier D (1984). Gross energy cost of horizontal treadmill and track running. _Sports Med_ 1:270–277                                                  | doi:10.2165/00007256-198401040-00003                                                                                                                          | Citation verified (record). Regression VO2 = 2.209 + 3.163 × v(km/h) from a search summary, not the full text                                                                                                     |
| dP     | di Prampero rule of thumb, about 1 kcal/kg/km ≈ 4.18 J/kg/m                                                                                                     | Not located in primary form                                                                                                                                   | **Unverified** primary. Wikipedia's cost-of-transport article gives 4.184 J/kg/m. Used only as a cross-check                                                                                                      |
| MAT19  | Matomaki P, Linnamo V, Kyrolainen H (2019) _Sports Med Open_ 5:23                                                                                               | doi:10.1186/s40798-019-0196-x                                                                                                                                 | Verified in `docs/research/cycling-efficiency.md`. Gross/net definitions from Gaesser & Brooks (1975), doi:10.1152/jappl.1975.38.6.1132, not retrieved here                                                       |

## 3. Method

- Speeds 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5 m/s. Grades −5%, 0, +5%, +10%. Cycling 1 to 5 W/kg
  mechanical, at 70 kg.
- Reference values use both energy equivalents (20.9 and 20.1 J/ml). Each gives a band.
- The app side calls the exported functions. The reference equations are written out in the test.
- "Matched effort" for running versus cycling: at speed v, find the cycling power that ACSM says
  costs the same gross W/kg. The ACSM reference ratio is 1 by construction. The app ratio comes from
  `compareSports` (prior draws, no heart-rate calibration), and its 90% range is p05 to p95.

Difference = app / reference − 1.

## 4. Results (revision 4, before)

### 4.1 Flat running

| Speed (m/s) | App W/kg | ACSM 20.9 | Diff   | ACSM 20.1 | Diff  | Léger–Mercier (20.9, gross) | Diff  |
| ----------- | -------- | --------- | ------ | --------- | ----- | --------------------------- | ----- |
| 2.5         | 10.22    | 11.67     | −12.4% | 11.22     | −8.9% | 10.69                       | −4.4% |
| 3.0         | 12.02    | 13.76     | −12.6% | 13.23     | −9.2% | 12.67                       | −5.1% |
| 3.5         | 13.82    | 15.85     | −12.8% | 15.24     | −9.3% | 14.65                       | −5.7% |
| 4.0         | 15.62    | 17.94     | −12.9% | 17.25     | −9.5% | 16.64                       | −6.1% |
| 4.5         | 17.42    | 20.03     | −13.0% | 19.26     | −9.6% | 18.62                       | −6.4% |
| 5.0         | 19.22    | 22.12     | −13.1% | 21.27     | −9.6% | 20.60                       | −6.7% |
| 5.5         | 21.02    | 24.21     | −13.2% | 23.28     | −9.7% | 22.59                       | −6.9% |

The gap to ACSM is steady at about −13% (20.9) or −9% (20.1) at every speed. It comes from the slope,
not the resting term (§6.1).

### 4.2 Graded running (ACSM 20.9 reference)

Diff by speed (rows) and grade (columns).

| Speed (m/s) | −5%    | 0%     | +5%   | +10%  |
| ----------- | ------ | ------ | ----- | ----- |
| 2.5         | −13.2% | −12.4% | −7.8% | −1.4% |
| 3.0         | −13.5% | −12.6% | −7.9% | −1.4% |
| 3.5         | −13.8% | −12.8% | −8.0% | −1.4% |
| 4.0         | −13.9% | −12.9% | −8.0% | −1.5% |
| 4.5         | −14.1% | −13.0% | −8.1% | −1.5% |
| 5.0         | −14.2% | −13.1% | −8.1% | −1.5% |
| 5.5         | −14.3% | −13.2% | −8.1% | −1.5% |

At +10% the two agree to 1.5%. Downhill is the least reliable part of both references. Minetti's
cost curve bends sharply on descents, and ACSM's linear grade term does not.

### 4.3 Cycling (ACSM 10.8 W/kg form)

| Power (W/kg) | App W/kg (GE 0.215) | ACSM 20.9 | Diff   | ACSM 20.1 | Diff   |
| ------------ | ------------------- | --------- | ------ | --------- | ------ |
| 1            | 4.65                | 6.20      | −25.0% | 5.96      | −22.0% |
| 2            | 9.30                | 9.96      | −6.6%  | 9.58      | −2.9%  |
| 3            | 13.95               | 13.72     | +1.7%  | 13.20     | +5.7%  |
| 4            | 18.61               | 17.49     | +6.4%  | 16.82     | +10.6% |
| 5            | 23.26               | 21.25     | +9.4%  | 20.44     | +13.8% |

The app's cycling curve crosses ACSM near 2.7 W/kg. It reads low at 1 W/kg and high at 4 to 5 W/kg
(§5 and §6.2).

### 4.4 Running to cycling at matched effort

Matched effort: cycling power costing the same ACSM gross W/kg as running at v. Reference ratio = 1.

| Run speed (m/s) | ACSM run W/kg | Matched cycling W/kg | App run W/kg | App cycling W/kg at that power | App ratio p05 | p50   | p95   |
| --------------- | ------------- | -------------------- | ------------ | ------------------------------ | ------------- | ----- | ----- |
| 3               | 13.76         | 3.01                 | 12.02        | 14.00                          | 0.750         | 0.857 | 0.970 |
| 4               | 17.94         | 4.12                 | 15.62        | 19.17                          | 0.711         | 0.813 | 0.922 |
| 5               | 22.12         | 5.23                 | 19.22        | 24.33                          | 0.688         | 0.788 | 0.894 |

**Answer: no.** At 3, 4 and 5 m/s, the reference ratio of 1.0 lies outside the app's 90% range.
The app puts running at about 0.79 to 0.86 of cycling at the same effort. Most of the gap comes from
the running slope (§6.1). At 4 to 5 W/kg the app's cycling cost adds a further 6 to 10%. The app's running economy prior is centred at 1.0, and the ACSM-implied
scale is about 1.16 (inside the prior range, but in its upper tail).

## 5. Cycling efficiency implied by ACSM (derived)

ACSM gross VO2 for leg cycling is 7 + 10.8 P (P in W/kg). Converting with E J/ml:

- Gross metabolic power M(P) = (7 + 10.8 P) × E / 60.
- At E = 20.9: M = 2.438 + 3.762 P. At E = 20.1: M = 2.345 + 3.618 P.
- Gross efficiency GE(P) = P / M(P).

| P (W/kg) | GE, E = 20.9 | GE, E = 20.1 |
| -------- | ------------ | ------------ |
| 1        | 16.1%        | 16.8%        |
| 2        | 20.1%        | 20.9%        |
| 3        | 21.9%        | 22.7%        |
| 4        | 22.9%        | 23.8%        |
| 5        | 23.5%        | 24.5%        |

- The incremental (marginal) efficiency dP/dM = 1 / 3.762 = **26.6%** (E = 20.9), or 27.6% (E = 20.1).
- With 1 W = 6.12 kg·m/min, the slope is 11.0 W/kg and the incremental efficiency is 26.1%.
- The app's GE of 0.215 equals ACSM's gross efficiency at P = 0.215 × 2.438 / (1 − 0.215 × 3.762) ≈ **2.7 W/kg**.

So the "about 21–25%" range holds at 3–5 W/kg. The ACSM-implied gross efficiency depends on load,
because the 7 ml/kg/min baseline is fixed. A constant GE cannot match both ends.

## 6. Expected sources of difference

### 6.1 Running

- **Minetti is a treadmill study** of 10 runners at −45% to +45% (M02). Treadmill economy at fixed
  speed can differ from overground running.
- **ACSM is an estimate for submaximal steady state.** The 0.2 ml/kg/m slope equals 4.18 J/kg/m at
  20.9 J/ml. That is about 16% above Minetti's 3.6 J/kg/m (and about 23% above the 3.40 level value
  quoted in a search snippet). The ACSM equation's 0.2 coefficient is not derived in the sources
  retrieved.
- **Léger & Mercier (gross regression)** sits about 4 to 7% below ACSM at 20.9. Its slope is between
  the two.
- **Energy equivalent.** Changing E from 20.9 to 20.1 moves ACSM by about 4%.
- **Net vs gross.** If Minetti's cost is gross, adding 1.22 W/kg double counts resting energy. This is
  **unverified** (§7).

### 6.2 Cycling

- **ACSM leg-cycling** is for steady state at about 50 to 60 rpm (secondary source). GE priors come
  from trained cyclists at 60 to 100 rpm.
- **Resting energy.** The app's cycling side has no resting term, while running has 1.22 W/kg. At
  1 W/kg the app reads 25% low. Gross efficiency already includes resting energy in the definition,
  but at low load a fixed 1.22 W/kg baseline dominates (§5).
- **Unit conversion.** 1 W = 6 or 6.12 kg·m/min shifts ACSM by 2%.

## 7. Items not verified

- ACSM Guidelines 11th edition text. Equation forms come from secondary sources only.
- Energy equivalents 20.9 (RER 1.0) and 20.1 (RER 0.82). Péronnet & Massicotte's table was not
  retrieved. Its RQ ≥ 1 values (21.1–21.7 kJ/L) would raise ACSM by 1% to 4%.
- Minetti's net vs gross basis, the 3.6 polynomial intercept, and all six polynomial coefficients.
- Léger & Mercier regression coefficients (from a summary).
- di Prampero's rule as a primary source.
- Gaesser & Brooks 1975 values, and the DOIs of the research-note references not listed in §2.

## 8. Model findings

Revision 4 findings. Findings 1 and 3 are addressed for running in §10.

1. **Flat running was about 13% below ACSM (9% at E = 20.1).** The economy prior (mean 1.0, sd 0.06,
   bounds 0.82–1.18) puts the ACSM-implied scale of about 1.16 in its upper tail. Fixed by the level
   correction (§10): flat running is now 6% below ACSM.
2. **Cycling reads 25% low at 1 W/kg** because the cycling side has no resting term. It is within
   about 10% at 2 to 5 W/kg. This is not addressed in `docs/research/cycling-efficiency.md`, which
   concludes that gross efficiency needs no resting term. That conclusion holds at moderate load,
   not at low load. Still open.
3. **The matched-effort running to cycling ratio excludes the reference 1.0** at all three speeds.
   Finding 1 drove most of this. Now 1.0 is inside the range at 3 and 4 m/s, but not at 5 m/s, because
   constant efficiency reads cycling high at 5 W/kg (§10.3).

## 9. Tolerances in the test

Revision 5 tests (`physiology.test.ts`). Each bound is an agreement bound against an independent
reference, not a pin on a gap, except where the test documents a residual.

- Flat running at 3 to 5 m/s: within ±10% of ACSM at 20.9 and 20.1 J/ml, and within ±10% of
  Léger & Mercier at 20.9 J/ml.
- Flat running residual: between 4% and 10% below ACSM at 20.9 J/ml. The residual is documented,
  not closed.
- Graded running, −5%, 0% and +5%: within ±10% of ACSM. At +10%: within ±5%.
- Cycling at 2 to 5 W/kg: within ±15% of ACSM at both energy equivalents. Unchanged.
- Cycling at 1 W/kg: within ±30%. The resting-energy gap is documented, not closed.
- Matched-effort ratio: 1.0 inside the 90% range at 3 and 4 m/s. At 5 m/s the test is marked as an
  expected failure (§10.3). The median is documented to lie between 0.80 and 0.95.
- Resting term: within 1% of ACSM 3.5 ml/kg/min at 20.9 J/ml.
- Implied running economy scale against ACSM lies inside the prior bounds.

## 10. Revision 5: before and after

**Change.** Running cost is Minetti's curve plus a 0.30 J/kg/m level correction at every gradient
(flat 3.6 → 3.9, `RUN_COST_CORRECTION`). Efficiency prior sd 0.012 → 0.015, bounds 0.17 to 0.26,
mean 0.215 unchanged. Economy prior sd 0.06 → 0.08, bounds 0.76 to 1.24, mean 1.0 unchanged. The
digest stores run values with the correction, so `MODEL_REVISION` moves from 4 to 5.

**Why additive, not a scale.** A uniform scale of 1.083 gives the same flat and matched-effort
numbers, but reads +6.3% against ACSM at +10% grade, where revision 4 read −1.5%. The additive form
reads +3.3%. headline-bias.md §5(a) prefers the additive form for this reason.

**Pace.** Flat pace conversions use `FLAT_RUN_COST` (3.9). A given energy rate now means a speed
about 8% slower: 4:00 /km at the same energy rate becomes 4:20 /km.

### 10.1 Flat running (W/kg, 20.9 J/ml)

| Speed (m/s) | Before | After | ACSM  | Before vs ACSM | After vs ACSM | After vs Léger & Mercier |
| ----------- | ------ | ----- | ----- | -------------- | ------------- | ------------------------ |
| 3           | 12.02  | 12.92 | 13.76 | −12.6%         | −6.1%         | +2.0%                    |
| 4           | 15.62  | 16.82 | 17.94 | −12.9%         | −6.2%         | +1.1%                    |
| 5           | 19.22  | 20.72 | 22.12 | −13.1%         | −6.3%         | +0.6%                    |

Before against Léger & Mercier was −5.1%, −6.1% and −6.7%. After energy equivalent 20.1 J/ml, flat
running is −2.4% to −2.6% against ACSM.

### 10.2 Graded running against ACSM at 20.9 J/ml (before → after, at 3, 4 and 5 m/s)

| Grade | Before              | After            |
| ----- | ------------------- | ---------------- |
| −5%   | −13.5, −13.9, −14.2 | −5.3, −5.5, −5.6 |
| 0%    | −12.6, −12.9, −13.1 | −6.1, −6.2, −6.3 |
| +5%   | −7.9, −8.0, −8.1    | −2.4, −2.5, −2.5 |
| +10%  | −1.4, −1.5, −1.5    | +3.2, +3.3, +3.3 |

### 10.3 Matched effort (run against cycling, 90% range, 4,000 draws)

| Speed (m/s) | Matched cycling W/kg | Before p05 / p50 / p95 | After p05 / p50 / p95 | 1.0 inside after? |
| ----------- | -------------------- | ---------------------- | --------------------- | ----------------- |
| 3           | 3.01                 | 0.750 / 0.857 / 0.970  | 0.773 / 0.920 / 1.079 | Yes               |
| 4           | 4.12                 | 0.711 / 0.813 / 0.922  | 0.734 / 0.875 / 1.028 | Yes               |
| 5           | 5.23                 | 0.688 / 0.788 / 0.894  | 0.711 / 0.848 / 0.998 | No                |

At 5 m/s the upper bound is 0.998 with 4,000 draws and 0.999 with 80,000, so the miss is real, not
sampling noise. The cause is the cycling side. Constant efficiency at 5.2 W/kg reads about 10% high
against ACSM (§4.3), so the matched cycling cost is too high and the ratio sits below 1. The
power-dependent efficiency slope GE(P) would close it, and headline-bias.md §5(b) proposes it, but it
is not implemented. The 5 m/s test asserts this gap (0.95 < p95 < 1.0), and it should be revisited
when GE(P) lands.

The median stays 8 to 15% below 1 (0.85 to 0.92), because the running side is about 6% low and the
cycling side is high at 4 to 5 W/kg.

### 10.4 Cycling

Unchanged at mean efficiency 0.215 (§4.3). The wider efficiency prior widens the matched-effort range
but does not move any cycling value.

### 10.5 Residual gaps, stated

- Flat running is 6% below ACSM, within the documented 4 to 10% band, and within 2% of Léger &
  Mercier. ACSM's 4.18 J/kg/m slope and Léger & Mercier's 3.97 differ, so no single level matches
  both. The residual is not closed.
- Matched effort at 5 m/s misses 1.0 by 0.1%, as in §10.3.
- Cycling reads 25% low at 1 W/kg (no resting term), as in §8.2.
- Centre sensitivity. The 3.9 centre rests partly on unverified values, and Margaria's 4.18 equals
  ACSM's slope. The validators did not set the value. Without Margaria the centre is 3.73
  (headline-bias.md §3). Flat running then reads −9.8 to −10.2% against ACSM, so the ±10% test fails
  at 5 m/s, and the matched 90% range contains 1.0 only at 3 m/s.

### 10.6 Downhill is unvalidated

The additive correction adds 11%, 14% and 17% to Minetti's cost at −5%, −10% and −20% grade (cost
2.75, 2.15 and 1.80 J/kg/m). A uniform 1.083 scale would add 8.3% at every grade. Only −5% has a
reference. The app is 5.3 to 5.6% below ACSM there, and the tests check it. No test checks −10% or
−20%. §4.2 notes that downhill is the least reliable part of both references, so these residuals
are not a validated measurement.

### 10.7 Heart-rate calibration shifts with the correction

The observed heart-rate slope ratio κ in the cross-check moves with the correction, because run
values rise by about 8% at flat. This is expected and correct. `calibrationWeights` normalises
economy draws by the prior mean (`sampling.ts:33`), which stays 1.0, so the correction enters
through the observed heart-rate data and not through the draws. The size of the shift was not
measured separately. The κ test in `pipeline.test.ts` still brackets the true value.
