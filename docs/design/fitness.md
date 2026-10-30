# Fitness at the same effort: slipping, holding, recovering, back

Status: core built (`packages/core/src/fitness/`), exposed on `SessionState.fitness`, and drawn on Balance and the Run and Ride
pages (see DESIGN.md, "Fitness at the same heart rate"). Written from a research study whose method, tables and tuning are
summarised here; the episode, season and ride work of Stage D (D2) is in "Stage D" below.

## What it says

For each sport, one of: **slipping**, **holding** (level with the weeks before), **holding below** the
old level, **recovering**, **back** (or **back and faster**, when the whole range is above the old level),
**improving** (a clear rise with no slip before it; a status line only), or **not enough evidence yet** with
the counts that are missing. Each carries the output at the library's reference heart rate now and before,
the change with a 90% range, the day the change began, and the runs behind it (ids for the recent runs,
spans and counts for the earlier ones). A run's change is said in pace terms, as the page shows paces: 5:00
to 5:30 /km is 10% slower though speed fell 9.1%. Mixed libraries get two
independent statuses and no combined score.

What it promises, and says so: a change of about 5% or more, seen within a few weeks to a few months.
An abrupt loss of 8% is seen in about 4 weeks (7 at one steady run a week). A loss of 5% takes about 9
weeks at 3 steady runs a week (6 before the Stage D levers, which trade some of it for fewer false states) and may take months
at one. A slide shows once it reaches 4 to 5%. A loss
of 3% is below an athlete's own run-to-run spread (about 4%), and is not claimed.

## Unit of evidence

One value per steady run: the log of speed at the reference heart rate. Kilometres 2 to 10, whole
kilometres, within 20 bpm of the reference, at most 25 m of climb and 15% grade credit. A run counts when
the median change of pace between kilometres is at most 5% (from three changes) and two kilometres pass.
The value of a kilometre is `ln(1000/seconds) - kappa * credit - beta * (hr - ref)`; a run's value is the
median over its kilometres. `kappa` and `beta` (speed per bpm) are fitted per library within 28-day blocks and
clamped. `kappa` is an empirical nuisance coefficient on the grade credit, not a measure of how much of the credit
is physiologically real (see "kappa" below): minus kappa is what `FitnessMethod.gradePassThrough` carries. The reference heart rate is the
median of the library's steady flat kilometres over its newest 52 weeks, to the nearest 5 bpm.

The **strict unit** (flat, steady heart rate and pace from the kilometre before, 3 kilometres, the model's
whole credit) is read when the fit is unstable: fewer than 300 kilometres to fit, a kappa more than 0.5
outside [-1, 0], or a kappa known no better than +-0.25. With under 1% spread in the credit the whole credit
is used. Rides use measured power from `hrBlocks` only and are on (`RIDE_FITNESS_ENABLED`, gated by
`ride.sim.test.ts`; see "Rides").

## Monitor

Evaluated at the end of each week from the first with a reference (12 runs over 8 weeks, 8 to 44 weeks ago).
A slip is a window contrast at scales (4, 32), (8, 32), (16, 48), (26, 78) weeks with z <= -3.3 and a loss of
at least 4%, the recent window holding runs from two weeks, on two weekly evaluations running of which the second
is a qualifying week of its own (see "Stage D"); the onset is the best split of the last 40 weeks; the reference is then
frozen for the episode. The episode moves between slipping, holding below (24-week trend flat within 5%),
recovering (the contrast against the episode's own low and the 26-week trend both firing, or the rise from the 20-week
trough on its own at z of 6.5, two weeks running) and back (a 12-week level within 1% of the reference with a lower bound above -2%, three weeks
running), which closes after 12 weeks. An episode also closes as holding when the drop is no longer clear: the level of
the runs since the onset (at most 26 weeks) reaches the reference within its 90% range for 12 weeks running (26 in
recovering, so a return gets to "back" first). A new state is shown after it has held two weekly evaluations, unless
it begins when the athlete was calm. All numbers are in one table, `fitness/params.ts`. The state machine
matched the research prototype on a one-off check of 25,200 simulated weeks (no differences) before the Stage D changes;
that check is not kept as a test.

Improving mirrors the slip test with no episode: at the same scales a contrast of z of 3.3 and a gain of 4%
on two weeks running, with the range of the change clear of zero. It freezes no reference; once the earlier
36 weeks catch up with the new level the status reads holding. It is withheld while the weeks 8 to 44 ago hold any
of an episode that has closed (or one still open): an athlete back at their old level would otherwise read as
faster than their own dip. A fuller state, with a reference and a
holding at the new level, is not built.

## Findings

`findings/detectors/fitnessStatus.ts` speaks only for a slipping, recovering or back that began to be shown in
the last 6 weeks, so the ledger shows each once; holding and not enough evidence are status lines. Its
headline carries sizes and dates but no pace or power, because a finding outlives the unit setting, and a finding is
made only when the whole range of its change is on one side of level (a status line whose range reaches both sides
says level, within a distance). The
engine's surprise is the monitor's own z against the usual spread of a z-score, 1
(`FITNESS.finding.quietSpread`), since the monitor has already held the change to a false-alarm budget of
about a quarter of an alarm per athlete-year. A back is judged by its own statistic: how far the 12-week level
stands above the lower tolerance, in standard errors, which is at least 1.28 whenever a back is shown, so every
shown back, including one after a shallow dip, can be spoken.

## Decisions

1. Library-wide, not per period; replayed from the first steady run to the newest activity and remembered
   for the same digests (`memoByDigests`), so a period switch costs nothing. 2,000 activities: about 85 ms the
   first time, 0.2 ms again; the findings engine's replay of 210 weekly marks (a new set of digests each) takes
   about 2 s, 9 ms a mark.
2. The fit and the reference heart rate are read on the whole history to the date, so a past week's reading
   can move a little as the library grows.
3. Today is the wall clock, not the newest activity: the session passes it cut to the day (so the memory still
   hits; the sample athlete keeps the sample season's own day), and a break of four weeks or more, or fewer than
   four steady runs in eight weeks, makes the status line "not enough recent evidence" without changing the
   monitor's state. The monitor is evaluated at completed week ends only, so a week still going joins at its end.
4. Known gaps, measured (Stage D, five years, three steady runs a week; the table below has the rest): a season of 3% gives
   0.40 alarms an athlete-year against 0.83 before (budget 0.25 on the quiet athlete); every nuisance at once 0.39 against
   0.64; a slow wander of 3% 0.32 against 0.46. A watch or strap change of 3 to 5% still reads as a real slip, since the data
   cannot tell them apart, but it now closes as holding at the new level instead of staying open (0.23 alarms, 22% of
   libraries ending not holding, against 45%). The first two years of a library have no season and no learned floor.
5. "Recovering" is a headline claim, so it is held to a stricter bar than a slip. Before tuning, about 1 in 9
   persistent-loss libraries was called recovering within a year and 1 in 3 within 2.5 years (on harness libraries,
   with a wider wander, 1 in 5 and 1 in 2). The contrast and the trend now have to agree, and the trough rule, which
   compares with the lowest of many levels and so reads wander as a rise, stands alone only at z of 6.5. Now: 3%
   within a year and 8% within 2.5 years at run level (6% and 15% on harness libraries); "back" about 1%. The cost is
   a slower confirmation: after an abrupt return of 8%, a median of 7 weeks to "recovering" (about 6 before), and
   94% within a year (87% on harness libraries); a return spread over half a year takes a median of 24 weeks.
   The other levers tried (higher z everywhere, a larger or growing model-error floor, longer confirmation, longer
   windows) either cut true recoveries as fast as false ones or did little; see the table in the PR.

## For the page

`FitnessStatus.series` is the level at four-week steps for the evidence chart (`fitness/series.ts`): back from the end of the last
week, each step is the shortest of the 4 to 16 week stretches that holds 6 steady runs, as `{ atMs, value, low, high, runs, weeks }` with
the printed 90% range, at most 20 points over the last 76 weeks, and a step with too few runs left out. The last point is the
status's own level, so the chart and the sentence give one figure. The line it is read against is `before` and the month the change
began is `onsetMs`. The runs behind the level now are `evidence.recent.ids`.

The sample athlete carries one planted effect, a slip in easy running (`EASY_SLIP` in `synthetic/sampleSeason.ts`): the
cost of easy running rises by 11% in a straight line over 4 weeks, starting 9 weeks before the season's end, with a seeded
wobble of up to 1.2% from week to week on every easy run so the line is not noise-free. The detector finds it; nothing in
the season says what the status is, and a test checks that the planted change lies within the reported range.

A step of the series is dated by the last day it includes (a Sunday) and says how many weeks it is read over (4 to 16), so the
page can say "the 8 weeks to 25 Oct" and not "four weeks".

## Open modelling item: a run-economy slip moves the ride's credit

A slip in how much it costs to run at a heart rate is read by the heart-rate cross-check (`hr/crossCheck.ts`), which compares
the heart-rate slope of riding with that of running (`kappa`). The slope of running falls when easy runs sit at a lower pace for
the same heart rate, so `kappa` rises, and with it the metabolic credit a ride is given on Balance's grades. On the sample, the
planted slip moves the ride's grade from 56% to 59% and the lean from 11 to 8 points; a deeper or longer dip moves it more (a
dip and recovery of 16% took the lean to even). The status and the cross-check are both right about what they read; they read it
differently, and the two are not reconciled. The model is not changed here. It is open: whether the cross-check should read runs
that the fitness status has found to be out of line with the library's earlier level.

## Stage D: episodes that close, a season, a floor that learns, and rides (D2)

The monitor above kept its false-alarm promise only for the athlete it was tuned on (RCA-008): with a 3-5% seasonal swing,
a slow wander or a strap change it declared 0.4 to 0.8 false slips a year, and because an open episode could only leave
through "back", a false slip stayed on screen for a year or more. Six changes, all in `fitness/`, none touching a digest:

1. **An episode closes when the drop is no longer clear** (`episode.ts`, `quietNow`). The level is the runs since the
   onset (at most 26 weeks, 12 runs over 8 weeks), its range against the frozen reference is the printed one (90%) with a
   1.5% model-error floor; a week whose range reaches no change is quiet; 12 quiet weeks running (26 in recovering, so a
   return gets to "back" first) close the episode as holding, and the reference is read afresh. Only runs after the onset
   count. It can hide a slow real decline as "holding at a new level"; the look-back (D9) is the mitigation.
2. **A second qualifying week** (`machine.ts`, `nextStreak`): the second of the two weekly evaluations counts only if that
   week's own steady runs read at least 2% below the baseline judged; a week without a run neither counts nor breaks the
   run; and the recent window must hold runs from two distinct weeks.
3. **A non-seasonal check** for libraries without a fitted season (`windows.ts`, `lowLastYear`): a slip is set aside when the
   same scale, one year earlier, read at least 2% low (it came at this time last year too), when that year holds the runs.
4. **The athlete's own season** (`season.ts`): once two whole years of steady runs exist, one annual sine and cosine is fitted
   on the last whole years (at most four), clipped, shrunk by how far it stands above the wander (weekly levels, lag-1
   correlation) and taken out of every run before any test reads it. An episode keeps the swing it was declared with. The
   status says so: `FitnessMethod.seasonal`, and "Your usual seasonal swing of about 2% has been taken out" in the evidence.
   Plain and wander libraries get no term about 70% of the time (90% under 1.2%); a planted 3% season comes back at 2.6 to
   2.9%; a step part-way through leaks at most `2 * size / (pi * years)` into it. No temperature (D12).
5. **A floor that learns the wander** (`windows.ts`, `floorAt`; not in the plan, added for the nuisances no season explains):
   the 1% model-error floor grows with the library's own wander, read from 6-week block levels over 108 weeks (robust
   spread less sampling noise, past the reference athlete's 2%), to at most 3%. It needs two years of history.
6. **Rides are compared.** `RIDE_FITNESS_ENABLED` is true. The ride unit is unchanged; it runs the same monitor.

### What it did, on the repo's generator (`fitness/test/runSim.ts`, `episode.sim.test.ts`)

Five years, three steady runs a week, 100 libraries; nothing changes in the athlete. Before is main at 40b3a4be (the
`LEGACY` parameters, `test/legacyParams.ts`).

| nuisance                  | alarms an athlete-year, before -> now | libraries ending not holding | weeks not holding |
| ------------------------- | ------------------------------------- | ---------------------------- | ----------------- |
| quiet (2% wander)         | 0.22 -> 0.16                          | 26% -> 15%                   | 22% -> 12%        |
| season 1.5%               | 0.43 -> 0.24                          | 53% -> 24%                   | 39% -> 20%        |
| season 3%                 | 0.83 -> 0.40                          | 90% -> 22%                   | 72% -> 35%        |
| slow wander 3% (rho 0.95) | 0.46 -> 0.32                          | 61% -> 36%                   | 44% -> 29%        |
| watch or strap step 3%    | 0.32 -> 0.23                          | 45% -> 22%                   | 31% -> 19%        |
| all at once               | 0.64 -> 0.39                          | 82% -> 37%                   | 61% -> 35%        |

A loss planted at week 170 (so the season and the floor are live), observed 70 weeks on, 300 libraries:

| planted                              | weeks to the declared slip: median / within 12 / never seen | still open at the end           | other                                                |
| ------------------------------------ | ----------------------------------------------------------- | ------------------------------- | ---------------------------------------------------- |
| 8% drop that stays, 3 runs a week    | 4 / 94% / 2% -> 4 / 92% / 2%                                | 100% -> 99%                     |                                                      |
| 5% drop that stays, 3 runs a week    | 6 / 77% / 5% -> 9 / 60% / 16%                               | 95% -> 80% (of those seen, 95%) |                                                      |
| 8% drop that stays, 1.2 runs a week  | 5 / 90% / 2% -> 7 / 79% / 4%                                | 100% -> 97%                     |                                                      |
| 5% drop that stays, 1.2 runs a week  | 11 / 57% / 9% -> 16 / 40% / 25%                             | 92% -> 70%                      |                                                      |
| 5% drop with a season of 1.5%        | 5 / 93% / 1% -> 8 / 66% / 12%                               | 98% -> 81%                      |                                                      |
| 5% drop with a slow wander of 3%     | 7 / 71% / 7% -> 12 / 51% / 21%                              | 96% -> 76%                      |                                                      |
| 8% drop, 3% regained (stays 5% down) | 4 / 97% / 1% -> 4 / 90% / 2%                                | 97% -> 87%                      | the rest closed as holding                           |
| 8% drop, fully regained              | 4 / 97% / 1% -> 4 / 90% / 3%                                | 35% -> 14%                      | reaches back within a year of the return: 76% -> 82% |

The cost is on the small, sparse losses: a real 8% drop is seen as quickly (the 90th percentile 7 -> 11 weeks), a real 5% drop
about 3 weeks later with 5 to 15 more in 100 never seen within 70 weeks, and at one run a week 5 weeks later. That is what
the levers pay for the fall in the false states, and each is one parameter in `params.ts`. What each lever does alone
(80 libraries for the silence rows, 250 for the planted ones; "5%" is a 5% drop at three runs a week):

| lever alone                | quiet   | season 1.5% | season 3% | wander 3% | strap 3% | all     | 5%: median / within 12 / never | partial regain open | back |
| -------------------------- | ------- | ----------- | --------- | --------- | -------- | ------- | ------------------------------ | ------------------- | ---- |
| none (before)              | .21/25% | .42/50%     | .83/90%   | .47/60%   | .33/48%  | .64/80% | 6 / 76% / 6%                   | 97%                 | 74%  |
| closing                    | .20/15% | .39/45%     | .80/79%   | .46/53%   | .29/34%  | .60/69% | 7 / 74% / 7%                   | 92%                 | 78%  |
| season                     | .20/25% | .35/34%     | .58/38%   | .47/59%   | .32/45%  | .57/73% | 7 / 71% / 7%                   | 96%                 | 78%  |
| learned floor              | .18/21% | .34/31%     | .60/35%   | .34/40%   | .28/40%  | .51/56% | 7 / 72% / 10%                  | 95%                 | 76%  |
| second week and year check | .18/23% | .34/35%     | .59/59%   | .45/57%   | .31/46%  | .57/71% | 7 / 70% / 8%                   | 96%                 | 75%  |
| all                        | .14/14% | .24/23%     | .40/21%   | .30/31%   | .24/24%  | .38/35% | 9 / 59% / 18%                  | 87%                 | 82%  |

(Each silence cell is alarms an athlete-year / share of libraries ending not holding; "back" is the share of a full 8% dip and
return that reaches back within a year of the return.) The second qualifying week alone moves nothing measurable: a burst
of runs in one week is clipped to a few per cent by the window's own spread and cannot fire a window, so the week's own runs
agree with it. It is kept because it is cheap and it is the owner's rule (it does bind on a short low spell, see
`machine.test.ts`).

### kappa (RCA-009)

`kappa` is an empirical nuisance coefficient, not a physiological pass-through. Regressing pace on grade credit within
steady runs mixes the structural pass-through with the heart-rate sensitivity and noise, so errors in the variables and
the runner's habit of easing off on a climb pull it toward zero: with the structural value planted at 1 (heart rate
answering to speed and credit) the fit returns well under half of it (`unit.test.ts`, "returns a fraction of a planted
structural pass-through of 1"). When the heart rate is set first, the forward model it was written for, it returns what is
planted. The fitted value is orthogonal to the route's credit by construction, which is what the unit needs; the
coefficient is not printed to athletes. The unit's numbers are not changed: a structural coefficient needs a heart-rate model
nobody has validated.

### Rides

The ride unit (measured power, five-minute blocks within 20 bpm of the reference, moved to it by the library's own slope)
runs the run monitor. A power meter's blocks have no steadiness test, so a ride is noisier than a run: the research put it at
2.4% to 4.5% a ride. `ride.sim.test.ts` is the gate for the flag, at those spreads and one to three rides a week:

- On the monitor with values drawn at each spread (three years, 60 libraries): quiet, 0.06 to 0.15 alarms an athlete-year
  (budget 0.25), at most 11% of libraries ending in a slip state; with a 3% wander and a 1.5% season 0.23 to 0.53 (under 0.65).
  An 8% loss that stays: median 4 to 9 weeks, 85% to 97% seen within 26 weeks (one ride a week at 4.5%: 85%; two or more: 93% to
  97%). A 5% loss: median 7 to 24 weeks, 52% to 78% within 26, 91% to 98% of those seen still open.
- On rides as digests (`test/rideSim.ts`: five blocks a ride at 125 to 165 bpm, power rising 0.7% a bpm, block noise, the day's
  noise, a 2% wander; two rides a week, 130 weeks, 40 libraries per spread of 2.2%, 3.5% and 4.4%, measured by the monitor's
  own spread): 5% to 15% in a slip state when nothing changed; an 8% loss 25 weeks before the end is slipping or holding below
  with its range clear of zero in 93% to 98%.

Home shows a card for each sport that has a status, run first; the Ride page shows the ride's card alone, in watts at the ride's
reference heart rate; a library with no ride with a power meter shows none. Findings already covered rides. The sample's rides
read "not enough evidence" (33 steady rides known to within 7%, too loosely to call level).

### The owner's labels: the first real back-test

The detector as shipped (before D2) declared four slips on the owner's library. The owner's verdicts, month and verdict only:

| month    | verdict              |
| -------- | -------------------- |
| Jun 2020 | real (weight gain)   |
| Aug 2022 | real                 |
| Mar 2023 | real (a deeper slip) |
| Jul 2025 | unknown (a setback)  |

3 real, 1 unknown, 0 false. A change of watch in Feb 2024 had no declared change lining up with it, and no slip was declared
there. This is four labels from one athlete: it says the detector was not crying wolf on him, not what its false-alarm rate is.
Whether the Stage D changes alter his declarations is for a replay on his own machine to say; its figures stay out of the repo.
