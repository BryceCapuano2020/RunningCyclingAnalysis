# Fitness at the same effort: slipping, holding, recovering, back

Status: core built (`packages/core/src/fitness/`), exposed on `SessionState.fitness`; the page is a
separate task. Written from a research study whose method, tables and tuning are summarised here.

## What it says

For each sport, one of: **slipping**, **holding** (level with the weeks before), **holding below** the
old level, **recovering**, **back**, or **not enough evidence yet** with the counts that are missing.
Each carries the output at the library's reference heart rate now and before, the change with a 90%
range, the month the change began, and the runs behind it (ids, spans, counts). Mixed libraries get two
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
recovering (a rise against the episode's own low, a 26-week trend or a rise from the 20-week trough, two weeks
running) and back (a 12-week level within 1% of the reference with a lower bound above -2%, three weeks
running), which closes after 12 weeks. A new state is shown after it has held two weekly evaluations, unless
it begins when the athlete was calm. All numbers are in one table, `fitness/params.ts`. The state machine
agrees record for record with the research prototype on simulated series.

## Findings

`findings/detectors/fitnessStatus.ts` speaks only for a slipping, recovering or back that began to be shown in
the last 6 weeks, so the ledger shows each once; holding and not enough evidence are status lines. Its
headline carries sizes and dates but no pace or power, because a finding outlives the unit setting. The
engine's surprise is the monitor's own z against the usual spread of a z-score, 1
(`FITNESS.finding.quietSpread`), since the monitor has already held the change to a false-alarm budget of
about a quarter of an alarm per athlete-year.

## Decisions

1. Library-wide, not per period; replayed from the first steady run to the newest activity and remembered
   for the same digests (`memoByDigests`), so a period switch costs nothing. 2,000 activities: about 85 ms the
   first time, 0.2 ms again.
2. The fit and the reference heart rate are read on the whole history to the date, so a past week's reading
   can move a little as the library grows.
3. A break of four weeks or more, or fewer than four steady runs in eight weeks, makes the status line "not
   enough recent evidence" without changing the monitor's state.
4. Known gaps, measured: a seasonal swing of 3% amplitude gives 0.7 alarms an athlete-year (budget 0.4); every
   nuisance at once about 0.55; a watch or strap change of 3 to 5% reads as a real slip, since the data cannot
   tell them apart. In a persistent loss about 3 in 10 libraries get a false "recovering" within a year; none
   get "back".
