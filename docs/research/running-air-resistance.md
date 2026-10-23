# Outdoor running air resistance: research note

Scope: ROADMAP, Model accuracy (running air resistance). The app's running model is `P = 1.22 + s * C(i) * v` (W/kg). `C(i)` is the Minetti et al. (2002) polynomial, measured on a treadmill with no air resistance (`packages/core/src/metabolic/power.ts`). `RHO_AIR = 1.225` kg/m^3 is used in `packages/core/src/constants.ts`. Air density by altitude already exists in `packages/core/src/physics/air` and feeds cycling power, not running.

## 1. Question and effect size

Outdoors, drag adds mechanical work `F * v` with `F = 0.5 * rho * CdA * (v + w)^2`. The metabolic cost is `F * v / eta`, where `eta` is the mechanical-to-metabolic efficiency for work against drag. Per kg and per metre, this is `dC_air = 0.5 * rho * K * (v + w)^2 / m`, with `K = CdA / eta` (m^2) and `m` the body mass (kg).

The metabolic data identify only `K`, not `CdA` and `eta` separately. From the primary numbers in section 2, `K` is about 0.5 to 0.9 m^2, with 0.8 as the central value. Assumed: still air (`w = 0`), `m = 65 kg`, gross `P = 1.22 + 3.6 * v`. Each cell shows the central value (K = 0.8), with the K = 0.5 to 0.9 range in brackets.

| Speed (m/s) | Sea level, rho = 1.225 kg/m^3 | 2,000 m, rho = 1.007 kg/m^3 |
| ----------- | ----------------------------- | --------------------------- |
| 3           | 1.7% (1.1 to 1.9)             | 1.4% (0.9 to 1.6)           |
| 4           | 3.1% (1.9 to 3.5)             | 2.5% (1.6 to 2.9)           |
| 5           | 4.9% (3.1 to 5.5)             | 4.0% (2.5 to 4.5)           |
| 6           | 7.1% (4.5 to 8.0)             | 5.9% (3.7 to 6.6)           |

The 2,000 m density is the ISA value (ratio 0.82 to sea level). Per-kg air cost scales as `1/m`, so a 52 kg runner has about 25% more than the 65 kg case.

The suggested "about 2% at 5 m/s" is not supported. The primary-derived range at 5 m/s is 3 to 5.5%.

## 2. Evidence table

Status: "verified" means the abstract or record was fetched or confirmed. "Secondary" means it comes from a search summary or a citing source. "Unverified" means I could not confirm it.

| Source                                                                                           | Method                                                           | Key finding                                                                                                                                                                                                  | Parameters                                                                                                  | Limitations                                        |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Pugh 1970, J Physiol 207:823-835, doi:10.1113/jphysiol.1970.sp009097 (verified)                  | Track vs treadmill O2, 7 vs 4 athletes                           | Air is about 8% of cost at 21.5 km/h and 16% for a 10 s 100 m sprint                                                                                                                                         | Frontal area and Cd not stated in the abstract (unverified)                                                 | Full text is a PDF; abstract only                  |
| Pugh 1971, J Physiol 213:255-276, doi:10.1113/jphysiol.1971.sp009381 (verified)                  | Running and walking against wind                                 | VO2 rises with wind squared. Air is 7.5% at middle distance and 13% at sprint. A runner 1 m behind cut VO2 by 6.5% at middle distance. Example: 65 kg at 4.45 m/s, VO2 3.0 to 5.0 L/min at 18.5 m/s headwind | Efficiency number unverified; text states horizontal work against wind is more efficient than vertical work | Abstract only                                      |
| Davies 1980, J Appl Physiol (unverified)                                                         | Treadmill in wind tunnel, 3 subjects                             | Cited by secondary blogs as VO2 rising with wind squared; drafting figures disputed                                                                                                                          | None verified                                                                                               | Primary not retrieved                              |
| Hill 1928, Proc R Soc B 102:380-385 (bibliographic, secondary)                                   | Analytical                                                       | Drag cited as at most about 5% of total drag                                                                                                                                                                 | Unverified                                                                                                  | Primary not retrieved                              |
| Kyle 1979, Ergonomics 22:387-397 (bibliographic, secondary)                                      | Drafting, cyclists and runners                                   | Cited for drafting reduction                                                                                                                                                                                 | Unverified                                                                                                  | Primary not retrieved                              |
| Léger and Mercier 1984, Sports Med 1:270-277, doi:10.2165/00007256-198401040-00003 (secondary)   | Re-analysis of 10 treadmill studies plus Pugh wind term          | Track equation has a cubic speed term, about 0.000526                                                                                                                                                        | Units and exponent unverified                                                                               | Indirect; wind term borrowed from Pugh             |
| di Prampero 1986, Int J Sports Med 7:55-72, doi:10.1055/s-2008-1025736 (bibliographic)           | Review                                                           | Air-resistance content unverified                                                                                                                                                                            | Unverified                                                                                                  | Full text not read                                 |
| di Prampero et al. 2005, J Exp Biol 208:2809-2816, doi:10.1242/jeb.01700 (bibliographic)         | Sprint starts, first 30 m                                        | Abstract summaries do not show air-drag treatment                                                                                                                                                            | Unverified                                                                                                  | Full text not read                                 |
| Jones and Doust 1996, J Sports Sci 14:321-327, PMID 8887211 (secondary)                          | 9 trained men; treadmill 0 to 3% vs road                         | 1% grade matches road cost at 2.92 to 5.0 m/s                                                                                                                                                                | Unverified beyond abstract                                                                                  | Abstract summaries only                            |
| Minetti et al. 2002, J Appl Physiol 93:1039-1046, doi:10.1152/japplphysiol.01177.2001 (verified) | Treadmill, 10 runners, -0.45 to +0.45                            | Level running cost 3.40 plus or minus 0.24 J/kg/m (abstract)                                                                                                                                                 | Polynomial constant 3.6 used in app                                                                         | No air resistance                                  |
| da Silva, Kram, Hoogkamer 2021, doi:10.1101/2021.04.27.441608 (preprint, verified abstract)      | 12 runners; 12, 14, 16 km/h; horizontal impeding force 0, 4, 8 N | Gross metabolic power rises 6.13% per 1% body weight of impeding force. Air is 8.52% of gross at 2 h marathon pace                                                                                           | Large individual variation; extrapolated to 5.86 m/s                                                        | Preprint; speed range below marathon pace          |
| da Silva, Kram, Hoogkamer 2022, J Appl Physiol, doi:10.1152/japplphysiol.00086.2022 (secondary)  | Emulated drag, marathon                                          | Drag is 7.8% of gross for a 52 kg runner at 2 h pace                                                                                                                                                         | Drafting saves 3 min 42 s to 5 min 29 s                                                                     | Full text not read; differs from the 2021 preprint |
| Wind-tunnel drafting study, J Appl Biomech 2025 (secondary)                                      | 33 trained runners                                               | VO2 up 4.7% in headwind; drafting cut that by 2.8%                                                                                                                                                           | Unverified                                                                                                  | Search summary only                                |
| Hoogkamer 2018 (Sports Med) and Polidori 2020                                                    | Not found                                                        | Only unrelated 2018 shoe paper and 2022 numerical work located                                                                                                                                               | Unverified                                                                                                  | Not located                                        |

Derived values, from the primary numbers and stated assumptions (65 kg unless noted):

- Pugh 1971 example (wind 18.5 m/s, runner 4.45 m/s): drag power is `22.1 * CdA` W/kg, and the metabolic increment is 10.7 W/kg, so `K = 0.48`.
- Pugh 1970 (8% at 5.97 m/s): `K = 0.86` to `0.91`.
- da Silva 2021 and 2022 (52 kg, 5.86 m/s): `K = 0.73` (7.8%) to `0.80` (8.52%).

## 3. Candidate models

All three are gross power in W/kg. `C(i)` is the existing Minetti polynomial, `s` the existing economy scale, `R = 1.22`.

**Model A (explicit mechanical-to-metabolic, Pugh-type).**
`P = R + s * C(i) * v + dC_air * v`, with `dC_air = 0.5 * rho(z) * (CdA / eta) * (v + w)^2 / m`.
Parameters: `CdA = 0.20 m^2` (unverified; plausible 0.15 to 0.30), `eta = 0.25` (unverified; 0.20 to 0.45). This gives `K = 0.8`. Uncertainty is roughly plus or minus 40% in `K`. The metabolic term is `F * v / eta`, so the conversion is explicit and the headwind enters through `(v + w)^2`.

**Model B (Hoogkamer-proportional).**
`P = (R + s * C(i) * v) * (1 + beta * F / (m * g))`, with `F = 0.5 * rho * CdA * (v + w)^2`, `beta = 6.13`.
This multiplies the gross power by the drag-to-weight fraction. Its implied effective efficiency is about 0.4. It reproduces the 8.52% at 2 h pace with `CdA` near 0.33. Uncertainty: `beta` is from 12 runners at 12 to 16 km/h, and extrapolating to 5 to 6 m/s is not verified.

**Model C (anchored fraction, Pugh 1970).**
`P = (1 + f(v)) * (R + s * C(i) * v)`, with `f(v) = 0.08 * (v / 5.97)^2 * (rho / 1.225)`.
One anchor (Pugh 1970), with `v^2` scaling from `v^3` drag over gross power that is roughly linear in speed. No wind or mass term.

All three agree in order of magnitude at 4 to 6 m/s and differ mainly in how wind and mass enter.

## 4. Recommendation

Do not add a drag term to the headline now. Three reasons: wind is unknown, `eta` and `CdA` are unverified, and treadmill and outdoor runs are not yet distinguished in the data. Wind dominates. A 2 m/s headwind on a 4 m/s runner raises relative speed by 50% and drag by 125%.

Proposed steps:

1. Done in model revision 5: `runEconomyScale` standard deviation widened from 0.06 to 0.08, mean kept at 1.0, bounds widened to 0.76 to 1.24 (±3 SD). The level correction is separate (headline-bias.md §5a).
2. After validation: add Model A with `K = 0.8` for outdoor runs with a known still-air flag only. Expected effect on estimated gross running power: +3 to +5% at 4 to 5 m/s at sea level (+3 to +4% at 2,000 m), and 0% for treadmill runs. The headline moves by the outdoor share times this, which I did not trace through the digest pipeline.

Validation data needed: matched-speed indirect calorimetry, outdoor still-air vs treadmill, at 3 to 6 m/s, with wind measured at 1.5 m, at sea level and at about 2,000 m. Wind-tunnel `CdA` for runners. At least 20 participants to narrow `K` below the current 0.5 to 0.9 range.

## 5. Open questions and risks

- Wind: unknown to the app. Air cost scales with `(v + w)^2`, so headwinds dominate and tailwinds reduce cost only partly. Any weather source would need validation.
- Drafting: Pugh 1971 found about 6.5% lower VO2 one metre behind a runner at middle-distance speed. Group running cannot be detected from a single-runner file.
- Treadmill runs carry no drag. A correction must be gated on an outdoor flag. I did not check whether the app records this.
- The 1% grade convention (Jones and Doust 1996) bundles drag with other road effects, so applying both would double count. Its implied cost of about 0.20 J/kg/m is roughly constant, while the drag term at 3 m/s is only about 0.07 J/kg/m. The convention overcorrects at low speed.
- Flat cost: `FLAT_RUN_COST` is now 3.9 (the Minetti polynomial intercept, 3.6, plus the 0.30 level correction; headline-bias.md §5a). The Minetti abstract reports a level value of 3.40 J/kg/m, with a net basis that is unverified.
- Efficiency definition (gross vs net) must match roadmap item 2 before any `eta` is used.

Confidence: moderate on the order of magnitude (air is roughly 2 to 8% of gross running power at 3 to 6 m/s). Low on the exact coefficients, since `eta` and `CdA` are unverified and only `K` is constrained.
