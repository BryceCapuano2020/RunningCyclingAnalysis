# Ride fitness: an early trend, and rides a spike no longer drops (design)

Status: spec and prototype, revised after the science review (Stage W, package W5, step 1 of "Formula and model changes" in
[PROCESS.md](../PROCESS.md#formula-and-model-changes)). Not built. It changes the ride card of
[fitness.md](fitness.md) ("Rides"); the run unit and the monitor's alarm rules are unchanged. This note holds no owner data.

## Why

The ride card reads power at the ride's reference heart rate over time. A steady ride is an outdoor ride with a power meter
and heart rate, with no `hr-spike`, `hr-cadence-lock` or `hr-dropout` flag anywhere in it, and at least two five-minute
blocks within 20 bpm of the reference (`rideUnit.ts`). A trend needs the monitor's baseline: 12 steady rides over 8
distinct weeks, 44 to 8 weeks back (`windows.ts` `referenceOf`). Without it the monitor records `nodata` and the card says
"12 more earlier rides to see a trend".

Two riders never get a trend for months:

1. **A new power meter.** Rides before it carry virtual power, which the unit leaves out. A rider with two power-meter rides
   a week waits about 17 weeks for the baseline (prototype, below); one ride a week waits about 21.
2. **An HR spike.** One 11-second spike (a jump of more than 15 bpm in a second, flagged 5 s either side) drops a five-hour
   ride, though the flagged samples are already masked out of its blocks (`quality/assess.ts`, `hr/blocks.ts`: a block
   keeps its average over the usable samples when 90% of them are usable, so one spike leaves every block it touches
   readable). A rider whose long rides each carry one spike loses all of them.

The owner's standing direction: lead with the best estimate when the data can give one, and heart rate never vetoes power.

## The change

### 1. A ride with an isolated spike counts

For rides only, `hr-spike` no longer drops a ride that passes all three of these:

1. Its spike flags cover at most `maxSpikeShare` (2%) of its moving time. One merged flag (a reading over 230 bpm, or jumps
   less than 10 s apart) can run for minutes, so the cap is on flagged seconds, not on the number of flags. A failing sensor
   fails it.
2. The five-minute blocks that overlap a flagged second, or start within `HR_BLOCK_S` of one, are left out. A strap reads
   wrong just beside a spike as well as during it: a dry strap reads low, and a low reading inflates power at heart rate.
3. At least `minCleanBlocks` (3) blocks within 20 bpm of the reference are left. With two, the ride's heart rate is the mean
   of two blocks, and one block 10 bpm low moves the ride by about 3.5% (prototype, below).

Inside the blocks the spike samples stay masked, as now. `hr-cadence-lock` and `hr-dropout` still drop the ride: a lock is a
heart rate of no use for the whole stretch it covers, and the prototype gave no case for relaxing either.

Rule 2 needs each block's start second. `DigestHrBlock` has none today, so the build adds `startS` to it (a digest
revision). A ride digested before that revision keeps today's rule until it is read again.

Precedent: intervals.icu detects heart-rate spikes and replaces them with a line between the readings either side, keeping
the activity ([forum, "Heartrate spikes now automatically fixed"](https://forum.intervals.icu/t/heartrate-spikes-now-automatically-fixed/174)).
TrainingPeaks computes efficiency factor on the whole file ([help: Aerobic Decoupling and Efficiency Factor](https://help.trainingpeaks.com/hc/en-us/articles/204071724-Aerobic-Decoupling-and-Efficiency-Factor)).
Neither drops a ride for one spike. Both keep the seconds beside it, which rule 2 does not.

### 2. An early trend while there is no baseline

When the monitor has no baseline (the `history` shortfall) and the sport is not on a break, the card reads the newest steady
rides against the first ones in the monitor's own window:

1. `rides` = the steady rides of the last 44 weeks (`monitor.refStartWeeks`), in time order. A rider back after a long gap
   is compared with the first rides of the return, not with rides from years ago.
2. `n` = `min(maxGroup, floor(len(rides) / 2))`. While `n >= minGroup` and the median day of the newest `n` rides is less
   than `minApartDays` after the median day of the first `n`, `n` falls by one. Under `minGroup` there is no early trend.
3. `first` = the first `n` rides, `newest` = the newest `n`. Each ride is already at the reference heart rate: the unit moves
   it there by the library's slope `beta` (fitted within 28-day blocks of at least 3 rides, clamped to 0.002 to 0.02 a bpm,
   and 0.008 when the heart rates barely vary, which is most new libraries). Each level is `levelOf` (the clipped mean the
   monitor uses) at the spread `sigmaAt` gives (the library's own, or the 4.5% prior with fewer than 10 changes).
4. `change = newest.m - first.m` in log units, with half-width `halfWidth(first.se, newest.se, rangeTau)`: the 90% range
   the app prints everywhere, with the model-error floor once for each group, since each group's level wanders on its own.
   It is said as a fraction through `ranged`, read at the last completed week end.
5. **No direction word.** The card prints the signed estimate and its range, never "up" or "down". The review's budget for a
   direction word was 12% of riders whose fitness did not change, over the whole early period, with a season. The seasonal
   rows below hold a direction in 18% to 48% of them, so the word is dropped, and with it any hold rule.

The early trend is a display state, never an alarm. It makes no finding, opens no episode and changes nothing the monitor
reads. The monitor's rules (44, 8, 12, 8) stay. Once the baseline exists the early trend is gone and the monitor speaks.

Precedent: efficiency factor, normalised power over heart rate, is charted from an athlete's first rides in TrainingPeaks
(help page above) and intervals.icu (Power/HR, [forum](https://forum.intervals.icu/t/hr-efficiency-over-time/482)), with no
baseline and no range. Garmin's cycling VO2 max estimate needs a power meter and heart rate and gives a figure after a few
rides, warning that it "may seem inaccurate at first" ([Garmin manual](https://www8.garmin.com/manuals/webhelp/GUID-BD965919-30AA-4EB5-95D7-A899658C50EB/EN-US/GUID-E17003DB-1F26-483E-A8B4-BBF04B4E3A9B.html)).
The early trend compares groups and prints a range, and claims no direction.

### 3. Modelled power stays out

Virtual power is worked out from speed, gradient and the rider's mass. Wind, drafting in a group, road surface and tyre
choice move speed at the same power, so a trend in virtual power at a heart rate reads the weather and the company as
fitness. The threshold already weights virtual watts at 0.4 because of this ([threshold.md](threshold.md)); the fitness
card, which reads changes of a few per cent, cannot take that noise. The card says so in Details.

## Constants

| Constant              | Value | Where                   | Why                                                                                             |
| --------------------- | ----- | ----------------------- | ----------------------------------------------------------------------------------------------- |
| `ride.maxSpikeShare`  | 0.02  | new, `FITNESS.ride`     | Room for a few isolated spikes in any ride; a merged flag of minutes or a failing sensor fails. |
| `ride.minCleanBlocks` | 3     | new, `FITNESS.ride`     | A median of three, so one block beside a flag cannot set the ride's heart rate.                 |
| `early.minGroup`      | 3     | new, `FITNESS.early`    | The fewest rides `levelOf` takes a median of (`display.levelMinRuns`).                          |
| `early.maxGroup`      | 6     | new                     | Sweep below: 3 widens the range, 10 spreads the groups in time and shrinks the estimate.        |
| `early.minApartDays`  | 14    | new                     | Two weeks, as the monitor's `minRecentWeeks`; 21 changed nothing in the sweep.                  |
| window                | 44 wk | `monitor.refStartWeeks` | The monitor's own window.                                                                       |
| range                 | 90%   | `display.rangeZ`        | The app's one range.                                                                            |
| model-error floor     | 2%    | `monitor.rangeTau`      | Once per group (step 4). It equals rideSim's own wander, so it is a floor, not a margin.        |

## States and copy

The waiting card keeps its headline, the level now: "212 W (205 to 219) at 140 bpm." (synthetic). Under it:

| State                                                   | Change line                                                | Needs line                                                                                        |
| ------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Early trend                                             | "+2% on your first power-meter rides, 1 Sep (−4% to +8%)." | "The full trend starts once 12 power-meter rides are 8 weeks old. 5 so far."                      |
| Under 6 steady rides, or the groups closer than 2 weeks | none                                                       | "2 more power-meter rides with heart rate for an early trend."                                    |
| No steady ride                                          | none                                                       | "No outdoor rides with a power meter and heart rate yet."                                         |
| Only virtual power                                      | none                                                       | same; Details: "Power worked out from speed moves with wind and drafting, so it is not compared." |

"Power-meter rides" replaces "earlier rides" in every ride shortfall line, and the weeks variant says "over 8 different
weeks". The date is the first ride of the first group. Details give both groups' spans and ride counts, and say that a
season, the weather and a change of meter move the figure until the full trend. A run's lines are unchanged.

## What the prototype shows

Synthetic riders from `fitness/test/rideSim.ts` (five blocks a ride at 125 to 165 bpm, a ride's day 2%, blocks 3.5%, the
measured 2% wander unless stated), two rides a week unless stated; rides before the meter carry virtual power. "Before" is
the core as it is; "after" is rules 1 and 2. The scripts are not in the repository; the build's calibration case replaces them.

Snapshot at the end of a 130-week library, 400 libraries a row ("range clears zero" is one evaluation):

| Rider                               | Before                      | After: estimate median (p10 to p90), half-range | Range clears zero |
| ----------------------------------- | --------------------------- | ----------------------------------------------- | ----------------- |
| Stable, meter 4 weeks               | no trend, "12 more earlier" | +0.1% (−3.3% to +3.1%), 7.0%                    | 2%                |
| Stable, meter 12 weeks              | no trend                    | +0.1% (−3.3% to +4.0%), 5.6%                    | 8%                |
| Stable, meter 12 weeks, 4.4% a ride | no trend                    | +0.1% (−3.7% to +4.3%), 6.1%                    | 8%                |
| Improving 5% over 12 weeks          | no trend                    | +3.8% (+0.3% to +7.9%), 5.8%                    | above 27%         |
| Slipping 5% over 12 weeks           | no trend                    | −3.7% (−6.9% to +0.1%), 5.4%                    | below 26%         |
| Improving 10% over 12 weeks         | no trend                    | +7.5% (+3.9% to +11.7%), 6.0%                   | above 72%         |
| Meter 20 weeks or more              | monitor                     | monitor, identical to before                    |                   |
| Stable, full history, no spikes     | holding 75%                 | identical in every library                      |                   |

The planted 5% change between the groups' median weeks is about 3.75%, so the estimate is unbiased. Shrinking the groups to
3 widened the half-range to 5.4% with one floor (4.5% at 6); growing them to 10 pulled a planted 5% rise down to 2.9%.
Fixed seed (seed 1, two a week, 130 weeks, the last 12 on the meter, a 5% rise over them): 24 steady rides, groups of 6,
63 days apart, +4.21% (−0.94% to +9.63%).

Weekly replay, meter 24 weeks, each week end from meter week 2 to the monitor's baseline (about week 17 at two a week, 21 at
one), 200 libraries a row: the share of riders with no planted change whose range clears zero on two week ends running
with the same sign, at the worst of four meter-start phases (the meter starting before the season's rise, at its peak,
before its fall, at its low).

| Season, wander | 1 a week | 2 a week | 3 a week | Worst phase |
| -------------- | -------- | -------- | -------- | ----------- |
| none, 2%       | 6%       | 10%      | 9%       |             |
| 1.5%, 3%       | 31%      | 30%      | 34%      | before fall |
| 3%, 3%         | 38%      | 38%      | 48%      | before fall |

Every seasonal row is over the 12% budget at every phase (best: 18%, at the peak), so step 5 drops the direction word.
On one week end, not held, the worst row reaches 59%. The meter starting 7 weeks before the
season's fall is the worst phase; 7 weeks before its rise is 1 to 10 points under it.

Spikes, one ride in four carrying one spike flag, 130 weeks, 40 libraries. The spiked rides' level against the clean rides of
the same library, less the same contrast in the twin library without the artefact:

| Artefact on a spiked ride                            | Today        | v1 (spike count only) | Rules 1 to 3 |
| ---------------------------------------------------- | ------------ | --------------------- | ------------ |
| Middle block 10 bpm low, beside the flag (dry strap) | ride dropped | +3.0%                 | −0.3%        |
| Middle block 10 bpm high, beside the flag            | ride dropped | −3.0%                 | −0.3%        |
| Two in-band blocks, one 10 bpm low beside the flag   | ride dropped | +3.6%                 | ride dropped |
| One merged flag of 400 s in a 90-min ride            | ride dropped | +3.0%                 | ride dropped |
| Middle block 10 bpm low, away from any flag          | ride dropped | +3.0%                 | +3.0%        |

The last row is a dry strap with no spike near it. Today's rule has the same exposure on every ride without a flag, and
neither rule can see it.

## False-trend risk

- **Season and wander.** The largest. Over the early period a season of 1.5% to 3% and a 3% wander clear the range for 18%
  to 48% of riders whose fitness did not change. That is why there is no direction word. The monitor's season fit takes over
  after two years.
- **Weather.** The heat term needs two years, so it is off here. Summer to autumn reads as more power at the same heart rate.
- **The slope.** Most new libraries use the fallback `beta` of 0.008 a bpm. If the two groups' heart rates differ by 10 bpm
  and the rider's true slope is 0.004 off, the change is 4% off. The build reports both groups' median heart rates in
  Details.
- **A change of meter.** Not handled. A second meter mid-period, or a first one read before its zero offset, reads as a
  step the data cannot tell from fitness.
- **Route and riding.** The ride unit has no steadiness test. Solo rides first and group rides later can differ. Groups of
  6 dilute one odd ride; the clip in `levelOf` holds a far one.
- **Spikes.** Rules 1 to 3 remove the artefact beside a flag. One away from every flag is unseen, as today.

## Acceptance tests (the build pull request's calibration case)

1. The weekly replay above, no season, 2% wander, 200 libraries: the range clears zero two week ends running, same sign, in
   at most 12% at one, two and three rides a week.
2. The seasonal rows (1.5% and 3% season, 3% wander, four phases): pinned within 5 points of the table, so a change that
   moves them is seen; no early-trend line contains "up", "down", "rising" or "falling".
3. The fixed-seed golden estimate: +4.21% (−0.94% to +9.63%) from groups of 6, to 0.01 points.
4. A 5% rise or slip over 12 weeks: the median estimate within 1 point of the planted change between the groups' median
   weeks; a 10% rise: the range above zero in at least 65%.
5. The low artefact: the dry-strap row reads within 0.5 points of its twin; the two-block row and the 400 s merged flag
   drop the ride; a ride with a cadence lock or a dropout stays out.
6. Virtual-power rides added to a library change nothing it says.
7. A rider back after 60 weeks away: the first group comes from the return.
8. With a baseline the early trend is absent, and every status matches today's (an identity test on the full-history rider).
9. Copy: each state's lines above, and no ride line says "earlier rides".

The build pull request adds a row to [model-ledger.md](model-ledger.md) with tests 1 to 4's before and after figures.

## Open questions

1. Should runs get the same spike rule? Runs drop a spiked run today. Not measured here.
2. The early trend reads the whole 44 weeks. A rider whose baseline thins later (a long winter off) gets the `history`
   shortfall again and then an early trend from the return. That is by design; it is test 7.
