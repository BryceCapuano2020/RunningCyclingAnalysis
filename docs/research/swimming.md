# Swimming capability estimation: research notes

Scope: critical speed (CS) and related capability from ordinary uploaded pool swims. Status key: **Verified** means the source record was opened. **Snippet** means search summary only. **Unverified** means secondary or unconfirmed.

## 1. Evidence

| Source                                                                               | Design                                                              | Finding                                                                                                  | Status                     |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------- |
| Wakayoshi et al., Int J Sports Med 13(5):367-371 (1992), DOI 10.1055/s-2007-1021282  | 8 trained swimmers; 50 to 400 m; pool                               | CS as slope of distance on time                                                                          | Snippet                    |
| Wakayoshi et al., Eur J Appl Physiol 64:153-157 (1992)                               | Flume and pool; n unclear                                           | Critical velocity from regression; DOI not found                                                         | Unverified                 |
| Wakayoshi et al., Eur J Appl Physiol 66:90-95 (1993), DOI 10.1007/BF00863406         | 8 swimmers; maximal 200 and 400 m; 4 x 400 m at 98, 100, 102%       | Two-point estimate correlates with speed at 4 mmol/L (r = 0.914); lactate stable near 3.2 mmol/L at 100% | Snippet                    |
| Dekerle et al., Int J Sports Med 26(7):524-530 (2005), DOI 10.1055/s-2004-821227     | 8 swimmers; CSS from tests to exhaustion; SMLSS from 30 min trials  | CSS 92.7% vs SMLSS 88.3% of MAS (r = 0.87); not interchangeable                                          | Snippet                    |
| Later study, CV vs MLSS in swimming (18 men)                                         | MLSS 89.7% vs CV 94.0% of 400 m speed                               | CV overestimates MLSS velocity                                                                           | Unverified (authors, year) |
| Scott, Burden, Dekerle, J Hum Kinet 90:239-251 (2023), DOI 10.5114/jhk/170882        | 32 national swimmers; 3 x 200 m and 3 x 400 m per specialist stroke | CS typical error 0.02 to 0.04 m/s (CV 2 to 3.4%); D' unreliable (CV 13 to 45%)                           | Verified                   |
| Raimundo et al., Front Physiol 13:952818 (2022), DOI 10.3389/fphys.2022.952818       | 13 male swimmers; two interval sessions                             | Recovery constant CV 306%; time-to-exhaustion CV 28 to 29%; no link to CS                                | Verified                   |
| Mooney et al., PLoS ONE 12(2):e0170902 (2017), DOI 10.1371/journal.pone.0170902      | 10 swimmers; Garmin Swim (older device) vs video                    | Stroke-type sensitivity 95.4% (breaststroke 86.0%); stroke count within 1 on 62.5% of laps               | Verified                   |
| Petrigna et al., Sci Sports 37(5-6):373-382 (2022), DOI 10.1016/j.scispo.2021.06.003 | Scoping review; 41 studies, 16 protocols                            | CV protocol variation may make it inaccurate; SOP proposed                                               | Snippet                    |
| Ginn CSS test (400 m and 50 m); 200/400 variant                                      | Coaching sites only                                                 | Attribution and "80 to 85% of 100 m speed" unconfirmed                                                   | Unverified                 |
| Open-water smartwatch accuracy                                                       | No peer-reviewed study found                                        | Forum reports of phantom distance and breaststroke GPS loss                                              | Unverified                 |

## 2. Training-data estimation

No validated method was found for estimating CS from routine sets or intervals. The closest work is Raimundo et al. (2022), which fitted a D' balance model to two swimming interval sessions and found it inconsistent. Petrigna et al. (2022) argue that varied CV protocols are themselves a validity problem. Any training-data estimator is therefore research-grade and must be labelled as such.

## 3. What the FIT file contains

Verification note: Garmin's developer pages did not expose field tables, and the raw Garmin SDK profile returned 404. The numbers below come from the python-fitparse profile, which is generated from Garmin's Profile.xlsx, plus forum reports for pool length. Confirm each against Profile.xlsx before coding.

| Message (no.) | Field              | No. | Type            | App use                       |
| ------------- | ------------------ | --- | --------------- | ----------------------------- |
| length (101)  | total_elapsed_time | 3   | uint32          | Length duration               |
| length        | total_timer_time   | 4   | uint32          | Moving time, excludes pauses  |
| length        | total_strokes      | 5   | uint16          | Stroke count, freestyle check |
| length        | avg_speed          | 6   | uint16          | Cross-check only              |
| length        | swim_stroke        | 7   | enum            | Stroke per length             |
| length        | length_type        | 12  | enum            | Active or idle                |
| session       | swim_stroke        | 43  | enum            | Session stroke                |
| session       | pool_length        | 44  | uint16          | Pool length, metres           |
| session       | pool_length_unit   | 46  | display_measure | Metric or statute             |
| session       | num_active_lengths | 47  | uint16          | Active length count           |
| lap           | num_lengths        | 32  | uint16          | Lengths per lap               |
| lap           | swim_stroke        | 38  | enum            | Lap stroke                    |

Enums: `swim_stroke` 0 freestyle, 1 backstroke, 2 breaststroke, 3 butterfly, 4 drill, 5 mixed, 6 im. `length_type` 0 idle, 1 active.

- Rest appears as length records with `length_type` idle. Placement inside laps is unverified.
- A stored `pool_length` of 2286 for 25 yd implies a scale of 100 (forum). Reading 25 yd as 25 m overstates speed by about 9%.
- The local `profile.ts` defines session (18), lap (19), sport 5 (swimming) and sub-sport 17 (lap swimming), but not length (101) or any swim field.
- Still unverified: lap `total_strokes`, length `start_time`, and `display_measure` values.
- Open water: GPS positions with no pool length. Length and stroke fields may be absent (unverified).

## 4. Stroke differences

Analyse freestyle first:

- Most CS evidence is freestyle (rows 1 to 4 above).
- Stroke detection is weakest for breaststroke (86% sensitivity, row 7).
- Scott et al. report that a third 800 m trial was acceptable to only 39% of butterfly swimmers, and that form-stroke racing is limited to shorter events.
- Scott et al. found CS reliable in all four strokes, but with 7 to 10 swimmers per stroke. Each stroke needs its own validation.

## 5. Missing-data rules

- No `swim_stroke`, or a non-freestyle tag: exclude from CS and keep as demonstrated splits only.
- Stroke tagged per session, not per length: lower confidence tier, and require agreement across lengths.
- No `pool_length` or unit: no distances, so refuse the estimate. Do not assume a default.
- Open-water GPS only: no CS. Mark distance as GPS-derived, reject invalid coordinates, and reject implausible distances.

## 6. Recommended estimator

1. Inputs: maximal freestyle pool efforts from 100 to 400 m, with a confirmed pool length.
2. Model: distance = CS x time + D', least squares on maximal efforts only. Deterministic code, no LLM.
3. Minimum evidence: three maximal efforts across at least two distances, with a distance ratio of at least 2, within six weeks. The six-week window is a design choice; Scott et al. used three 200 m and three 400 m trials over three weeks. Below this, output "insufficient evidence" and no number.
4. Submaximal efforts are not fitted. A submaximal effort still bounds capacity: CS x T + D' must be at least D. If one violates the fitted line, flag the fit as inconsistent. Never raise the estimate because of it.
5. Uncertainty: bootstrap over efforts, with pool-length and timing error propagated. Report an 80% interval. Scott et al.'s controlled typical error (0.02 to 0.04 m/s) is the best-case benchmark, so uploaded data should give wider intervals. Report D' only as flagged and wide, or withhold it.
6. Label: "model estimate of critical speed, not a lactate threshold" (see row 4).

## 7. Demonstrated versus estimated

- Demonstrated (from the file): best freestyle efforts at standard distances, with time, pace, date, pool-length basis, device and source file.
- Estimated (model): CS with its interval, number of efforts, date window and model version. D' is flagged.
- Keep these as separate panels. No combined score and no cross-sport merge.

## 8. Failure modes

1. Unit error: 25 yd read as 25 m, about 9% speed error.
2. Idle lengths or pauses counted as active time.
3. Stroke mislabels (breaststroke, or stroke-count inflation) entering CS.
4. Submaximal efforts labelled maximal. Slower times flatten the slope, so CS is biased low.
5. Starts and turns add time per length, and their share grows on short efforts. Quantify this rather than assume it away.
6. Open-water GPS error: phantom distance and signal loss in breaststroke.
7. CS presented as a lactate threshold (row 4).
8. Overprecise D' (CV 13 to 45%, row 5).
9. Unvalidated training-session estimator (section 2).
