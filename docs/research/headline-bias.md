# Headline bias: literature-based parameters for running and cycling

Status: research note, 2026-10-23. No model code changed. **Unverified** marks values not checked against a primary text. Matched-effort figures come from a Node replica of `compare/` (mulberry32, seed 1, 4000 draws). The replica reproduces `docs/validation/physiology.md` section 4.4 to three decimals.

## 1. Summary

- **Running:** level cost 3.9 J/kg/m (the app's 3.6 plus an additive 0.30), SD 8%.
- **Cycling:** keep gross efficiency with a power-dependent mean, GE(P) = 0.200 + 0.0108 × (P − 2.14), SD 0.015 (P in W/kg).
- **Resting:** counted once in each sport.
- **Expected:** the flat-running gap to ACSM falls from −13% to −6%. The matched-effort median rises from 0.79–0.86 to 0.90–0.92, and 1.0 falls inside the 90% range at every speed. A residual 8–10% gap remains.

A source that sets a parameter is never used to validate it.

## 2. Sources and roles

Running (level cost, J/kg/m):

| Source                                                     | Value                                                         | Status                                                                      | Role            |
| ---------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------- |
| Minetti et al. 2002, doi:10.1152/japplphysiol.01177.2001   | 3.40 ± 0.24 level; app uses 3.6                               | Abstract verified. 10 runners; training status and net basis **unverified** | Parameter       |
| Margaria et al. 1963, doi:10.1152/jappl.1963.18.2.367      | About 1 kcal/kg/km ≈ 4.18                                     | Citation verified; value **unverified**                                     | Parameter, weak |
| Trained runners, 1977 (nine)                               | 0.97 kcal/kg/km ≈ 4.06                                        | Secondary; **unverified**                                                   | Parameter, weak |
| Léger & Mercier 1984, doi:10.2165/00007256-198401040-00003 | VO2 = 2.209 + 3.163 v (km/h); 130 subjects; slope 3.97 J/kg/m | Regression verified from abstract                                           | Validation      |
| ACSM running                                               | Slope 0.2 ml/kg/m = 4.18                                      | Secondary                                                                   | Validation      |
| Lacour & Bourdin 2015, doi:10.1007/s00421-015-3115-y       | About 20% spread between runners                              | Abstract verified; mean **not retrieved**                                   | Sets SD         |
| di Prampero 1986, doi:10.1055/s-2008-1025736               | Not retrieved                                                 | Citation verified                                                           | Not used        |

Cycling:

| Source                                                  | Value                                            | Status                                                            | Role               |
| ------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------- | ------------------ |
| Matomaki et al. 2019, doi:10.1186/s40798-019-0196-x     | GE 20.0 ± 0.8% at 150 W; n = 14                  | Verified (cycling note)                                           | Parameter (anchor) |
| Moseley et al. 2004, doi:10.1055/s-2004-815848          | n = 69; GE at 165 W 18.6, 18.8, 17.9%; DE 21–22% | Abstract verified; "±" probably SEM                               | Validation         |
| Sidossis et al. 1992, doi:10.1055/s-2007-1021289        | DE 20.6% (60 rpm) to 23.8% (100 rpm)             | Abstract verified                                                 | Context            |
| Coyle et al. 1992, Med Sci Sports Exerc 24:782–788      | DE 18.3–25.6%                                    | DOI **not found**; partly verified                                | Context            |
| Koning et al. 2012, doi:10.1055/s-0032-1306285          | GE plateaus above about 50% PPO or VT            | Abstract verified                                                 | Shape              |
| Gaesser & Brooks 1975, doi:10.1152/jappl.1975.38.6.1132 | Origin of "GE rises with work rate"              | DOI matches volume and pages; a 2004 citation gives another title | Context            |
| ACSM cycling, 7 + 10.8 P                                | GE 20.4% at 2.1 W/kg; 22.9% at 4 W/kg            | Secondary                                                         | Validation         |

## 3. Running

**Typical cost and Minetti's bias.** The three parameter sources centre on 3.88 J/kg/m, so the parameter mean is 3.9. Against that centre the app's 3.6 is 7% low, and Minetti's abstract value of 3.40 is 12% low. Against the pooled Léger & Mercier slope of 3.97 (validation only), the app is 9% low. Minetti's C(0) therefore probably underestimates the average runner by 7–9% at the app's constant. The basis is a 10-runner study with an unverified net basis, so this is probable, not established. The abstract's "independent of speed" fits a net cost only, since a gross per-distance cost would equal R/v + C (inference).

**Between-person spread.** Lacour & Bourdin's 20% spread implies an SD of about 5–6% for samples of 30–100 (derived). The three central values have an SD of about 11%. I use 8%: the prior describes individual economy, and the wider source spread is model uncertainty.

**Treadmill vs overground.** Jones & Doust 1996 (doi:10.1080/02640419608727717; nine trained men; abstract verified) found that a 1% treadmill grade matched road cost. On Minetti's curve C(0.01) = 3.80, which is 5.5% above 3.6. This is a literature route to outdoor flat cost that needs no economy fit. The air-resistance note says the 1% convention already includes drag, so drag must not be added on top. The app does not flag treadmill runs.

## 4. Cycling

**Power dependence.** A fixed GE of 0.215 reads 7–14% low at 2.1–2.4 W/kg (measured GE 18.4–20.0%) and 6–9% high at 4–5 W/kg (ACSM 22.9–23.5%). Gaesser & Brooks' argument and Koning's plateau support the direction. The slope is weakly sourced.

**Delta-efficiency form.** DE is about 22% (Moseley: 21.2–22.4%; Sidossis: 20.6–23.8%), with a between-subject SD of about 1.5–2 pp (inferred from Moseley's ±). M = B + P/(DE × m) needs a baseline B, which is unresolved. Resting energy alone (B = 1.22) at DE 0.22 overshoots ACSM by 4%, 8%, 11% and 13% at 2.1, 3, 4 and 5 W/kg. A 1992 unloaded-pedalling figure (0.66 L/min at 60 rpm; mass not given; source unconfirmed) implies 3–5 W/kg at 70 kg, above ACSM's whole intercept of 2.44 W/kg. I do not propose this form until the baseline is measured.

**The measured studies disagree.** Matomaki (20.0%) and Moseley (18.4%) differ by 1.6 pp at 2.1–2.4 W/kg, about 9% in M. Cadence is a candidate cause (cycling note: 2–3 pp lower at 90–110 rpm; unverified). The model has no cadence term.

## 5. Proposed changes

(a) **Running.** Level-cost mean 3.9 J/kg/m, SD 0.31 J/kg/m (8%). Implement it as an additive offset of +0.30 at every grade, not a uniform scale. A uniform ×1.083 gives +6.7% against ACSM at +10% grade and −8.2% at −5%; the additive offset gives +3.4% and −6.0%. `compareSports` divides by the prior mean (s / S̄), so changing `runEconomyScale.mean` alone does nothing. The shift must enter the base cost.

(b) **Cycling.** GE(P) = 0.200 + 0.0108 × (P − 2.14), SD 0.015, bounds [0.17, 0.26]. The anchor is Matomaki 2019 (70 kg assumed). The slope is the midpoint (22%) of the cycling note's 4 W/kg band (unverified). Keep the gross form with no resting term. `compareSports` must evaluate GE at each duration's power, and `calibrationWeights` (`kappaDraw`) assumes one GE and needs the same change.

(c) **Resting.** Running: M = 1.22 + s × C × v, counted once, and valid only if C is net (inferred). Cycling: M = P/(GE × m), where gross GE already contains resting energy. Adding 1.22 W/kg to cycling would overstate M by about 9% at 3 W/kg.

## 6. Expected change

Formulas as coded (R = 1.22, s = 1): ACSM running (0.2 × 60v + 3.5) × 20.9/60; ACSM cycling (7 + 10.8P) × 20.9/60; Léger & Mercier running (2.209 + 3.163 × 3.6v) × 20.9/60; proposed running R + 3.9v.

Flat running (W/kg):

| Speed (m/s) | Now   | Proposed | ACSM  | Léger & Mercier | Now vs ACSM | Proposed vs ACSM | Proposed vs L&M |
| ----------- | ----- | -------- | ----- | --------------- | ----------- | ---------------- | --------------- |
| 3           | 12.02 | 12.92    | 13.76 | 12.67           | −12.6%      | −6.1%            | +2.0%           |
| 4           | 15.62 | 16.82    | 17.94 | 16.64           | −12.9%      | −6.2%            | +1.1%           |
| 5           | 19.22 | 20.72    | 22.12 | 20.60           | −13.1%      | −6.3%            | +0.6%           |

Cycling (W/kg), at the matched powers:

| P (W/kg) | GE now | GE proposed | M now | M proposed | ACSM M | Now vs ACSM | Proposed vs ACSM |
| -------- | ------ | ----------- | ----- | ---------- | ------ | ----------- | ---------------- |
| 2.14     | 21.5%  | 20.0%       | 9.95  | 10.70      | 10.49  | −5.1%       | +2.0%            |
| 3.01     | 21.5%  | 20.9%       | 14.00 | 14.37      | 13.76  | +1.7%       | +4.4%            |
| 4.12     | 21.5%  | 22.1%       | 19.16 | 18.61      | 17.94  | +6.8%       | +3.7%            |
| 5.23     | 21.5%  | 23.3%       | 24.33 | 22.41      | 22.11  | +10.0%      | +1.4%            |

Matched-effort ratio (replica Monte Carlo; matched power from ACSM, so the reference ratio is 1):

| Speed (m/s) | Matched P (W/kg) | Now p05 / p50 / p95   | Proposed p05 / p50 / p95 |
| ----------- | ---------------- | --------------------- | ------------------------ |
| 3           | 3.01             | 0.750 / 0.857 / 0.970 | 0.753 / 0.898 / 1.055    |
| 4           | 4.12             | 0.711 / 0.813 / 0.922 | 0.759 / 0.903 / 1.057    |
| 5           | 5.23             | 0.688 / 0.788 / 0.894 | 0.778 / 0.923 / 1.075    |

Second reference: Léger & Mercier running against Moseley cycling at 3 m/s. The matched power is 12.67 × 0.184 = 2.33 W/kg. The app ratio is 1.11 now (12.02 / (2.33/0.215)) and 1.12 proposed (12.92 / (2.33/0.202)).

Running alone gives medians of 0.92, 0.88 and 0.85. Cycling alone gives 0.84–0.86. The median stays about 10% short of 1. Adopting ACSM's 4.18 slope alone would give 0.96 at 4 m/s (17.94 / 18.61).

## 7. Recommended test

**Matched-effort check.** At 3.01, 4.12 and 5.23 W/kg (ACSM reference), require |p50 − 1| ≤ 0.15 and p05 ≤ 1 ≤ p95. Add one check at 3 m/s, Léger & Mercier running against Moseley cycling: |p50 − 1| ≤ 0.15.

**Why 0.15.** The two cycling references differ by 13% at 2.33 W/kg (ACSM 11.20 W/kg against Moseley-implied 12.66), so a tighter tolerance would fail on the references, not the model. The running references differ by about 7% at 4 m/s (ACSM 17.94, Léger & Mercier 16.64 W/kg). Proposed deviations are 10.2%, 9.7%, 7.7% and 12.0%, so the proposal passes. The current model deviates by 14.3%, 18.7% and 21.2%. It fails at 4 and 5 m/s and passes at 3 m/s, so the test is weak there.

**Component checks.**

- Flat running against Léger & Mercier, 3–5.5 m/s: within ±5%. Proposed +0.4 to +2.7%; current −5.1 to −6.9%. The 5% covers the 4% energy-equivalent band (20.1 vs 20.9 J/ml).
- Flat running against ACSM at 20.9: within ±10%. Proposed −6.0 to −6.4%; current −12.4 to −13.2%. The 10% covers the 5% slope gap to Léger & Mercier and the energy-equivalent band.
- Cycling against ACSM at 3–5 W/kg: within ±5%. Proposed +1.4 to +4.4%; current +1.7 to +10.0%. The 5% is a stated choice, since the sources retrieved give no ACSM cycling error bound.
- Cycling against Moseley at 2.36 W/kg: within ±10% in M. Proposed −9%. This is the gap between two measured studies, tolerated rather than closed.

## 8. Unverified and open

- Minetti's net basis and training status (the PDF was unreadable).
- Margaria 1963 and 1977 values (secondary); di Prampero 1986 running value (the brief's "3.86" is unconfirmed); Lacour & Bourdin's mean cost.
- Black et al. (92 runners): values and DOI not retrieved. Ettema & Lorås 2009: DOI unverified.
- Gaesser & Brooks' DOI (the title differs in a 2004 citation); Coyle 1992 and Moseley & Jeukendrup 2001 DOIs.
- The baseline (unloaded pedalling), the cadence effect on GE, and the 4 W/kg band behind the slope.
- Body masses in the Matomaki and Moseley studies (70 kg assumed).
- The tolerances are proposals, not yet implemented in tests.
- Beyond ACSM, the only independent cycling check is Moseley, at 2.36 W/kg. There is no second reference at 3–5 W/kg.
