# Fitness at the same effort: slipping, holding, recovering, back

Status: core built (`packages/core/src/fitness/`), exposed on `SessionState.fitness`, and drawn on Balance and the Run and Ride
pages (see DESIGN.md, "Fitness at the same heart rate"). Written from a research study whose method, tables and tuning are
summarised here; the episode, season and ride work of Stage D (D2) is in "Stage D" below.

## What it says

For each sport, one of: **slipping**, **holding** (level with the weeks before), **holding below** the
old level, **recovering**, **back** (or **back and faster**, when the whole range is above the old level),
**improving** (a clear rise, with no slip before it), **improved** (a rise that has settled at the new level; the one a finding is made of), or **not enough evidence yet** with
the counts that are missing. Each carries the output at the library's reference heart rate now and before,
the change with a 90% range, the day the change began, and the runs behind it (ids for the recent runs,
spans and counts for the earlier ones). A run's change is said in pace terms, as the page shows paces: 5:00
to 5:30 /km is 10% slower though speed fell 9.1%. Mixed libraries get two
independent statuses and no combined score.

What it promises, and says so: a change of about 5% or more, seen within a few weeks to a few months.
An abrupt loss of 8% is seen in about 4 weeks (7 at one steady run a week), reliably. A loss of 5% takes about 9
weeks at 3 steady runs a week (6 before the Stage D levers, which trade some of it for fewer false states), is not always
seen, and may take months at one. A slide shows once it reaches 4 to 5%. A loss
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
at least 4%, the recent window holding runs from two weeks, on two weekly evaluations running, each a qualifying week
of its own (see "Stage D"); the onset is the best split of the last 40 weeks; the reference is then
frozen for the episode. The episode moves between slipping, holding below (24-week trend flat within 5%),
recovering (the contrast against the episode's own low and the 26-week trend both firing, or the rise from the 20-week
trough on its own at z of 6.5, two weeks running) and back (a 12-week level within 1% of the reference with a lower bound above -2%, three weeks
running), which closes after 12 weeks. An episode also closes as holding when the drop is no longer clear: the level of
the runs since the onset (at most 26 weeks) reaches the reference within its 90% range for 12 weeks running (26 in
recovering, so a return gets to "back" first). A new state is shown after it has held two weekly evaluations, unless
it begins when the athlete was calm. All numbers are in one table, `fitness/params.ts`. The state machine
matched the research prototype on a one-off check of 25,200 simulated weeks (no differences) before the Stage D changes;
that check is not kept as a test.

A rise is an episode of its own, the mirror of a slip, followed by the same machinery on the negated series (`fitness/rise.ts`).
It is declared on the slip test's bar (z of 3.3, a gain of 4%, the same floor, the same confirming week, two weeks running; with
no fitted season, the same check against the same weeks a year earlier), and the slip test keeps running while it is open: two
weeks of the slip test firing end the rise. While it is rising the state is **improving**. When 12 weeks have passed, the trend
over 24 weeks is flat and the gain clears 3% at its one-sided lower bound (`episode.improvedTol`, the mirror of the tolerance a
return must clear to be back) the state is **improved**, shown for 12 weeks, after which the episode closes and the reference is
read afresh. A rise whose level falls back toward the reference, or that is no longer clear, ends without being told. No rise is
opened for 104 weeks from the onset of one that settled (the weeks before it are still in the baselines of the longer scales and
would declare it again), nor while an episode that has closed lies in the weeks compared with: an athlete back at the old level
is recovering, not improving. `risenAt` is gone; the monitor is the one source, so the card and the finding cannot disagree.

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
3. The date is the newest activity's, not the wall clock, so an export that ended months ago is told as it stood and
   is not a long break (the session passes the clock to neither the status nor the look-back, which read one replay; the card
   reads it for display only: how new a state is, and "Latest activity 9 months ago." once the newest is over six weeks old). A sport whose own newest steady run is
   four weeks or more before that date, or fewer than four steady runs in eight weeks, cannot call a trend ("not enough
   recent evidence") without changing the monitor's state; it then tells its level (`FitnessStatus.level`: from three
   steady runs, over the shortest of 8, 12, 16, 26 or 52 weeks that holds three, dated on a break) and what a trend
   needs. The monitor is evaluated at completed week ends only, so a week still going joins at its end.
4. Known gaps, measured: its budget is 0.2 alarms an athlete-year on quiet libraries (`alarmBudget`; the family of detectors shares 0.5). A seasonal
   swing of 3% amplitude is over that budget, a known gap: its simulation holds it to 0.65 an athlete-year, a strap change
   to 0.5, and the whole registry with season, strap change and spikes together to the same 0.65; a watch or strap change of 3 to 5% reads as a real slip, since the data cannot
   tell them apart.
   Stage D (D2), five years, three steady runs a week; the tables below have the rest: a season of 3% gives 0.44 alarms an
   athlete-year against 0.83 before; every nuisance at once 0.47 against 0.64; a slow wander of 3% 0.38 against 0.46; a strap change
   0.25 against 0.32, and it now closes as holding at the new level instead of staying open. Year 1 of a library behaves as before
   and year 2 is half protected (see "The first two years" below).
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
cost of easy running rises by 14% in a straight line over 4 weeks, starting 9 weeks before the season's end. The sample is
drawn from the generator's `measured` noise model, so each easy run also carries the model's weekly wander (AR(1), 2% a week) and
its own Student t draw (3.8%). A deeper step than the 11% of the noise-free sample is what the detector needs to read the slip
through that noise: on the first 40 seeds it fires on about seven in ten. The sample uses the first of `SAMPLE_SEEDS`, the seeds
whose season also gives the ride's "not enough" state, passes the effort gate in both sports and fills every threshold and
profile; `sampleSeason.sim.test.ts` replays them. The detector finds the slip; nothing in the season says what the status is,
and a test checks that the planted change lies within the reported range.

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
   count. It can hide a slow real decline as "holding at a new level"; the look-back (D9) is the mitigation. After a close
   the status compares the last weeks with the weeks since the onset (and leaves a real dip out of "before"), and is said
   as it stands however wide its range, so a closed "holding below" cannot turn into "not enough evidence yet".
2. **A second qualifying week** (`machine.ts`, `nextStreak`): each of the two weekly evaluations a slip needs counts only if
   that week's own steady runs read at least 2% below the baseline judged; a week without a run neither counts nor breaks
   the run; and the recent window must hold runs from two distinct weeks.
3. **A non-seasonal check** for libraries without a fitted season (`windows.ts`, `lowLastYear`): a slip is set aside when the
   same scale, one year earlier, read at least 2% low (it came at this time last year too), when that year holds the runs.
4. **The athlete's own season** (`season.ts`): once two whole years of steady runs exist, one annual sine and cosine is fitted
   on the last whole years (at most four), clipped, shrunk by how far it stands above the wander (weekly levels, lag-1
   correlation) and taken out of every run before any test reads it. It is refitted every 4 weeks, so a card's level
   can step by a fraction of a per cent on the week of a refit; an episode keeps the swing it was declared with. The card
   says so ("Allowing for your usual seasonal swing, up to 2.1% either side.") and so does the evidence
   (`FitnessMethod.seasonal`). Plain and wander libraries get no term about 70% of the time (90% under 1.2%); a planted 3%
   season comes back at 2.6 to 2.9%; a step part-way through leaks at most `2 * size / (pi * years)` into it, and a clean step is
   gated out altogether (what it leaves in the residuals swamps the swing); with a wander on top, a third of libraries find a term,
   2% at the 90th percentile. It reads no temperature; the warm-day term below (D12, revision 7) does, and the season is then fitted on what is left.
5. **A floor that learns the wander** (`windows.ts`, `floorAt`; not in the plan, added for the nuisances no season explains):
   the 1% model-error floor grows with the library's own wander, read from 6-week block levels over 108 weeks (robust
   spread less sampling noise, past the reference athlete's 2%), to at most 2%. It needs two years of history. The weeks of
   an episode that reached "back" and closed (a dip the athlete really had) are left out of what it reads as wander.
6. **Rides are compared.** `RIDE_FITNESS_ENABLED` is true. The ride unit is unchanged but for leaving indoor rides out; it runs
   the same monitor.

**The first two years.** Year 1 behaves as before the Stage D work, apart from the second qualifying week (which binds
rarely). In year 2 the check against the year before applies and the learned floor starts at about 108 weeks of history,
so year 2 is half protected; the season is fitted from the third year. A library under two years old, which is most
friends' first import, is therefore as exposed to a seasonal swing as the 40b3a4be detector was in its first year.

### What it did, on the repo's generator (`fitness/test/runSim.ts`, `episode.sim.test.ts`)

Five years, three steady runs a week, 100 libraries; nothing changes in the athlete. Before is main at 40b3a4be (the
`LEGACY` parameters, `test/legacyParams.ts`).

| nuisance                  | alarms an athlete-year, before -> now | libraries ending not holding | weeks not holding |
| ------------------------- | ------------------------------------- | ---------------------------- | ----------------- |
| quiet (2% wander)         | 0.22 -> 0.16                          | 26% -> 16%                   | 22% -> 12%        |
| season 1.5%               | 0.43 -> 0.25                          | 53% -> 25%                   | 39% -> 21%        |
| season 3%                 | 0.83 -> 0.44                          | 90% -> 28%                   | 72% -> 38%        |
| slow wander 3% (rho 0.95) | 0.46 -> 0.38                          | 61% -> 46%                   | 44% -> 35%        |
| watch or strap step 3%    | 0.32 -> 0.25                          | 45% -> 27%                   | 31% -> 21%        |
| all at once               | 0.64 -> 0.47                          | 82% -> 54%                   | 61% -> 44%        |

(The wander and the all-at-once rows are the least improved: a real wander of that size is a real change of level to any detector.)
The episodes that closed as holding were followed by a new slip within 26 weeks in 0% to 25% of cases (the slow wander the most).

A loss planted at week 170 (so the season and the floor are live), observed 70 weeks on, 300 libraries:

| planted                              | weeks to the declared slip: median / within 12 / never seen | still open at the end | other                                                |
| ------------------------------------ | ----------------------------------------------------------- | --------------------- | ---------------------------------------------------- |
| 8% drop that stays, 3 runs a week    | 4 / 94% / 2% -> 4 / 93% / 2%                                | 100% -> 100%          |                                                      |
| 5% drop that stays, 3 runs a week    | 6 / 77% / 5% -> 9 / 62% / 13%                               | 95% -> 84%            |                                                      |
| 5% drop that stays, 1.2 runs a week  | 11 / 57% / 9% -> 16 / 42% / 22%                             | 92% -> 73%            |                                                      |
| 8% drop, 3% regained (stays 5% down) | 4 / 97% / 1% -> 4 / 90% / 2%                                | 97% -> 90%            | the rest closed as holding                           |
| 8% drop, fully regained              | 4 / 97% / 1% -> 4 / 90% / 2%                                | 35% -> 23%            | reaches back within a year of the return: 76% -> 81% |

The cost is on the small, sparse losses: a real 8% drop is seen as quickly, a real 5% drop about 3 weeks later with 8 more in
100 never seen within 70 weeks, and at one run a week 5 weeks later. That is what the levers pay for the fall in the false
states, and each is one parameter in `params.ts`. What each lever does alone (80 libraries for the silence rows, 250 for the
planted ones; "5%" is a 5% drop at three runs a week):

| lever alone                | quiet   | season 1.5% | season 3% | wander 3% | strap 3% | all     | 5%: median / within 12 / never | partial regain open | back |
| -------------------------- | ------- | ----------- | --------- | --------- | -------- | ------- | ------------------------------ | ------------------- | ---- |
| none (before)              | .21/25% | .42/50%     | .83/90%   | .47/60%   | .33/48%  | .64/80% | 6 / 76% / 6%                   | 97%                 | 74%  |
| closing                    | .20/15% | .39/45%     | .80/79%   | .46/53%   | .29/34%  | .60/69% | 7 / 74% / 7%                   | 92%                 | 78%  |
| season                     | .20/25% | .35/34%     | .58/38%   | .47/57%   | .33/48%  | .58/71% | 6 / 72% / 7%                   | 96%                 | 77%  |
| learned floor              | .20/24% | .39/44%     | .83/90%   | .44/57%   | .30/45%  | .61/79% | 6 / 75% / 7%                   | 96%                 | 76%  |
| second week and year check | .18/23% | .34/35%     | .59/59%   | .45/57%   | .31/46%  | .57/71% | 7 / 70% / 8%                   | 96%                 | 75%  |
| all                        | .15/15% | .25/24%     | .44/29%   | .36/41%   | .27/30%  | .47/53% | 9 / 62% / 14%                  | 89%                 | 81%  |

(Each silence cell is alarms an athlete-year / share of libraries ending not holding; "back" is the share of a full 8% dip and
return that reaches back within a year of the return.) The second qualifying week alone moves nothing measurable: a burst
of runs in one week is clipped to a few per cent by the window's own spread and cannot fire a window. It is kept because it is
cheap and it is the owner's rule (it does bind on a short low spell, see `machine.test.ts`).

**The floor and real dips.** Read as plain wander, the weeks of a dip the athlete really had make the floor high and hide the
next real loss. An athlete with two real dips and returns (8% down for 20 and 30 weeks) and then a new loss at week 200, 300 libraries:

| floor                                                | 8% loss: median / within 12 / never | 5% loss: median / within 26 / never |
| ---------------------------------------------------- | ----------------------------------- | ----------------------------------- |
| ceiling 3%, dips read as wander (the first D2 build) | 9 / 58% / 34%                       | never / 28% / 65%                   |
| ceiling 2%, dips read as wander                      | 5 / 81% / 7%                        | 67 / 42% / 50%                      |
| ceiling 2%, dips left out (now)                      | 4 / 94% / 2%                        | 6 / 82% / 11%                       |
| no learned floor                                     | 4 / 95% / 1%                        | 6 / 84% / 9%                        |

The ceiling of 2% costs 4 to 8 points more alarms on the wander and all-at-once libraries than 3% did (0.32 -> 0.38 and
0.39 -> 0.47) and buys back detection; this is the "Balanced" setting of the owner's review.

**Improving.** The rise test (`riseAt`, two weeks running) reads the same floor and the same two-week rule. A planted rise at
week 170, 150 libraries, weeks to a "risen" reading (median / within 12 / never): +8% 4 / 99% / 0% before, 4 / 97% / 0% now; +5% 6 /
67% / 5% before, 8 / 61% / 14% now; +5% with a 3% wander 5 / 65% / 9% before, 10 / 53% / 20% now. On a quiet library with a 1.5%
season the weeks that read "risen" fall from 4.8% to 2.7%.

### What it costs

A replay of 1,400 steady runs (five years, eight activities a week) takes about 30 ms with the kilometres already read and
about 140 ms for a first call, against about 40 ms before; the memory makes a repeat free. The findings engine's replay at
210 weekly marks takes about 6.7 s on a loaded 8-core laptop against 5.8 s before: the season fit is the 15% (refitted every
4 weeks), and the learned floor, which reads 18 blocks a week, does not show. The perf test's budget
is 13 s. TODO (D11): cache the block levels of the floor per library before the findings engine is wired to replay every mark
for every sport, since the ride adds a second replay.

### What the card promises

"A change of 8% it sees within weeks, reliably. A change of 5% it usually sees within a few months, and not always. Anything
smaller sits inside the spread from one run to the next, about 4%, and is not reported" (a ride has its own, from the figures below: "A change of 8% it usually sees within three months. A change of 5% it often takes
longer to see, and does not always. Anything smaller sits inside the spread from one ride to the next, 2% to 5%, and is not
reported"). That is the table: an 8% loss is seen in a median of 4 weeks and 93% within 12; a 5% loss in 9 weeks and 62% within 12,
87% within 70 weeks. The "about 4%" is a run's own spread, 3.8% a run.

### kappa (RCA-009)

`kappa` is an empirical nuisance coefficient, not a physiological pass-through. Regressing pace on grade credit within
steady runs mixes the structural pass-through with the heart-rate sensitivity and noise, so errors in the variables and
the runner's habit of easing off on a climb pull it toward zero: with the structural value planted at 1 (heart rate
answering to speed and credit) the fit returns about a third of it (0.34 to 0.38 over five seeds; `unit.test.ts`, "returns a
fraction of a planted structural pass-through of 1"). When the heart rate is set first, the forward model it was written for,
it returns what is planted. The fitted value is orthogonal to the route's credit by construction, which is what the unit
needs, and that is its bound: a change of route with no change of fitness that moves the average credit by 1% to 2% moves the
status by under 0.1% (`routeShift.test.ts`). The coefficient is not printed to athletes. The unit's numbers are not changed: a
structural coefficient needs a heart-rate model nobody has validated.

### Rides

The ride unit (measured power, outdoors, five-minute blocks within 20 bpm of the reference, moved to it by the library's own
slope) runs the run monitor. Indoor rides are left out: a trainer reads differently from the road at the same heart rate, and
the evidence says so. A ride is adjusted for heart rate only (the power meter reads the hill itself) and is not tested for
steadiness, so any pace counts. A power meter's blocks are noisier than a run's kilometres: the research put a ride at 2.4% to
4.5%. `ride.sim.test.ts` is the gate for the flag, at those spreads and one to three rides a week:

- On the monitor with values drawn at each spread (three years, 80 libraries; with the 2% floor ceiling, the dips left out and the
  4-week refit): quiet, 0.06 to 0.16 alarms an athlete-year (budget 0.25), at most 14% of libraries ending in a slip state; with
  a 3% wander and a 1.5% season 0.26 to 0.59 (under 0.65). An 8% loss that stays: median 4 to 8 weeks, 67% to 93% seen within 12
  weeks and 87% to 97% within 26 (one ride a week at 4.5%: 67% and 87%; two or more: 82% to 93% and 93% to 97%). A 5% loss:
  median 6 to 22 weeks, 56% to 84% within 26, 91% to 98% of those seen still open.
- On rides as digests (`test/rideSim.ts`: five blocks a ride at 125 to 165 bpm, power rising 0.7% a bpm, block noise, the day's
  noise, a 2% wander; two rides a week, 130 weeks, 40 libraries per spread of 2.2%, 3.5% and 4.4%, measured by the monitor's
  own spread): 5% to 15% in a slip state when nothing changed; an 8% loss 25 weeks before the end is slipping or holding below
  with its range clear of zero in 93% to 98%.

Home shows a card for each sport that has a status, run first; a ride that cannot call a trend is one line there, its level
("212 W at 140 bpm (205 to 219). From 7 steady rides.") and a full card on the Ride page, in watts at the ride's reference heart
rate. A library with no outdoor ride with a power meter shows none. Findings already covered rides. The sample's rides give a level
and no trend (33 steady rides known to within 7%, too loosely to call level).

### Ride false alarms in the first two years (found at G5, not fixed)

The held-out rider (configuration F, three years, 8 libraries) showed about 0.5 false slips an athlete-year in its first two
years, twice the 0.25 of the quiet budget. Diagnosed on tuning configuration S (`tuningConfigs.ts`, a 2.5% season on a 2.5%
wander, three rides a week; `rideSeason.sim.test.ts`), and on the run-level generator (`fitness/test/runSim.ts`, 120 libraries):

- The ride is not the cause. The season term and the learned floor are the same code for rides and runs, and neither is live
  before two whole years of history (the season needs two years, the floor 14 six-week blocks back to 108 weeks). The held-out
  window is exactly those two years. Alarms an athlete-year by year of the library:

  | athlete, nothing changes                      | year 1 | year 2 | year 3 |
  | --------------------------------------------- | ------ | ------ | ------ |
  | S through the unit and monitor (16 libraries) | 0.63   | 0.56   | 0.44   |
  | run generator, same nuisance (season, wander) | 0.64   | 0.57   | 0.49   |
  | run generator, quiet                          | 0.07   | 0.24   | 0.16   |
  | run generator, season 2.5% alone              | 0.57   | 0.52   | 0.33   |
  | run generator, wander 2.5% alone              | 0.17   | 0.45   | 0.31   |

  The season does most of the harm in year 1; the wander, which the floor can only learn from the second year, in year 2.
  Year 3 is better but not at the quiet budget: a fitted season is shrunk, and a 2.5% wander is a real change of level to the
  slip test (the same finding as the 5-year table above, where the nuisance rows are 0.25 to 0.47).

- The figure sits where D2 already recorded it for an athlete with this nuisance (0.44 to 0.47 over five years, and 0.26 to
  0.59 for rides at a 3% wander and 1.5% season in `ride.sim.test.ts`). It is over the quiet budget because F is not a quiet
  athlete, and it falls in the two years nobody has history for. Nothing in the ride unit makes it worse; a power-meter offset
  step is a nuisance of the strap-step kind, which the learned floor reads from year 2 on and the sims do not generate for rides.
- One lever moves it, and it is a trade, not a fix. A prior for the floor until the library's own can be learned (in place of the
  plain 1%), tried at 1.5% and 2% on both sports:

  | warm-up floor | alarms years 1 and 2, season+wander 2.5% | 8% loss seen within 12 / 26 weeks (loss at week 30) | 5% loss seen within 26 weeks (loss at week 60) |
  | ------------- | ---------------------------------------- | --------------------------------------------------- | ---------------------------------------------- |
  | 1% (today)    | 0.64, 0.57                               | 94%, 97%                                            | 86%                                            |
  | 1.5%          | 0.32, 0.37                               | 89%, 94%                                            | 64%                                            |
  | 2%            | 0.13, 0.24                               | 65%, 78%                                            | 33%                                            |

  Every row buys silence with the early detection of a real loss, in runs as in rides. It is the owner's Balanced dial applied
  to the one stretch where the library cannot yet vouch for itself, and it moves the first two years of every run library too,
  so it is not made here. No ride-specific floor is justified: the sims show rides and runs behaving the same, and there is
  no power-meter library to say rides wander more.

Decision (owner, 30 Oct): option 1. No behaviour change; ride fitness stays on and the rate is stated on the evidence panel ("In your first two years, an athlete with a strong season can see about one false Slipping every two years, then about one every four").

Options, as put to the owner: (1) keep ride fitness on and state the rate (about half an alarm an athlete-year for a rider with a
marked season in their first two years, about a quarter after); (2) a warm-up floor of 1.5%, which halves it and costs a 5% loss
about 20 points of early detection in those years, in runs too; (3) turn rides off until a ride library can say what the
wander is. The sims call for (1) or (2); nothing here argues for (3).

### One athlete's labels: the first real back-test

The detector as shipped (before D2) was checked against one athlete's own labels of its declared slips and raised no false
alarm. This is a single athlete: it says the detector was not crying wolf on him, not what its false-alarm rate is. Whether
later changes alter his declarations is for a replay on his own machine to say; its figures, dates included, stay out of
the repo.

## Rises: improving and improved (D9b)

Run-level harness, 3-year libraries, 40 libraries at each of 1.2, 2, 3 and 5 steady runs a week (`fitness/rise.sim.test.ts`).
Shown states, first week each is shown, an athlete-year:

| Library where nothing changes | improving | improved                                               |
| ----------------------------- | --------- | ------------------------------------------------------ |
| quiet                         | 0.09      | 0.010                                                  |
| heat weeks of 3%              | 0.12      | 0.019                                                  |
| wander 3%, correlation 0.95   | 0.17      | 0.058                                                  |
| season 1.5%                   | 0.10      | 0.010                                                  |
| 10% bad runs                  | 0.10      | 0.013                                                  |
| hills                         | 0.10      | 0.019                                                  |
| watch or strap step up of 3%  | 0.15      | 0.071 (documented: a device step reads as a real gain) |

A planted gain of 8% at 3 runs a week: improving in a median of 4 weeks (82% within 12, 85% within 26; a slip of the same size
97% within 12), improved in a median of 23 weeks (73% within 36, 80% within 52). At 1.2 runs a week: median 7 weeks, 90%
within 26, improved 70% within 52. A dip that comes back is back, and rises at the first-sign rate afterwards, no more. The
settled tolerance is the lever on the false rate of **improved** (without it: 0.065 on the quiet library, 0.09 with wander);
`improving` stays a status line and is never a finding.

## Warm days (D12 E2, revision 7)

A run's file may carry the day's warmth: the digest's `temperature` (a median of one-minute means of the wrist
sensor, an index of the day and not the air). `fitness/heat.ts` learns what a warm day costs this athlete and
adds it back before anything else reads the series, so the season of D2 is fitted on what the heat leaves.

- A run's heat is `max(0, c - cRef) / 10`, `cRef` the 25th percentile of `c` over the steady runs of the last two years.
  The run's value is `x + b * heat`, `b` the log speed lost per 10 index degrees, fitted within 28-day blocks (so the slow level and the
  season cancel and only the weather is read) over up to four years of runs, clipped, shrunk by `n / (n + 60)`, never negative (a
  library whose warm runs are faster gets no term) and at most 0.08. It is used only when the loss stands 2 standard errors above
  zero, so an athlete the heat does not touch is not told they were adjusted (the term was on for a third of them without this; it is
  on for 1% now).
- It is on only with two years of runs that carry a temperature (counted from the first of them), when 60% of the steady runs in the
  last two years carry one, there are 40 of them and their heat spans 1.0 (10 index degrees); it goes off only under 50%. A library
  under two years reads exactly as D2's monitor. Digests from before revision 7 carry none and count as missing (a temperature on a
  digest that is not of the current revision is not read), so a library that has not been rebuilt reads as before (`heat.test.ts`). When on, the
  card says "Adjusted for warm days." once.
- The ride unit reads the same field.
- `heat.sim.test.ts` holds the rates (three-year libraries, four run rates, 25 libraries each, alarms an athlete-year, term off ->
  fitted, with the share of libraries the term is used in):

| nothing changes in the athlete, except                  | term off -> fitted  | used    |
| ------------------------------------------------------- | ------------------- | ------- |
| heat 3% per 10 degrees                                  | 0.26 -> 0.18        | 94%     |
| the same adding to a season of 1.5%                     | 0.37 -> 0.24        | 94%     |
| the same hiding a season of 1.5%                        | 0.16 -> 0.24        | 94%     |
| the same hiding a season of 1.5%, with a 3% slow wander | 0.32 -> 0.38        | 93%     |
| heat with a 3% slow wander                              | 0.37 -> 0.34        | 93%     |
| no heat effect                                          | 0.17 -> 0.17        | 1%      |
| no heat effect, a season of 1.5%                        | 0.24 -> 0.24        | 1%      |
| device 3 index degrees high from week 80, heat          | 0.26 -> 0.16        | 94%     |
| device 3 degrees low from week 80, heat                 | 0.26 -> 0.20        | 92%     |
| device 3 degrees high / low, no heat effect             | 0.17 -> 0.16 / 0.17 | 2% / 1% |
| the fitted term applied with the wrong sign (a guard)   | 0.26 -> 0.37        | 94%     |
| warm days faster (b = -3%)                              | 0.26 -> 0.26        | 0%      |
| a library of 1.5 years, heat                            | 0.24 -> 0.24        | 0%      |
| a library of 1 year, heat                               | 0.07 -> 0.07        | 0%      |

A 5% loss is seen within 26 weeks by 62% -> 80% with the heat, and 84% -> 84% without it.

Where the heat hides a season (rows 3 and 4), its loss and the fitness swing are in opposite phase, so the monitor alone reads a small
sum; the term shows the season, and the rate lands at the same athlete's with no heat at all (0.24 -> 0.24 and 0.41 -> 0.38), not above it.

The "wrong sign" row is not a world: it applies the fitted term with the wrong sign, as a guard on the code. An athlete who is faster on
warm days gets no term (null, never negative) and reads exactly as the monitor alone. Everywhere else the fitted rate is no higher than the monitor's.

## Since your last import (D9e)

One line under the fitness cards on Balance (above them only when no card shows): what the last import added, and what
else it told. It compares the library as it was before that import (the baseline, kept in `rca-checkin`, device-local
per scope) with the library now, and makes no contrast of its own: new bests, the card's own state changes, and older
files are facts, and a state that did not move is quoted from the card ("no clear change, within 2% of before").

- The baseline moves when an import ends complete and added a workout, or when the athlete accepts a partial one, from
  the snapshot taken before that import began. Imports within 6 hours of the last are one import, so a first import made
  in several drops is a first import. A baseline of another model revision, or from before a rebuild, is not used.
- A row is seen when opened, hidden, or shown 3 seconds on two page loads, for its own baseline; a row that has appeared
  stays until hidden. It is one line closed at every width; the sentence is cut at the line's edge and the panel gives it
  whole. The sample, an import known to be partial, and a check-in already seen show no row.
- The worker keeps the baseline; the page receives the check-in with the state and sends `markSeen`.
