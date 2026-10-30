# Fitness at the same effort: slipping, holding, recovering, back

Status: core built (`packages/core/src/fitness/`), exposed on `SessionState.fitness`; the page is a
separate task. Written from a research study whose method, tables and tuning are summarised here.

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
An abrupt loss of 8% is seen in about 4 weeks (5 at one steady run a week). A loss of 5% takes about 6
weeks at 3 steady runs a week and may take months at one. A slide shows once it reaches 4 to 5%. A loss
of 3% is below an athlete's own run-to-run spread (about 4%), and is not claimed.

## Unit of evidence

One value per steady run: the log of speed at the reference heart rate. Kilometres 2 to 10, whole
kilometres, within 20 bpm of the reference, at most 25 m of climb and 15% grade credit. A run counts when
the median change of pace between kilometres is at most 5% (from three changes) and two kilometres pass.
The value of a kilometre is `ln(1000/seconds) - kappa * credit - beta * (hr - ref)`; a run's value is the
median over its kilometres. `kappa` (how much of the grade credit shows at the same heart rate) and `beta`
(speed per bpm) are fitted per library within 28-day blocks and clamped. The reference heart rate is the
median of the library's steady flat kilometres over its newest 52 weeks, to the nearest 5 bpm.

The **strict unit** (flat, steady heart rate and pace from the kilometre before, 3 kilometres, the model's
whole credit) is read when the fit is unstable: fewer than 300 kilometres to fit, a kappa more than 0.5
outside [-1, 0], or a kappa known no better than +-0.25. With under 1% spread in the credit the whole credit
is used. Rides use measured power from `hrBlocks` only and are off (`RIDE_FITNESS_ENABLED`): their noise is
not measured on real power-meter libraries.

## Monitor

Evaluated at the end of each week from the first with a reference (12 runs over 8 weeks, 8 to 44 weeks ago).
A slip is a window contrast at scales (4, 32), (8, 32), (16, 48), (26, 78) weeks with z <= -3.3 and a loss of
at least 4% on two weeks running; the onset is the best split of the last 40 weeks; the reference is then
frozen for the episode. The episode moves between slipping, holding below (24-week trend flat within 5%),
recovering (the contrast against the episode's own low and the 26-week trend both firing, or the rise from the 20-week
trough on its own at z of 6.5, two weeks running) and back (a 12-week level within 1% of the reference with a lower bound above -2%, three weeks
running), which closes after 12 weeks. A new state is shown after it has held two weekly evaluations, unless
it begins when the athlete was calm. All numbers are in one table, `fitness/params.ts`. The state machine
matched the research prototype on a one-off check of 25,200 simulated weeks (no differences); that check is
not kept as a test.

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
4. Known gaps, measured: a seasonal swing of 3% amplitude gives 0.7 alarms an athlete-year (budget 0.4); every
   nuisance at once about 0.55; a watch or strap change of 3 to 5% reads as a real slip, since the data cannot
   tell them apart.
5. "Recovering" is a headline claim, so it is held to a stricter bar than a slip. Before tuning, about 1 in 9
   persistent-loss libraries was called recovering within a year and 1 in 3 within 2.5 years (on harness libraries,
   with a wider wander, 1 in 5 and 1 in 2). The contrast and the trend now have to agree, and the trough rule, which
   compares with the lowest of many levels and so reads wander as a rise, stands alone only at z of 6.5. Now: 3%
   within a year and 8% within 2.5 years at run level (6% and 15% on harness libraries); "back" about 1%. The cost is
   a slower confirmation: after an abrupt return of 8%, a median of 7 weeks to "recovering" (about 6 before), and
   94% within a year (87% on harness libraries); a return spread over half a year takes a median of 24 weeks.
   The other levers tried (higher z everywhere, a larger or growing model-error floor, longer confirmation, longer
   windows) either cut true recoveries as fast as false ones or did little; see the table in the PR.
