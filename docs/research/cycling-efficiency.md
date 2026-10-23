# Cycling gross efficiency and the resting-energy question

Status: research note. It changes no model code. Values marked "unverified" were not checked against the primary text.

## 1. Question

ROADMAP, Model accuracy (cycling efficiency definitions and prior width): is `M = P / (GE * m)` consistent with the running side, which adds resting energy (1.22 W/kg)? What GE range do primary sources report? Should the prior (mean 0.215, sd 0.012, bounds [0.18, 0.25]; `packages/core/src/constants.ts:28`) be widened, and how does that change the 20-minute headline's 90% range? Does GE depend enough on power to bias other durations?

## 2. Definitions

Following Gaesser & Brooks (1975), as set out in Matomaki et al. (2019). W is external work rate and E_tot is total metabolic power, both in W:

- Gross efficiency: GE = W / E_tot
- Net efficiency: NE = W / (E_tot - E_rest)
- Work efficiency: WE = W / (E_tot - E_0), where E_0 is the zero-load cost
- Delta efficiency: DE = dW / dE_tot
- Economy: C = VO2 / P (not an efficiency)

Gaesser & Brooks argued that GE rises with work rate partly because the homeostatic share of total energy shrinks as total energy grows. This is reported in a secondary source; the primary text was not retrieved.

App formulas, per kg of body mass m:

- Cycling: M_ride = P / (GE * m), in `converters.ts` and `compareSports.ts` (`rideM`). Here E_tot = P / GE.
- Running: M_run = RMR + s * C(g) * v, with RMR = 1.22 W/kg, C the Minetti cost, and s the economy scale (`power.ts`, `compareSports.ts` `runM`).

By definition, E_tot = P / NE + E_rest, so P / GE = P / NE + E_rest.

## 3. Evidence

| Source (DOI)                                                                                   | Population and condition                    | Reported value                                                                                                        | Status                                                              |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Gaesser & Brooks 1975, J Appl Physiol 38:1132-1139 (10.1152/jappl.1975.38.6.1132, from prompt) | Definitions                                 | Values not retrieved                                                                                                  | DOI consistent with volume and pages; not directly confirmed        |
| Coyle et al. 1992, Med Sci Sports Exerc 24:782-788 (DOI not found)                             | 19 highly trained cyclists                  | DE 18.3-25.6%; r = 0.75 between % type I fibre and GE; GE mean and SD not retrieved                                   | Partly verified                                                     |
| Sidossis, Horowitz & Coyle 1992, Int J Sports Med 13:407-411 (10.1055/s-2007-1021289)          | 15 well trained; 3 cadences; 80-90% VO2max  | GE similar across cadences; DE 20.6% (60 rpm) to 23.8% (100 rpm)                                                      | Abstract verified                                                   |
| Moseley, Achten, Martin & Jeukendrup 2004, Int J Sports Med 25:374-379 (10.1055/s-2004-815848) | 69 men, tertiles by VO2peak                 | GE at 165 W: 18.6 ± 0.3, 18.8 ± 0.4, 17.9 ± 0.3%; DE 21-22%                                                           | Abstract verified; ± probably SEM, so SD is about 1.5 pp (inferred) |
| Moseley & Jeukendrup 2001, Med Sci Sports Exerc 33:621-627 (DOI not found; volume unconfirmed) | 17 men; three tests at least 5 days apart   | Within-subject CV: GE 4.2%, DE 6.7%, economy 3.3%                                                                     | Partly verified                                                     |
| Hopker et al. 2009, Int J Sports Med 30:845-850 (10.1055/s-0029-1237712)                       | Review: trained vs untrained                | Cross-sectional studies show no GE difference; well-controlled training raises GE                                     | Author order unverified                                             |
| Jobson, Hopker, Korff & Passfield 2012, J Sci Cycling (DOI not found)                          | Review and re-analysis of five studies      | GE explains about 30% of time-trial power variance; high-intensity training is the most potent stimulus               | Partly verified                                                     |
| Ettema & Lorås 2009, Eur J Appl Physiol 106:1-14 (10.1007/s00421-009-1000-5, from prompt)      | Review                                      | Not retrieved                                                                                                         | Citation confirmed via reference lists only; DOI unverified         |
| Matomaki, Linnamo & Kyrolainen 2019, Sports Med Open 5:23 (10.1186/s40798-019-0196-x)          | 14 mostly trained; 150 W; cadence 70-95 rpm | GE 20.0 ± 0.8% (range 18.4-21.4%)                                                                                     | Verified; gives the formula set                                     |
| Koning et al. 2012, Int J Sports Med 33:880-885 (10.1055/s-0032-1306285)                       | 28 trained; 1, 3 and 6 min stages           | GE higher in 1-min stages; rises with relative intensity to about 50% PPO or VT, then plateaus; no link to peak power | Abstract verified; values not retrieved                             |
| Cadence study, 2015 (citation not retrieved)                                                   | 13 trained; 90% VT                          | GE 20.6 ± 1.7% at 60 rpm; 18.1 ± 1.3% at 90 rpm                                                                       | Unverified citation                                                 |
| Young elite cyclists (journal and DOI unconfirmed)                                             | 6 riders at 4 W/kg                          | GE 23.4% (70 rpm), 22.7% (90), 22.1% (100), 21.2% (110)                                                               | Unverified citation                                                 |
| Minetti et al. 2002, J Appl Physiol 93:1039-1046 (10.1152/japplphysiol.01177.2001)             | 10 runners; grades -45% to +45%             | Level Cr 3.40 ± 0.24 J/kg/m (as quoted in a search snippet)                                                           | Net vs gross NOT verified; PDF unreadable                           |

Distribution. Trained cyclists at moderate steady loads (150-165 W) show GE of about 18-20%, with a between-subject SD of roughly 0.8-1.5 pp. At about 4 W/kg, reported GE is 21-23%. Cadence lowers GE by 2-3 pp at 90-110 rpm relative to 60-80 rpm. Cross-sectional trained vs untrained comparisons show no difference; Moseley et al. (2004) found none across VO2peak groups.

## 4. Consistency analysis

Cycling side: M_ride = E_tot / m. Resting energy is inside E_tot. Gross efficiency already includes it, so no resting term may be added here.

Running side: M_run = RMR + s * C * v. Resting is added once. This is correct only if the Minetti cost C is net of resting. This is unverified. If C were gross, M_run would be overstated by 1.22 W/kg, about 7.5% of the 16.3 W/kg example.

Ratio: M_run / M_ride. Both sides are gross, and each includes resting exactly once. The current formulas are internally consistent provided Minetti's C is net.

Double-count test (Monte Carlo arithmetic, not a fit): the additive form M_ride = P / GE + RMR, which the ROADMAP rejects, overstates M_ride by 1.22 W/kg. The ratio shifts by -10.9% at 150 W / 70 kg, -8.4% at 200 W / 70 kg, -6.2% at 300 W / 75 kg and -4.7% at 400 W / 75 kg.

Consistent resting-explicit form: M_ride = RMR + P / (NE * m). This equals P / GE(P) with GE(P) = NE * P / (P + NE * RMR * m). It needs an NE prior. For the 20-minute example, NE = 0.230 reproduces GE = 0.215 at 300 W and 75 kg.

Minor points. FLAT_RUN_COST = 3.6 is the Minetti polynomial intercept, while the paper's measured level value is quoted as 3.40 (unverified). In `sampling.ts`, kappaDraw uses the prior mean; it is scale-invariant only if the GE draws move with the mean.

## 5. Recommendation

Summary (100 words): Keep the gross definition and M_ride = P / (GE * m). Do not add resting to the cycling side, because gross efficiency already includes it. The running formula is consistent only if Minetti's cost is net, which is unverified. Widen the GE prior to sd 0.015 with bounds [0.17, 0.26], keeping the mean at 0.215. In a prior-only simulation this widens the 20-minute ratio's 90% half-width from 12.8% to 14.6% and leaves the median unchanged. Making resting explicit requires a net-efficiency prior (mean 0.230, sd 0.016). The current formulas are internally consistent. The additive P / GE + RMR form would double count.

Parameters:

- Keep M_ride = P / (GE * m). Do not add RMR on the cycling side.
- GE prior: mean 0.215 (unchanged), sd 0.015 (from 0.012), bounds [0.17, 0.26] (from [0.18, 0.25]).
- Justification: at mean 0.215 and sd 0.015, about 95% of draws fall between 0.185 and 0.245, covering the 18-23.5% range of primary studies. The mean is not moved. Threshold-type values (21-23% at 4 W/kg) argue against lowering it, while moderate-intensity values (18-20%) argue against raising it.
- Effect (Monte Carlo, prior only; example: run at 4.2 m/s flat, 16.3 W/kg; ride at 300 W and 75 kg; heart-rate calibration not modelled): the 90% half-width of the ratio goes from 12.8% to 14.6%, with the median at 0.875 in both. Moving the mean to 0.21 would lower the median by 2.4%.
- Alternative if resting must be explicit: NE prior mean 0.230, sd 0.016, bounds [0.18, 0.27]; M_ride = RMR + P / (NE * m). Simulated median 0.874, 90% half-width 13.8%.

Intensity dependence (Q4). Using the fixed-resting model above, a constant GE biases the ratio by -0.6% at 5 min (330 W), 0.0% at 20 min, +1.3% at 60 min (250 W) and +3.2% at 60 min (200 W). Each 1 pp of GE error moves the ratio by about 4.8%. The model's bias is small compared with the 90% half-width. Measured cadence effects of 2-3 pp could shift ratios by 10-15% if cadence differs systematically between durations, which this model does not capture.

## 6. Validation needed

- Read the Methods of Minetti et al. (2002) to confirm whether C is net of resting (the PDF could not be parsed).
- Obtain the primary texts of Gaesser & Brooks (1975) and Coyle et al. (1992) for DOIs and GE means and SDs.
- Confirm whether the Moseley et al. (2004) ± values are SEM or SD.
- Collect individual-rider GE at matched 5-, 20- and 60-minute powers, with cadence recorded.
- Re-run the heart-rate calibration with the widened prior and check the effective-sample-size threshold in `sampling.ts`.
- Validate the NE parametrization against the synthetic generator, whose default GE is 0.205 (`synthetic/athlete.ts`).

## 7. Open questions

- Is 0.215 the right mean for a 20-minute threshold-type effort? Moderate-load data give 18-20%; 4 W/kg data give 21-23%.
- Does the GE plateau above about 50% of peak power hold for 20-minute efforts? Koning et al. (2012) suggests so, but only the abstract was checked.
- Should the zero-load cost E_0 replace resting metabolic rate as the fixed cost during exercise, as in work efficiency?
- Unverified items: the Ettema & Lorås DOI and content; the Coyle, Gaesser & Brooks and Jobson et al. DOIs; the Moseley & Jeukendrup 2001 volume and DOI; the 2015 cadence and young-elite citations; and Jeukendrup's role in the Hopker et al. 2009 review.
