# The change test

One rule, in core (`packages/core/src/change`), decides whether the app says a best effort changed. Every change sentence
reads its call (`SessionState.change`): the sport curve title, the best-effort list's change column, Balance's
"What changed" strip, the dated-bests title. A sentence the test cannot support is not written.

## The question

Are the selected period's best efforts further from the previous period's than the athlete's own efforts would put them if
the two periods were drawn from one pool?

## Method

1. For each sport and each curve duration, every activity of each period gives one reading: its best at that length or
   longer (the monotone envelope; an unbacked estimated ride point counts at its own length only). A run is read in flat
   speed, a ride in W/kg (watts at one mass; with dated masses it is the rule the ride curve picks its best by).
   What counts as a reading is one rule (`ReadingRule`, `digest/readingRule.ts`) that the curves' bests
   (`bestCurves`) and the readings (`readingsOf`) both take their efforts through, with a key in the cache; a hard-effort
   gate is plugged in there, so the test is calibrated on the very efforts the numbers it judges are made of, and the
   minimum sizes below count the readings that pass it.
2. The statistic is `ln(best now / best before)`. Which way a sentence says it moved is this ratio's sign (`directionOf`),
   never the displayed watts, which a change of weight can move the other way ("5% more power per kilogram").
3. The null pools both periods' readings and deals them at random into a "now" and a "before" side of their real sizes,
   2,000 times (seeded, so a result repeats). A balanced deal walks the pooled ranks from the top until both sides have
   appeared; a deal with a small side (under an eighth of the pool) chooses the small side's ranks (Floyd), O(small), so 400
   efforts against 4 costs 4 draws a deal. Both are exact.
4. Two bands: the 5th to 95th percentile (the **record** band: the best-effort list's rows and the dated bests) and the
   2.5th to 97.5th (the **headline** band: Balance's strip and a curve's title, which surface several claims at once). Above
   a band is `higher`, below `lower`, inside `none`. A call inside the record band only is no clear change at the headline.
5. Each side needs 4 readings and the pool 12, else the length is `untested`. The smallest change that could have been
   called (the wider side of the band) is stored, and a "none" says so: "changes under 7% can't be told apart here". Past 25% (`MAX_STATED_RESOLUTION`: efforts that vary by that much, as easy runs mixed with hard ones do before the hard-effort gate) no size is stated and the line says "the efforts vary too much to show a change".
6. Power source (a ride): the power-meter readings alone when both periods have enough of them; failing that, all readings
   only when neither period has a power-meter reading at all (estimated against estimated). Any other mix, or a mix that
   differs between the periods, is `untested`: a change of source reads as a change of power. Virtual power is never
   measured.

Because the null is the athlete's own pool, a library with few or scattered efforts has a wide band and the same rule
needs no table of cases. The band is not symmetric when the periods hold different numbers of efforts.

## What the verdict is not

`higher` is not "fitter". A best is a lower bound on what an athlete can do, and a period without a hard effort has lower
bests. The pooled null assumes the efforts of the two periods are exchangeable, which a swing in how many hard efforts a
period holds breaks: a period of mostly easy efforts against one of mostly hard ones is called `higher` in about a quarter of
equal-capability pairs (efforts clipped at the capability, hard share 0.2 against 0.8). That is the gap the reading rule is
for, and the effort gate (D1) is plugged into it (`digest/hardEffortRule.ts`, built by the session from the library's
references and its set-aside list). A point counts when heart rate shows it was a hard effort: up to 20 minutes by its
session's peak (the late-best session test), beyond 20 minutes by the session's average at 80% of the reference or more
(a steady hour sits there, not at the hard line, as in the race predictions), and a sprint of a minute or less counts, since a
30 s heart rate cannot show one. A point with no heart rate, a heart rate set aside, or a reference too thin to judge does not
count, and none does against a reference that cannot certify a maximum.

The two periods are always read alike. At each length the call is made from those hard readings when both periods hold
enough of them (the minimum sizes count readings), and otherwise from every effort in both periods; `ChangeCall.gated` says
which, and the strip adds "Effort not checked on the running comparison" when it is false. Dropping the efforts without a
heart rate from one period while keeping them in the other would bring the swing back, which is why a strap worn in one
period only sends the call to every effort. At 4 efforts a week, equal capability, 30% hard against 90%: 19 and 20 of 60
seeds were called `higher` (run, ride) through every effort, and 2 and 1 of the 55 whose calls were made from the hard efforts
(the other 5 fell back to every effort and say so). The curves' bests keep every effort, so a demonstrated best that was not
hard still shows; the strip withholds a comparison whose shown best was not hard (`notHardNote`) and does not withhold one the
gate could not judge.

**Limit.** At 60 s or less easy sessions count, so a swing in hard share is not controlled there. The gate reads a session's heart rate, not the effort inside it: a sprint or a hard interval in a session whose
peak stayed under the line is counted by length (sprints) or lost (efforts of 1 to 20 minutes), and a library with a strap in
one period only, or too few hard efforts in either, is read from every effort in both and carries the swing in hard share
that the gate exists to remove.

## Calibration (`change/change.sim.test.ts`)

The harness draws a real library's noise: every effort lands round the capability with a log sd (`effortSd`: 0.10 for a
run's 20 min, 0.25 for a ride's 5 min), with no ceiling. A guard test holds equal-capability pairs of periods to a median
|ln ratio| of 3.5-6% for a run's 20 min and 10-15% for a ride's 5 min (observed 4.3-5.6% and 11-13%), the figures the
audit found in a real library. The harness before this one clipped hard efforts at the capability; its noise was 6 to 17 times
smaller, and the "28% called under a wandering capability" it showed was that harness, not the test (at real noise it is 8%).

Two periods of 12 weeks, 300 seeds a cell. "Record" is the 90% band, "headline" the 95%.

| Scenario                                             | Planted    | Record: higher / lower | Headline |
| ---------------------------------------------------- | ---------- | ---------------------- | -------- |
| Run 20 min, 2 / 3 / 4 a week                         | 0%         | 1-2% / 5%              | 3-4%     |
| Ride 5 min, 2 a week; ride 20 min, 2 a week          | 0%         | 1-3% / 4-6%            | 2-5%     |
| Run 20 min, 4 a week, capability wandering 3% a week | 0%         | 3% / 5%                | 5%       |
| Run, 5 a week against 1.5 (or the reverse)           | 0%         | 3-4% either way        |          |
| Run 20 min, 4 a week                                 | +5%        | 17% found              | 11%      |
| Run 20 min, 4 a week                                 | +10%       | 42% found              | 34%      |
| Run 20 min, 2 a week                                 | +5% / +10% | 8% / 28% found         | 5% / 19% |
| Ride 5 min, 2 a week                                 | +5% / +10% | 5% / 13% found         | 3% / 7%  |
| Ride 20 min, 2 a week (effort sd 0.15)               | +5% / +10% | 7% / 18% found         | 5% / 9%  |

So at a real library's noise a 10% gain is found in about two athletes in five (a run, 4 a week), and a 5% gain in about one in
six; a ride's 5 min is harder. The test is calibrated, not powerful: it says little rather than something wrong.

Multiplicity: of 5, 20 and 60 min at the record level, any one is called in 18% of equal-capability libraries (the rows keep
5% a tail, as each is its own claim); the headline of a run's or a ride's 20 min, which the strip and a title state together, is
called in 7% (4% for the run alone). A budget test holds the headline to under 10%.

### On a real library (aggregates only; the script lives outside the repository)

The owner's export: 1,909 analysed activities, 1,763 runs, 146 rides of which 20 have a power meter.

- Random halves of a window (no true change), window 56 / 84 / 168 / 364 days, 45-55 windows with 6 splits each: a run's
  5 min is called in 5-7% of splits at the record level (headline 3-4%); its 20 min in 4-8% (2-4%); its 60 min 3-7% where the
  window holds enough (headline 2-3%). Any of the three lengths in a record row: 10-18%; the headline of the run's 20 min: 2-4%.
  Rides are `untested` in nearly every split: 20 power-meter rides do not give 4 a side.
- Real adjacent windows (the selected period against the one before, stepped by 28 days), 84 / 168 / 364 days: a run's 20 min
  is called at the record level in 15-28% of pairs (headline 10-14%), up in 9-12% of all judged calls and down in 8-12%. These
  windows differ in the athlete as well as in chance, and in how hard they trained; the excess over the splits is the
  rate of real movement, seasons and hard-effort swings together, not of false calls.

## Where it is used

| Surface                                         | Reads                                                                                                                                                                                   |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sport curve title (`curveTakeaway`)             | the 20 minute call at the headline level, else the longest length both periods hold that the test could judge                                                                           |
| Best-effort list change column (`recordChange`) | the call at the record's length, record level                                                                                                                                           |
| Balance "What changed" (`balanceChanges`)       | the 20 minute call of each sport, headline level; the lean needs a called best that moves it the way it moved, and a sport whose best was withheld as not hard counts as untested there |
| Best efforts over time title (`takeawayAt`)     | the call at the chosen length, headline level                                                                                                                                           |
| Import summary                                  | no call: it lists figures only when the period was one regime before and after (`sameRegime`)                                                                                           |
