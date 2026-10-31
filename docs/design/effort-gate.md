# The effort gate: a best is a capability only when it was a hard effort

Status: built (`packages/core/src/effort/`), applied to thresholds, zones from threshold, race predictions, the Balance
headline and the late-in-sessions views. Calibrated on the synthetic harness; no real figures are in this note.

## What it says

A best effort is a lower bound on what an athlete can do. It becomes a capability (a threshold, a zone, a race time, a level
to set against the other sport) only when it was a hard effort, and heart rate is the evidence the app has. The gate asks one
question per sport and period: **was the best 20 minutes a hard effort?** The best 20 minutes is the effort every fit has to
reach (`CP_FIT_REACH_TOLERANCE`), the one the Balance headline grades, and the one the chip has always named. Of the 20 minute
efforts within 5% of the best (a headwind or a hill moves a best by that), the one held at the highest heart rate is judged, in
the gate, the chip, the previous-period check and the threshold timeline alike.

Verdicts: `hard`, `notHard`, and `unknown`. `unknown` carries why: **no heart rate** on the best 20 minutes, **too few days** with a
heart rate to set a reference (`thin`), or no 20 minute best. An unknown verdict withholds nothing, and every screen says
"Effort not checked" with the reason and what would let it be checked: a note sits beside the Balance headline, which is shown (a rider with a power
meter and no strap would otherwise never have one). Only a best that was not shown hard holds the headline. The line is the existing one: 90% of the reference heart rate, judged on the percent shown (`isHardShare`).

A failed gate withholds the estimate and shows the demonstrated best in its place: the best 30 minutes where the curve has one
(what a threshold is said to be held for), else the best 20, named "Best 30 min pace" and drawn as a recorded best, not as
"Threshold, at least". What it asks for depends on why it failed (`EffortGate.neededS`):

- the reference can be trusted and the best was under the line: the words say what is true, that it reached (say) 82% of the reference, under the 90% that marks a hard
  effort, and that a 20 min effort at 90% or more would give the threshold. They do not promise such an effort is possible: an athlete whose heart rate at an
  all-out 20 minutes is under 90% of their true maximum (the beginners below) cannot be settled by effort;
- the reference cannot be trusted (`low`, `habitual`, `high`): a harder effort is not what is missing, the reference is. The
  copy says what is true, **set your max heart rate in Profile, or reach hard heart rates on several days**, and for `high`, if
  it is right, enter it. `neededS` is null.

## The reference cannot certify itself

The reference is the athlete's own highest sustained heart rate, so on its own it can only compare a best with the athlete's top.
`readReferences` (`effort/reference.ts`) reads it, per sport, in this order:

| Case                                                                                                                                                                                                                    | Reference                                  | Reading                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------- |
| A maximum entered in Profile (dated, per sport; cycling's is running's less 6 bpm if only that is given)                                                                                                                | the entered value                          | `trusted`, source `entered`; no check applies                         |
| Under 12 days with a heart rate, age known                                                                                                                                                                              | the age-predicted maximum, 208 - 0.7 x age | `trusted`, source `age`                                               |
| Under 12 days with a heart rate, age unknown                                                                                                                                                                            | the activities'                            | `thin`: nothing is judged, the screens say the effort was not checked |
| The sport's own maximum under the floor                                                                                                                                                                                 | the activities'                            | `low`                                                                 |
| A maximum more than 25 bpm over the age-predicted one                                                                                                                                                                   | the activities'                            | `high`: not trusted until the athlete enters a maximum                |
| The median day's peak is 90% or more of the maximum over 12 or more days, unless the age puts the reference within 10 bpm of the predicted maximum, and not for a ride whose judged best is a power meter's measurement | the activities'                            | `habitual`                                                            |
| Otherwise                                                                                                                                                                                                               | the activities'                            | `trusted`                                                             |

The floor tests the sport that supplied the reference (cycling's may be running's), not the derived value. **Floor:** with the year of
birth, max(130, 208 - 0.7 x age - 30) bpm, three of the roughly 10 bpm spread between people under the predicted maximum; without it, 150.
**Bands:** predicted maximum 208 - 0.7 x age (Tanaka, Monahan and Seals 2001, J Am Coll Cardiol 37:153, a meta-analysis of 18,712 people), or for a woman 206 - 0.88 x age (Gulati et al. 2010, Circulation 122:130, 5,437 asymptomatic women); with the sex not given, Tanaka's. At 60 that is 166 for Tanaka and 153 for Gulati, so the floor, the low and high bands, the age-predicted reference of a new library and the habitual slack all follow the sex when it is known.
Low is 30 bpm under the predicted maximum, high 25 over it. A ride is not held for `habitual` alone when the 20 minute effort that was judged is itself a power
meter's measurement (not an estimate from speed and grade): the typical-day check asks whether the athlete ever goes hard, and the fit's own
refusals (a flat curve, a work capacity under the floor) answer that for a measured ride. It is no test of hardness, so `low` and `high` still hold. An entered
maximum is used as it is for each sport (cycling's is running's less 6 bpm only where no cycling maximum was entered). The year of birth and the entered maxima are part of the cache key (`sameAnalysisSettings`), so entering one
re-reads everything.

**Residual.** Tempo days that set a reference of 150 bpm or more, with easy days between, read as trusted. Heart rate cannot tell a
tempo 20 minutes (88% of critical power) from an all-out one within the spread of athletes. Without the age, intervals twice a week
(a hard-heavy week) also read `habitual`, indistinguishable from a tempo-only runner's every day; the entered maximum is the
way out, and the message says so. The rest of RCA-005 is on the zone tables (D6c): a reference read `low` (under what a maximum is at the athlete's age) or `habitual` (the typical day already sits at it) means no effort reached near the maximum, so no heart-rate zones are cut from it and the page says what would give them (`ZoneEstimates.untrustedMax`); a reference read `high` keeps its zones and is asked about up front, in a note above the table with the Set control, not in small print. A maximum the athlete entered always wins. With no heart-rate zones the heart-rate easy and hard shares are not stated either.

## Where it applies, and what each shows when it fails

- **Threshold** (`combine`): the fit is null with refusal `effort`; the uneven fit goes with it. Panel and tile name the figure
  "Best 30 min pace" (a recorded best), give no spread, and say why in one line (see above). The share card and anything that needs both
  fits waits for them. An unchecked threshold is shown with "Effort not checked: no heart rate on your best 20 min run."
- **Chip**: "Hard effort · N%" with what the share shows and no more (95% and over: "close to your highest heart rate"; 90 to 94%:
  "within 10% of your highest heart rate. Heart rate cannot tell a hard 20 min from an all-out one"), "Not a hard effort · N%",
  "Effort not confirmed" with no share for an untrusted reference, "Effort not checked". The reference is named by its source
  (the activities, the maximum entered, the age). `result.effort` has an entry for every curve duration, so a one-sport library
  has its chip. The ride on foot card says the ride behind its pace was not hard or not checked, and nothing of one that was.
- **Zones from threshold** (`thresholdTimeline`, `HeartRateJudgement.fit`): a window whose judged 20 minutes was not hard has no fit. The
  activity page then reads an older fit within 12 months, else shows heart-rate zones only: for an athlete who is persistently
  not hard the pace and power zones are absent, which is the honest state.
- **Race predictions**: a run's bests are carried to a race when it reached a hard heart rate (its peak at the hard line, and held there
  for two minutes where the digest has its seconds by heart rate, so a lone 30 s spike does not count; digests from before the
  distributions were kept are judged by the peak alone), or, for a best at a half marathon or longer, when its average
  heart rate was 80% of the reference or more, since a long effort's average sits well under its peak. Runs without a heart rate count, and
  so does every run where the gate could not judge. The heart-rate VO2max uses the same reference and reading. Nothing left: "Needs a
  hard run of a mile or more", or the reference action.
- **Balance headline**: held, by one place (`holdOf`, `ui/resultHold.ts`): a sport whose best 20 minutes was not hard, with
  the sport named and what lifts it, per sport. A sport that was only not checked is not held: the headline is shown with the note. A hold, not a rule change: `leanOfLead` stays. A level read from a best that was not shown
  hard is not asserted: "Your best 20 min run grades Local", and the level rows say "best 20 min, not a hard effort". The precedence is
  'implausible-ride' (a seam for D6a) over 'effort'; 'updating' and 'partial-import' will go above both.
- **Change test** (`digest/hardEffortRule.ts`, D5): a point of the test's readings counts when heart rate shows it hard (up to 20 min by the
  session's peak, beyond it by the session's average, a sprint of a minute or less always), so a swing in how many hard efforts a period
  holds is not read as a change. Both periods are read alike: the call is made from the hard readings when both hold enough, else from every
  effort in both, and the strip then says the effort was not checked. The curves' bests are not filtered. The strip withholds a comparison
  whose shown best was not hard, and compares one that was only not checked (no heart rate, too few days).
- **Late in long sessions** (RCA-043): a late best counts only sessions that reached a hard heart rate (a session with no heart rate counts); under
  3 such sessions the headline is hidden, and with a reference that cannot be trusted the need is the reference. The note gives the ruler.
  Each steady effort of the drift carries its average share of the reference, and the note gives its range. Drift is not filtered: it
  is defined on submaximal steady efforts.

## The fit spread

One-sided (`cpBand`): down by the regression error, up by an allowance that falls with the share of the reference the judged effort
reached, `0.044 + 0.386 x (1 - share)` of the threshold (a share of 0.9 allows 8.3%, an unchecked effort is read as 0.9). A best that
was not quite all-out puts the fit under the truth, so the truth lies above it. Both ends are in gross metabolic W/kg, the fit's unit.

Fitted to the 1,085 gate-passing fits of 11 arms: the truth's distance above the fit regressed on 1 - share gives 0.037 + 0.386 x (1 -
share), and the 67th percentile of what is left, 0.0074, is added. The band held the truth in 67% of those fits, **in-sample**: the
allowance was fitted to the same fits, so this is the fit's own coverage over 100 athletes an arm and no interval or out-of-sample claim is made for it (with the
regression error alone and no allowance it is 58%). Where the gate could not judge, the band takes the allowance of an effort at the hard line. **That is synthetic coverage**: the harness's efforts are not quite
all-out by construction (a test at 94% to 100% of critical power), and a real athlete's miss may be larger or smaller; field fits
against a laboratory threshold show a standard error of estimate of 5.2% (Karsten et al. 2015), the same size as the allowance at the
hard line. Leave-one-out on the 9 curves of the public corpus (`cp.corpus.test.ts`): the jackknife error of the threshold is 0.7 to 1.4 times
the regression error (median 1.2), so the curve is described about as well as the regression says; it measures curve misfit, not whether
the efforts were maximal, and these are single sessions.

## The duration a threshold is held for

The fit rests on efforts of 3 to 20 minutes, and "about an hour" is not what that supports; the tile says "about 30 min"
(`THRESHOLD_HOLD_S`). Poole et al. 2016 (Med Sci Sports Exerc 48:2320, PMC5070974) report riders completing 24 minutes at critical power
without difficulty, and exercise just above it sustained for "perhaps 30 minutes"; on noise-free curves that fall with duration the fit sat
at about the value of a 40 minute effort (0.98 to 1.05 times it, in the audit's simulations). Half an hour, between those, is a convention
stated in the constant. A published 20 to 40 minute range for time to exhaustion at critical power could not be verified and is not cited.

## Calibration (synthetic harness, `effort/gate.sim.test.ts`)

100 synthetic athletes an arm (critical power 13 to 20 W/kg, work capacity 900 to 1600 J/kg, maximum heart rate 165 to 200,
heart rate at critical power 88% to 95% of it unless the arm says), 12 weeks of 3 to 4 sessions a week unless it says, each session varied by
the day's form (easy +-12%, tempo +-5%, intervals +-2%, a test 94% to 100% of all-out). Counts out of 100 let through as `hard`; the Wilson
95% bound is in brackets. Arms ending "age" give the year of birth (the athlete's maximum plus the age rule's spread of 10 bpm), and none is
given for ages under 15 or over 85.

| Arm                                                            | hard                                      | readings (of 100)                |
| -------------------------------------------------------------- | ----------------------------------------- | -------------------------------- |
| easy only                                                      | 0 (0 to 0.04)                             | low 95, habitual 5               |
| tempo only                                                     | 0 (0 to 0.04)                             | habitual 76, low 24              |
| tempo only, age known                                          | 7 (0.03 to 0.14)                          | habitual 68, low 25, trusted 7   |
| realistic easy (70% to 80% of maximum, strides)                | 2 (0.01 to 0.07)                          | habitual 58, low 40              |
| realistic easy, age known                                      | 4 (0.02 to 0.10)                          | habitual 55, low 41              |
| realistic easy with a day-to-day heart-rate offset (sd 6 bpm)  | 14 (0.09 to 0.22)                         | habitual 55, low 31, trusted 14  |
| easy 5 weeks (12 to 29 days)                                   | 0                                         | low 95, habitual 5               |
| easy riding                                                    | 5 (0.02 to 0.11)                          | low 95                           |
| easy running and easy riding                                   | 0                                         | low 95, habitual 5               |
| easy running, hard riding (run judged)                         | 0                                         | trusted 100 (the ride's maximum) |
| easy, true maximum entered                                     | 0                                         | trusted 100                      |
| hard (intervals weekly, a monthly test)                        | 99 (0.95 to 1.00)                         | trusted 100                      |
| hard but sparse                                                | 100 (0.96 to 1.00)                        | trusted 100                      |
| hard, 5 weeks                                                  | 100                                       | trusted 100                      |
| hard with a day offset                                         | 98 (0.93 to 0.99)                         | trusted 100                      |
| hard riding / sparse riding                                    | 99 / 100                                  | trusted 100                      |
| hard running and riding                                        | 99                                        | trusted 100                      |
| hard-heavy, true maximum entered                               | 99                                        | trusted 100                      |
| hard, maximum entered 5% under                                 | 100                                       | trusted 100                      |
| hard-heavy (intervals twice a week), no age                    | 1 (0 to 0.05)                             | habitual 99                      |
| hard-heavy, age known                                          | 77 (0.68 to 0.84)                         | trusted 78, habitual 22          |
| tempo and intervals weekly                                     | 96 (0.90 to 0.98), fit 13% under          | trusted 100                      |
| weekly tempo, easy days (fit refused for shape)                | 71                                        | trusted 71, low 29               |
| one test day, no age                                           | unknown 100                               | thin 100                         |
| two weeks of hard training, no age                             | unknown 100                               | thin 100                         |
| one test day, age known                                        | 69 (0.59 to 0.77), unknown 11, notHard 20 | trusted 89, thin 11              |
| maximum 140 to 165, no age                                     | 54 (0.44 to 0.63)                         | low 46                           |
| maximum 140 to 165, age known                                  | 72 (0.63 to 0.80)                         | low 28                           |
| beginners (heart rate at critical power 80% to 88% of maximum) | 19 (0.13 to 0.28)                         | trusted 94, low 6                |
| easy plus a race every fourth week                             | 83 (0.74 to 0.89)                         | low 17                           |

The 17 athletes of the race arm that are held are not those with the lower maxima (held mean 183 bpm, passed 181, held from 168 up) and their
race heart rate is not set aside: three races rarely agree to within 3 bpm, so the reference rule (`referenceMax.ts`, C1) finds the first three days
that do among the easy ones and reads the easy level. That is a limit of the reference, reported rather than changed here.

What the numbers say: easy and tempo-only libraries are held, and the share let through is at most 14% in every arm built to be held (0 to 7% in all but
the day-offset arm); hard training is let through at 96% or more in every arm except hard-heavy training (77 with the age, 1 without it), a
single test day, athletes with a maximum under 150 bpm, beginners (in this model their heart rate at an all-out 20 minutes is 80% to 88% of their true maximum, under the line, so no entered maximum or harder effort changes the verdict: a limit of the 90% line, not of the reference), and the race arm. Those
are the costs, and they are listed: such athletes are held or unchecked until they enter a maximum (which does not help beginners).
Weekly tempo with easy days between passes 71 of 100 and, with the age known, is judged against the predicted maximum; its fit is refused for shape, but
its race predictions and the headline are not held.

## What this does not do

- It cannot tell a tempo 20 minutes from an all-out one by heart rate alone, and does not see through tempo and intervals every week.
- A library without a heart rate on its best 20 minutes is `unknown`: nothing is withheld and the screens say it was not checked. A hardness
  test from the curve's shape (a W' near what the same efforts at 88% of critical power would give) was considered and not built: it needs a
  calibration against real tests, not the harness, whose curve is the model's own.
- Digests are unchanged (no MODEL_REVISION): every input is a field a digest already holds. Digests without `distributions` are judged for a hard
  session by the peak alone.
