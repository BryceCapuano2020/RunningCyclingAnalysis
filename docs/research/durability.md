# Durability and steady-effort drift

Status: evidence implemented 2026-10-28 in `packages/core/src/digest` (`distributions.ts`,
`durability.ts`, `drift.ts`), inside model revision 6. The sport pages show it as "Late in long
sessions" (docs/DESIGN.md). Both citations below were
checked against the publisher or Crossref record; the 5% rule of thumb was seen in summaries of Friel's article but
is a coaching convention, not a measured threshold.

## 1. Why

A best effort says what an athlete can do fresh. Many events are decided by what they can still do
after hours of work. Maunder et al. (2021) call the time of onset and the size of the decline in a
physiological or performance measure during prolonged exercise **durability**, and argue that profiling
without it misses a separate trait. The digest therefore keeps two kinds of evidence from ordinary
files: the best output late in a long effort, and how output per heart rate changed within a steady one.
It also keeps moving-time distributions of heart rate, power and speed, so zones can be applied to
them later without keeping the stream.

## 2. Sources

| Source                                                                                                                                                                                                      | Finding used                                                                                                                                                           | Status                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Maunder E, Seiler S, Mildenhall MJ, Kilding AE, Plews DJ. The importance of "durability" in the physiological profiling of endurance athletes. Sports Med 2021;51:1619-1628. doi:10.1007/s40279-021-01459-0 | Profiling should quantify when, and by how much, a characteristic deteriorates during prolonged exercise. Output after prolonged work is the performance form of this. | Verified (Crossref)                                      |
| Friel J. Aerobic endurance and decoupling. TrainingPeaks blog (`trainingpeaks.com/blog/aerobic-endurance-and-decoupling/`)                                                                                  | Pa:Hr (pace) and Pw:Hr (power) compare output per heart rate in the first and second half of a steady effort. A fall of under 5% is read as well-developed endurance.  | Seen in search results, not read in full; web convention |

## 3. Method

Constants are in `packages/core/src/constants.ts` (`DISTRIBUTION_BINS`, `DURABILITY_AFTER_S`,
`DURABILITY_DURATIONS_S`, `DRIFT`), the one source.

- **Moving time.** Seconds the device was recording: not paused and not in a record gap (`movingMask`).
  A sample counts only when it is also valid by the quality masks.
- **Distributions.** Seconds per bin over moving, valid samples, stored sparsely as an offset and the
  counts from the first to the last used bin. Heart rate in 1 bpm bins; measured power of rides with a
  power meter in 5 W bins; run speed in 0.05 m/s bins. A ride without a power meter keeps no power
  distribution, because its watts are an estimate and an estimate is never counted as a reading. Zones
  are applied when the digests are combined, so they can change without re-digesting.
- **Durability.** For each start time of 1, 1.5 and 2 hours of moving time, the best output over 5 and
  20 minutes among windows that start at or after the second that moving time is reached. Output is the
  main curve's: gross metabolic W/kg for runs, measured watts for rides, scored over elapsed seconds with
  the same validity masks, so a pause inside a window counts as rest. A point the activity
  cannot support is left out.
  Rides without a power meter keep none: their curve holds climbs only and is priced at combine time with
  a bike model, which is not a measurement of late-ride output. A run point above the world-record ceiling
  is dropped when digests are combined, as in the main curve.
- **Drift.** For an activity with at least 60 minutes of moving time and a heart-rate stream, the first
  10 minutes of moving time are left out as warm-up. The rest, in whole 30 s blocks, is split into two
  halves of equal moving time. Each block is the mean output and mean heart rate over its valid seconds
  (at least 80% of them). Each half needs 80% of its blocks. The ratio of a half is its mean output over its
  mean heart rate; the result is `{ firstRatio, secondRatio, durationS }`, null when the effort does not
  qualify. Decoupling in percent is `(first - second) / first * 100`, as in Pa:Hr and Pw:Hr.
- **Steady.** The effort qualifies only when its block outputs have a coefficient of variation of at most
  0.15 for runs and 0.25 for rides, and the mean outputs of the two halves are within 10% of each other,
  so that the change in the ratio is the heart rate's and not a change of pace. These limits are this
  app's choice, not taken from a source: runs vary less than outdoor rides, which coast.

## 4. Limits

- Heart rate at a given output also moves with heat, hydration, caffeine, fatigue and sensor quality, so
  drift is not fitness. It is shown as an observation, never ranked or scored.
- A tolerance on outputs cannot tell a steady effort from a lucky average. A rolling course with equal
  halves can pass the test and still not be steady; the coefficient of variation limits this.
- Durability points describe what the athlete did, not what they could have done. A low late value can
  mean they were not trying. The period view should say how many activities support each number.
