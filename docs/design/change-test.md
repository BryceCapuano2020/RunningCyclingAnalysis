# The change test

One rule, in core (`packages/core/src/change`), decides whether the app says a best effort changed. Every change sentence
reads its verdict (`SessionState.change`): the sport curve's title, the best-effort list's change column, Balance's
"What changed" strip, the dated-bests chart's title. A sentence the test cannot support is not written.

## The question

Are the selected period's best efforts further from the previous period's than the athlete's own efforts would put them if
the two periods were drawn from one pool?

## Method

1. For each sport and each curve duration, every activity of each period gives one reading: its best at that length or
   longer (the monotone envelope; an unbacked estimated ride point counts at its own length only). A run is read in flat
   speed, a ride in W/kg (watts at one mass; with dated masses it is the rule the ride curve picks its best by).
2. The statistic is `ln(best now / best before)`.
3. The null pools both periods' readings and deals them at random into a "now" side and a "before" side of their real sizes,
   2,000 times (seeded, so a result repeats). The best of each side is found by walking the pooled ranks from the top, which
   is exact and costs a few steps a draw.
4. The band is the 5th to the 95th percentile of the null's statistic: a two-sided test at 10%. Above it is `higher`, below
   it `lower`, inside it `none`.
5. Each side needs 4 readings and the pool 12, else the length is `untested`: with fewer the null cannot separate the
   periods. A sparse athlete gets `untested` at the lengths they lack, and the surfaces say nothing about them.

Because the null is the athlete's own pool, a library with few or scattered efforts has a wide band and the same rule needs no
table of cases. The band is not symmetric when the periods hold different numbers of efforts: the larger side's best is
expected to be higher, and the null prices that in.

## What the verdict is not

`higher` is not "fitter". A best is a lower bound on what an athlete can do, and a period without a hard effort has lower
bests. The strip keeps its hard-effort gate (`notHardNote`). A capability that wanders by itself between the periods is
read as a change, as a best-effort rule cannot tell it from a gain.

## Calibration (`change/change.sim.test.ts`, 400 seeds per cell, two periods of 12 weeks)

| Scenario                                      | Planted | Called higher | Called lower |
| --------------------------------------------- | ------- | ------------- | ------------ |
| Run or ride, 4 a week, any spread             | 0%      | 2-3%          | 3-5%         |
| Run or ride, 2 a week, any spread             | 0%      | 3-4%          | 2-3%         |
| Run, 4 a week                                 | 5%      | 88-99%        | 0%           |
| Run, 4 a week                                 | 10%     | 99-100%       | 0%           |
| Run, 2 a week                                 | 5%      | 36-67%        | 0%           |
| Run, 2 a week                                 | 10%     | 69-84%        | 0%           |
| Ride, 2 a week                                | 5%      | 45-76%        | 0%           |
| Ride, 2 a week                                | 10%     | 75-89%        | 0%           |
| Run, 4 a week, capability wandering 3% a week | 0%      | 14%           | 14%          |

"Spread" is how near the capability a hard effort lands (2%, 5% or 8%, a log sd). One a week leaves under four efforts of 20
minutes a side in over half of libraries, so those lengths are `untested`.

## Where it is used

| Surface                                         | Reads                                                                                         |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Sport curve title (`curveTakeaway`)             | the 20 minute call, else the longest length both periods hold that the test could judge       |
| Best-effort list change column (`recordChange`) | the call at the record's length                                                               |
| Balance "What changed" (`balanceChanges`)       | the 20 minute call of each sport; the lean needs a called best that moves it the way it moved |
| Best efforts over time title (`takeawayAt`)     | the call at the chosen length                                                                 |
| Import summary                                  | no call: it lists figures only when the period was one regime before and after (`sameRegime`) |
