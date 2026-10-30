# The effort gate: a best is a capability only when it was a hard effort

Status: built (`packages/core/src/effort/gate.ts`), applied to thresholds, zones from threshold, race predictions, the Balance
headline and the late-in-sessions views. Calibrated on the synthetic harness only; no real figures are in this note.

## What it says

A best effort is a lower bound on what an athlete can do. It becomes a capability (a threshold, a zone, a race time, a level
to set against the other sport) only when it was a hard effort, and heart rate is the evidence the app has. The gate asks one
question per sport and period: **was the best 20 minutes a hard effort?** The best 20 minutes is the effort every fit has to
reach (`CP_FIT_REACH_TOLERANCE`), the one the Balance headline grades, and the one the chip has always named.

Verdicts: `hard`, `notHard`, and `unknown` (no heart rate on that best, no reference, or no 20 minute best: nothing is
judged, nothing is withheld, and no chip is shown). A failed gate withholds the estimate, shows the demonstrated best as a
floor ("At least"), and names the effort that would settle it: one hard 20 min effort.

The line is the existing one: 90% of the reference heart rate, judged on the percent shown (`isHardShare`). The chip, the
gate, the "What changed" strip and the Method page all use it.

## The reference cannot certify itself

The reference is the athlete's own highest sustained heart rate, so on its own it only compares a best with the athlete's
top. A library with no hard effort has a reference at its easy level and every best reads 95% to 100% of it. Two checks
(`readReferences`) sit in front of the share:

| Reading    | When                                                                                            | Why                                                                                                    |
| ---------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `low`      | the reference is under 150 bpm                                                                  | under the mean maximum at 80 (Tanaka 2001: 208 - 0.7 x age = 152), so not a maximum at any usual age   |
| `habitual` | over 12 or more days with a heart rate, the median day's peak is 90% or more of the maximum     | a true maximum is reached on few days; where the typical day sits at it, it is where the athlete lives |
| `trusted`  | otherwise (and for libraries under 12 days, which cannot say, so that a single test day passes) |                                                                                                        |

The reading is that of the sport that supplied the reference (cycling's may be run's less 6 bpm), so a ride library next to a
hard run library is judged against the run's maximum. Across sports that is also why an easy run library beside hard rides
fails on its share, not on its reading.

**Residual.** A reference of 150 bpm or more whose typical day sits well under it, reached by tempo days (weekly tempo with easy
days between), reads as trusted, and heart rate cannot tell a tempo 20 minutes (88% of critical power) from an all-out one
within the spread of athletes. Only an age and sex band breaks that (Stage D6, RCA-005). No-heart-rate libraries are `unknown`.

## Where it applies, and what each shows when it fails

- **Threshold** (`combine`): the fit is null with refusal `effort`; the uneven fit goes with it; `effortGate[sport].floor` is the best
  20 minutes in the fit's unit. Panel and tile show the floor as "At least", no spread, and the line "Your best 20 min was not
  shown to be a hard effort: it reached 82% of your running reference heart rate. A hard 20 min effort would give a threshold."
  (or the reference is too low, with its bpm, or sits where a typical day does). The share card and anything that needs both
  fits waits for them.
- **Chip**: "Not a hard effort · N%", or "Effort not confirmed" with no share when the reference cannot certify. `result.effort`
  now has an entry for every curve duration, so a one-sport library has its chip (it had none).
- **Zones from threshold** (`thresholdTimeline`, `HeartRateJudgement.fit`): a window whose best 20 minutes (the entry with the
  highest 20 min value) was not hard has no fit; the activity page reads the older fit within 12 months, or none.
- **Race predictions**: a run's bests are carried to a race only if the run reached a hard heart rate (its peak, `maxHeartRate`);
  runs without heart rate count. The heart-rate VO2max is dropped when the reference is not trusted. Nothing left: "Needs a hard
  run".
- **Balance headline**: held when a sport's gate says `notHard`, naming the sport. A hold, not a rule change: `leanOfLead` stays.
- **Late in long sessions** (RCA-043): a late best counts only sessions that reached a hard heart rate (peak against the
  reference; no heart rate counts); under 3 such sessions the headline is hidden. The section's note gives the ruler: how near the
  reference the sessions peaked. Each steady effort of the drift carries its average share of the reference, and the note gives
  its range. Drift is not filtered: it is defined on submaximal steady efforts.

## The fit spread

`cpSpread = hypot(cpSe, MODEL_ERROR_FRACTION x cp)` with `MODEL_ERROR_FRACTION = 0.05`. The regression error shrinks as efforts are
added but assumes they all lie on one curve; the model error does not shrink. The "fit spread" the page draws is this.

## The duration a threshold is held for

The fit rests on efforts of 3 to 20 minutes. "About an hour" is not what that supports; the tile says "about 30 min"
(`THRESHOLD_HOLD_S`). On noise-free curves that fall with duration the fitted value sat at about the value of a 40 minute effort
(0.98 to 1.05 times it, in the audit's simulations), so half an hour, between the longest effort the fit uses and that, is a
stated convention in the constant, not a measurement. It is not tied to a source that says 30 minutes.

## Calibration (synthetic harness, `effort/gate.sim.test.ts`)

40 synthetic athletes per kind (critical power 13 to 20 W/kg, work capacity 900 to 1600 J/kg, maximum heart rate 165 to 200,
heart rate at critical power 88% to 95% of it), twelve weeks of 3 to 4 sessions a week, sessions varied by the day's form (easy
+-12%, tempo +-5%, intervals +-2%, a test 94% to 100% of all-out). Run through the whole analysis.

| Library                                              | Gate (hard / notHard) | Reference readings  | Typical day / maximum (5th to 95th) | Fit error against truth (10th, 50th, 90th) |
| ---------------------------------------------------- | --------------------- | ------------------- | ----------------------------------- | ------------------------------------------ |
| easy only                                            | 0 / 40                | low 40              | 0.93 to 0.96                        | (withheld)                                 |
| tempo only                                           | 0 / 40                | habitual 26, low 14 | 0.97 to 0.99                        | (withheld)                                 |
| weekly tempo, easy days                              | 25 / 15               | trusted 25, low 15  | 0.85 to 0.89                        | (fit refused by shape)                     |
| tempo and intervals weekly                           | 37 / 3                | trusted 40          | 0.85 to 0.88                        | -14.2%, -13.0%, -12.5% (the residual)      |
| hard (intervals weekly, a monthly test)              | 40 / 0                | trusted 40          | 0.79 to 0.85                        | -5.3%, -3.2%, -2.2%                        |
| hard but sparse (intervals every 2nd week, one test) | 40 / 0                | trusted 40          | 0.75 to 0.81                        | -7.4%, -4.9%, -2.8%                        |
| single test day                                      | 38 / 2                | trusted 40          | (under 12 days)                     | -6.8%, -4.7%, -3.4%                        |
| easy plus a race every 4th week                      | 33 / 7                | trusted 33, low 7   | 0.72 to 0.97                        | (3 or 4 races needed to set a reference)   |

Rides (20 athletes): easy 20 notHard, tempo 20 notHard, hard 20 hard, single test day 19 hard.

`HABITUAL_PEAK_RATIO = 0.90` sits between the hard libraries (up to 0.85) and the easy and tempo-only ones (from 0.93).
`MODEL_ERROR_FRACTION`: over the 118 hard, sparse and test-day fits the gate lets through, the spread holds the truth
0% of the time with the regression error alone, 50% at a floor of 4%, 58% at 4.5%, 70% at 5%, 85% at 6%. 5% is the least floor in half
percents that holds it in two of three; it matches the 5.2% standard error of estimate field fits show against a laboratory
threshold (Karsten et al. 2015). The fits sit 2% to 7% under the truth because the efforts are not quite all-out.

## What this does not do

- It cannot tell a tempo 20 minutes from an all-out one by heart rate alone (above).
- It does not judge a library without heart rate: `unknown`, nothing withheld. A runner's easy-only library without a watch still
  gets an easy-pace threshold. A pace-based test would need its own calibration.
- Digests are unchanged (no MODEL_REVISION): every input is a field a digest already holds.
