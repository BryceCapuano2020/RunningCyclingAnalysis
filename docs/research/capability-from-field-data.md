# Capability from field data: evidence and estimator design

Status key: **V** = source record or abstract opened in this review; **S** = DOI and findings from search metadata, not opened; **U** = unverified (not found, or the publisher blocked access). Unverified items have no DOI here.

## 1. Evidence table

| Source                                                                                                                                                                   | Method                                                                                     | Data requirement                                       | Accuracy vs lab reference                                                                                         | Status                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Karsten et al. 2015, Eur J Appl Physiol 115(1), doi:10.1007/s00421-014-3001-z                                                                                            | Field CP tests at 3, 7 and 12 min; experiment 3 used best efforts from training and racing | Maximal efforts at three durations                     | SEE 4.5 to 5.8% across experiments; training/race bests (experiment 3): SEE 5.2%, limits of agreement -34 to 44 W | V                             |
| Karsten et al. 2016 (the 2021 paper was not found), J Sports Sci 35(14), doi:10.1080/02640414.2016.1215500                                                               | Lab CP and W' with 3 h or 30 min between trials                                            | Recovery between efforts                               | Versus 24 h gap: CP off 2.5% (3 h) and 3.7% (30 min); W' off 25.6% and 32.9%                                      | V                             |
| Triska et al. 2017, PLoS One 12(12), doi:10.1371/journal.pone.0189776                                                                                                    | Lab 12, 7 and 3 min time trials, 10 male triathletes                                       | Three maximal trials, after familiarisation            | Test-retest CV: CP 2.6%, W' 8.2%; no criterion measure                                                            | V                             |
| Mattioni Maturana et al. 2018, J Sci Med Sport 21(7), doi:10.1016/j.jsams.2017.11.015                                                                                    | Five time-to-exhaustion trials, 13 cyclists                                                | Trials of about 1 to 20 min                            | Trials under 10 min inflate CP; two trials at 12 to 20 min agree with five-trial criterion                        | S                             |
| Jones & Vanhatalo 2017 review, Sports Med 47 (suppl 1), doi:10.1007/s40279-017-0688-0                                                                                    | Constant-power CP method; 3 min all-out alternative                                        | Exhaustion of about 2 to 15 min; 3 to 5 trials         | None reported                                                                                                     | V                             |
| Smyth & Muniz-Pumares 2020, Med Sci Sports Exerc 52(12), doi:10.1249/MSS.0000000000002412                                                                                | Critical speed from logged runs of over 25,000 recreational runners                        | Distance-time bests (best model used 400, 800, 5000 m) | Marathon prediction error 7.67% (best model); 8.01% ± 0.51% across 42 models; no lab CS                           | V                             |
| Morton 1996, Ergonomics 39(4), doi:10.1080/00140139608964484                                                                                                             | 3-parameter model adding a time asymptote                                                  | Efforts across several durations                       | Not reported here                                                                                                 | V                             |
| Sreedhara et al. 2019, Sports Med Open 5:54, doi:10.1186/s40798-019-0230-z                                                                                               | Survey of 2-parameter, 3-parameter, exponential and W'bal models                           | Review                                                 | Not applicable                                                                                                    | V                             |
| Leo et al. 2022 review, Eur J Appl Physiol 122(2), doi:10.1007/s00421-021-04833-y; record power profile, Int J Sports Physiol Perform 17(5), doi:10.1123/ijspp.2021-0263 | Power profiling and power-duration review; normative mean maximal power (MMP) profiles     | Power data                                             | Not applicable; advises against single-effort predictors such as FTP                                              | S                             |
| J Sports Sci 41(10), 2023, doi:10.1080/02640414.2023.2254574                                                                                                             | CP from race MMP at 2, 5 and 12 min, or a filtered method; 13 under-23 cyclists            | Race power files                                       | Filtered CP matched a field CP test; W' did not correlate with the field W' test                                  | S                             |
| Puchowicz et al., "Development and field validation of an omni-domain power-duration model" (about 2020)                                                                 | Power-duration model fitted to MMP                                                         | MMP curve                                              | Unknown                                                                                                           | U                             |
| Coggan, TrainingPeaks WKO4 model article (2015, updated 2026)                                                                                                            | Vendor model fitted to MMP from 1 s to 28 h                                                | MMP                                                    | Mean absolute residual 3.2%; proxies only, no lab gold standard                                                   | V (vendor, not peer reviewed) |

Model background: the two-parameter model is P = W'/t + CP (Leo review; Poole et al. 2016, doi:10.1249/MSS.0000000000000939, S; Burnley & Jones 2018, doi:10.1080/17461391.2016.1249524, S).

## 2. Estimators

### Running: critical speed (CS)

- **Inputs:** GPS best efforts at three or more distances. Smyth's best model used 400, 800 and 5000 m, so the cycling rule to exclude efforts under 2 min does not transfer to running without validation.
- **Submaximal efforts:** Treat an unverified run as a lower bound, not a point. No primary censoring method was found (U).
- **Uncertainty:** Bootstrap interval across efforts, reported alongside the 7.67% marathon-prediction error as external accuracy.
- **Minimum evidence (design rule, not validated):** three distances from at least two sessions, including one of 3 km or more.

### Cycling: critical power (CP) and W'

- **Inputs:** MMP values from 3 to 15 min for the CP fit, including at least one effort of 12 min or more. Support: Jones & Vanhatalo (about 2 to 15 min); Mattioni (sub-10 min trials inflate CP); Karsten (3, 7 and 12 min). Exclude efforts under 2 min from the CP fit.
- **Submaximal efforts:** A recorded MMP value is a lower bound. Use it as a censored constraint (design choice, U for the method).
- **Model:** Two-parameter CP/W' by default. Mattioni found the three-parameter model most accurate, so add it only when at least four durations exist (design rule).
- **Uncertainty:** CP interval from the fit and a bootstrap, with a floor near 4 to 6% (Karsten SEE). W' interval should be wide: Triska CV 8.2%, and Karsten 2016 W' deviations of 26 to 33%.
- **Race-file CP** (2023) matched a field test, but W' did not, so race data should not drive W'.
- **Minimum evidence (design rule):** three MMP values from at least two sessions, including one of 12 min or more. No power data means no cycling estimate.

### Demonstrated versus estimated

- **Demonstrated:** the best recorded value at each standard duration, with date, source activity, sensor and a data-quality flag. Shown as recorded, never smoothed.
- **Estimated:** CP, W' and CS with an interval, model name, duration span, effort count and date window. Labelled as model output. Flag any estimate that exceeds the best demonstrated value by more than its interval.

### Evidence ageing

- Under four weeks off, aerobic capacity and blood volume fall quickly. Beyond four weeks, VO2max falls but stays above untrained levels, and recent gains are lost (Mujika & Padilla, Part I doi:10.2165/00007256-200030020-00002; Part II doi:10.2165/00007256-200030030-00001, S).
- Coyle et al. 1984 (seven athletes, retested out to 84 days): secondary summaries disagree on the VO2max loss (7 to 16%). The publisher returned HTTP 403, so the primary record and DOI are U.
- Human CP and W' decay: no study found (U). One elite rower lost about 100 W at a lactate reference after eight weeks off (S).
- Windows: the 42-day (CTL) and 7-day (ATL) constants come from training-software conventions. Their origin is not confirmed in a primary source (U). No source was found for a 90-day window (U). Use 42 days as a starting time constant for confidence decay, not as a validated half-life.

## 3. Failure modes

- Submaximal efforts treated as maxima bias CP low. Fits using only sub-10 min trials bias CP high (Mattioni).
- Short recovery between efforts corrupts W' far more than CP (Karsten 2016).
- W' is imprecise; do not display it to fine precision.
- Model choice changes CP; compare two- and three-parameter fits before reporting (Sreedhara; Mattioni).
- Missing power or GPS noise: never impute. Drop efforts with suspect sensors, since spikes inflate short-duration bests.
- Race pacing: starting above 94% of CS predicted a fade of more than 25% in the second half (Smyth 2020), so race bests are not automatically maxima.
- Vendor models (WKO4) report residuals only against proxies, so they are not validation evidence.
- Stale data: estimates built from old efforts overstate current capability.

## 4. Gaps

- Not found: the Puchowicz 2020 DOI; a 2021 Karsten paper (the 2016 paper is the closest); a censored or tobit method for submaximal MMP; a primary source for a four-parameter model; a primary source for the 42- or 90-day windows.
- Smyth follow-ups: a 2024 Sports Medicine paper on training zones and a 2026 J Appl Physiol paper are reported but unverified (U).
- Background DOIs not opened: Hill 1993 (doi:10.2165/00007256-199316040-00003, citation record only); Jones et al. 2010 (PubMed 20195180, DOI not confirmed).
