# Ride fitness: an early trend, and rides a spike no longer drops (design)

Status: spec and prototype (Stage W, package W5, step 1 of "Formula and model changes" in
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

For rides only, `hr-spike` no longer drops the ride when its spike flags number at most `maxSpikesPerHour` per started hour
of moving time. The spike samples stay masked out of the blocks, as now. A ride with more spikes than that has a sensor that
is failing, and stays out. `hr-cadence-lock` and `hr-dropout` still drop the ride: a lock is a heart rate of no use for the
whole stretch it covers, and the prototype gave no case for relaxing either.

Why the damage is bounded: the ride's value is the median over its in-band blocks. A reading the mask missed (a strap
settling, high for a few minutes after a spike) touches one or two blocks of a long ride, and a median of many blocks does not
follow one or two. The prototype plants such a reading, 10 bpm high on one block of every spiked ride.

Precedent: intervals.icu detects heart-rate spikes and replaces them with a line between the readings either side, keeping
the activity ([forum, "Heartrate spikes now automatically fixed"](https://forum.intervals.icu/t/heartrate-spikes-now-automatically-fixed/174)).
TrainingPeaks computes efficiency factor on the whole file ([help: Aerobic Decoupling and Efficiency Factor](https://help.trainingpeaks.com/hc/en-us/articles/204071724-Aerobic-Decoupling-and-Efficiency-Factor)).
Neither drops a ride for one spike.

### 2. An early trend while there is no baseline

When the monitor has no baseline (the `history` shortfall) and the sport is not on a break, the card reads the newest steady
rides against the first ones in the monitor's own window:

1. `rides` = the steady rides of the last `windowWeeks` weeks (44, `monitor.refStartWeeks`), in time order. A rider back
   after a long gap is compared with the first rides of the return, not with rides from years ago.
2. `n` = `min(maxGroup, floor(len(rides) / 2))`. While `n >= minGroup` and the median day of the newest `n` rides is less
   than `minApartDays` after the median day of the first `n`, `n` falls by one. Under `minGroup` there is no early trend.
3. `first` = the first `n` rides, `newest` = the newest `n`. Each level is `levelOf` (the clipped mean the monitor uses) at
   the spread `sigmaAt` gives (the library's own spread, or the 4.5% prior with fewer than 10 changes between rides).
4. `change = newest.m - first.m` in log units, with half-width `halfWidth(first.se, newest.se, rangeTau)`: the 90% range
   the app prints everywhere, with the model-error floor once for each group, since each group's level wanders on its own.
   It is said as a fraction through `ranged`.
5. The direction is evaluated at each week end, like the monitor. It is "up" or "down" only when the range is clear of zero
   on `display.holdWeeks` (2) weekly evaluations running. Otherwise the card gives the estimate without a direction.

The early trend is a display state, never an alarm. It makes no finding, opens no episode and changes nothing the monitor
reads. The monitor's rules (44, 8, 12, 8) stay. Once the baseline exists the early trend is gone and the monitor speaks.

Precedent: efficiency factor, normalised power over heart rate, is charted from an athlete's first rides in TrainingPeaks
(help page above) and intervals.icu (Power/HR, [forum](https://forum.intervals.icu/t/hr-efficiency-over-time/482)), with no
baseline and no range. Garmin's cycling VO2 max estimate needs a power meter and heart rate and gives a figure after a few
rides, warning that it "may seem inaccurate at first" ([Garmin manual](https://www8.garmin.com/manuals/webhelp/GUID-BD965919-30AA-4EB5-95D7-A899658C50EB/EN-US/GUID-E17003DB-1F26-483E-A8B4-BBF04B4E3A9B.html)).
The early trend is stricter than these: it compares groups, prints a range and holds a direction for two weeks.

### 3. Modelled power stays out

Virtual power is worked out from speed, gradient and the rider's mass. Wind, drafting in a group, road surface and tyre
choice move speed at the same power, so a trend in virtual power at a heart rate reads the weather and the company as
fitness. The threshold already weights virtual watts at 0.4 because of this ([threshold.md](threshold.md)); the fitness
card, which reads changes of a few per cent, cannot take that noise. The card says so in Details.

## Constants

| Constant                | Value | Where                   | Why                                                                                       |
| ----------------------- | ----- | ----------------------- | ----------------------------------------------------------------------------------------- |
| `ride.maxSpikesPerHour` | 1     | new, `FITNESS.ride`     | An isolated spike; a failing sensor spikes far more often. The cap is generous by design. |
| `early.minGroup`        | 3     | new, `FITNESS.early`    | The fewest rides `levelOf` takes a median of (`display.levelMinRuns`).                    |
| `early.maxGroup`        | 6     | new                     | Sweep below: 3 widens the range, 10 spreads the groups in time and shrinks the estimate.  |
| `early.minApartDays`    | 14    | new                     | Two weeks, as the monitor's `minRecentWeeks`; 21 changed nothing in the sweep.            |
| window                  | 44 wk | `monitor.refStartWeeks` | The monitor's own window.                                                                 |
| range                   | 90%   | `display.rangeZ`        | The app's one range.                                                                      |
| model-error floor       | 2%    | `monitor.rangeTau`      | Once per group (see step 4).                                                              |
| direction hold          | 2 wk  | `display.holdWeeks`     | The monitor's own display hold.                                                           |

## States and copy

The waiting card keeps its headline, the level now: "212 W (205 to 219) at 140 bpm." (synthetic). Under it:

| State                                                   | Change line                                                | Needs line                                                                                        |
| ------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Early trend, direction held                             | "Up 4% on your first power-meter rides, 1 Sep (1% to 8%)." | "The full trend starts once 12 power-meter rides are 8 weeks old. 5 so far."                      |
| Early trend, no direction                               | "+2% on your first power-meter rides, 1 Sep (−4% to +8%)." | same                                                                                              |
| Under 6 steady rides, or the groups closer than 2 weeks | none                                                       | "2 more power-meter rides with heart rate for an early trend."                                    |
| No steady ride                                          | none                                                       | "No outdoor rides with a power meter and heart rate yet."                                         |
| Only virtual power                                      | none                                                       | same; Details: "Power worked out from speed moves with wind and drafting, so it is not compared." |

"Power-meter rides" replaces "earlier rides" in every ride shortfall line, and the weeks variant says "over 8 different
weeks". The date is the first ride of the first group. Details give both groups' spans and ride counts and the false-trend
figure below. A run's lines are unchanged.

## What the prototype shows

Synthetic riders from `fitness/test/rideSim.ts` (five blocks a ride at 125 to 165 bpm, a ride's day 2%, blocks 3.5%, the
measured 2% wander), 130 weeks, two rides a week unless stated; rides before the meter carry virtual power. 400 libraries
a row for the snapshots, 200 for the weekly replay. "Before" is the core as it is; "after" is rules 1 and 2.

Snapshot at the end of the library (direction = 90% range clear of zero, one evaluation):

| Rider                               | Before                                       | After: estimate median (p10 to p90), half-range            | Direction said |
| ----------------------------------- | -------------------------------------------- | ---------------------------------------------------------- | -------------- |
| Stable, meter 4 weeks               | no trend, "12 more earlier"                  | +0.1% (−3.3% to +3.1%), 7.0%                               | 2%             |
| Stable, meter 12 weeks              | no trend                                     | +0.1% (−3.3% to +4.0%), 5.6%                               | 8%             |
| Stable, meter 12 weeks, 4.4% a ride | no trend                                     | +0.1% (−3.7% to +4.3%), 6.1%                               | 8%             |
| Improving 5% over 12 weeks          | no trend                                     | +3.8% (+0.3% to +7.9%), 5.8%                               | up 27%         |
| Slipping 5% over 12 weeks           | no trend                                     | −3.7% (−6.9% to +0.1%), 5.4%                               | down 26%       |
| Improving 10% over 12 weeks         | no trend                                     | +7.5% (+3.9% to +11.7%), 6.0%                              | up 72%         |
| Meter 20 weeks or more              | monitor                                      | monitor, identical to before                               |                |
| Stable, full history, no spikes     | holding 75%                                  | identical in every library                                 |                |
| One spike on each long ride (half)  | 130 steady rides, holding 61%, imprecise 28% | 260, holding 74%, imprecise 13%                            |                |
| One spike on every ride             | no steady ride                               | 260, holding 74%, slipping or below 8% (no-spike twin: 8%) |                |

The planted 5% change between the groups' median weeks is about 3.75%, so the estimate is unbiased. Shrinking the groups to
3 widened the half-range to 5.4% with one floor (4.5% at 6); growing them to 10 pulled a planted 5% rise down to 2.9%.

Weekly replay over the early period (meter weeks 2 to handover), the false-trend rate on the stable rider:

| Rider, rides a week | Weeks of early trend | Ever told a direction, held 2 weeks | First held direction (median meter week) |
| ------------------- | -------------------- | ----------------------------------- | ---------------------------------------- |
| Stable, 1           | 15                   | 8%                                  |                                          |
| Stable, 2           | 13                   | 7%                                  |                                          |
| Stable, 3           | 14                   | 9%                                  |                                          |
| 5% rise over 16 wk  | 13                   | up 30%                              | 13                                       |
| 5% slip over 16 wk  | 13                   | down 36%                            | 13                                       |
| 10% rise over 16 wk | 13                   | up 73%                              | 12                                       |

The two levers were chosen on this table. With one floor and no hold, a stable rider at three rides a week was told a
direction at some week in 48% of libraries (two a week: 32%). The floor for each group brought that to 26% (14%), the
two-week hold to 9% (7%). A 95% range with one floor and the hold gave 13% (8%) for about the same view of a real change
(a held direction on 32% of 5% rises and 76% of 10% rises).

## False-trend risk

- **Chance.** About 7% to 9% of stable riders are told a held direction at some point in the early period. Details say so:
  "About 1 rider in 12 whose fitness did not change sees an early direction." Without a direction the estimate is printed
  with its range, which is the truth of it.
- **Weather.** The heat term needs two years of runs, so it is off here. A first group in summer and a newest in autumn can
  read a few per cent more power at the same heart rate. Details name it. The monitor's season fit takes over later.
- **The meter.** A new meter's first rides before a zero offset, or a second meter mid-period, read as a step. A rider who
  swaps meters sees it as a change; the data cannot tell them apart.
- **Route and riding.** The ride unit has no steadiness test. A first group of solo rides and a newest of group rides can
  differ. Groups of 6 dilute one odd ride; the clip in `levelOf` holds a far one.
- **Spikes.** A reading the mask missed can move a ride with few in-band blocks. The cap and the median bound it; the spike
  rider above holds at its no-spike twin's rates.

## Acceptance tests (the build pull request's calibration case)

1. Stable rider, meter 24 weeks, 200 libraries, evaluated each week end: ever told a held direction at most 10% at two rides
   a week and at most 12% at one and three.
2. A 10% rise over 16 weeks: a held "up" in at least 65%; a 5% rise or slip: at least 25% in its own direction, and the
   median estimate within 1 point of the planted change between the groups' median weeks.
3. Meter 4 weeks, two a week: an early trend in every library, a direction in at most 3%.
4. One spike on every ride with one block 10 bpm high: the same steady-ride count as the no-spike twin, and its monitor
   states within 5 points of the twin's.
5. A ride with 2 spike flags in an hour of moving time stays out. A ride with a cadence lock or a dropout stays out.
6. Virtual-power rides added to a library change nothing it says.
7. A rider back after 60 weeks away: the first group comes from the return.
8. With a baseline the early trend is absent, and every status matches today's (an identity test on the full-history rider).
9. Copy: each state's lines above, and no ride line says "earlier rides".

The build pull request adds a row to [model-ledger.md](model-ledger.md) with tests 1 to 3's before and after figures.

## Open questions

1. Is "1 in 12 stable riders see an early direction" the right price for seeing a third of 5% changes and three quarters
   of 10% changes, or should the early trend never use a direction word, only the signed estimate and its range?
2. Should runs get the same spike rule? Runs drop a spiked run today. Not measured here.
3. The early trend reads the whole 44 weeks. A rider with a baseline that thins later (a long winter off) gets the monitor's
   `history` shortfall again and then an early trend from the return. That is by design; the reviewer may want it tested.
