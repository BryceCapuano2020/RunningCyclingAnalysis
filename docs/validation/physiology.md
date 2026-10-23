# Physiology validation: app energy model against ACSM and independent sources

Status: validation note. No model code was changed. The executable checks are in
`packages/core/src/validation/physiology.test.ts`. Values marked **unverified** were not checked
against the primary text.

## 1. Question

Does the app's gross metabolic power agree with equations that were not used to build it?

- Running: `runMetabolicPower` / `flatSpeedToMetabolic` in `packages/core/src/metabolic/power.ts` and
  `converters.ts`. Gross W/kg = 1.22 + s × C(g) × v, with the Minetti cost C and economy scale s = 1.
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

## 4. Results

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

## 8. Model findings (reported, not fixed)

1. **Flat running is about 13% below ACSM (9% at E = 20.1).** The economy prior (mean 1.0, sd 0.06,
   bounds 0.82–1.18) puts the ACSM-implied scale of about 1.16 in its upper tail. Either the prior
   mean or the 3.6 J/kg/m slope needs review.
2. **Cycling reads 25% low at 1 W/kg** because the cycling side has no resting term. It is within
   about 10% at 2 to 5 W/kg. This is not addressed in `docs/research/cycling-efficiency.md`, which
   concludes that gross efficiency needs no resting term. That conclusion holds at moderate load,
   not at low load.
3. **The matched-effort running to cycling ratio excludes the reference 1.0** at all three speeds.
   Finding 1 drives most of this.

## 9. Tolerances in the test

- Flat and graded running, −5%, 0% and +5%: ±15% of ACSM (20.9 and 20.1 bands). The current worst
  case is −14.3%. The suggested ±10% would fail at every flat speed (−12.4% to −13.2%), so it is
  not used. The 15% bound covers the structural slope gap, about 13% at 20.9 J/ml, whose worst
  current value is −14.3% (−5% grade). Each energy equivalent is checked on its own. At 20.1 J/ml
  flat running sits at about −9%, so the ±4% energy-equivalent band is not added to the slope gap.
- +10%: ±5%. Current agreement is −1.5%.
- Cycling 2 to 5 W/kg: ±15%. Current range is −6.6% to +13.8% across both energy equivalents.
- Cycling at 1 W/kg: ±30%. The known resting-energy gap is −25%. This pins the gap and will flag a
  change in either direction.
- Matched-effort ratio: p50 in [0.75, 0.90] and p95 below 1. This pins the disagreement in
  finding 3. Update it when the model changes.
- Resting term: within 1% of ACSM 3.5 ml/kg/min at 20.9 J/ml.

Each tolerance is a bound on the current gap, not a claim of agreement. A change to the running slope
or the cycling efficiency will move the numbers and fail the test.
