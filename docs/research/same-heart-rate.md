# Output at the same heart rate

Status: implemented 2026-10-27 (`packages/core/src/digest/sameHeartRate.ts`, `theilSen.ts`). The model
revision is unchanged: nothing it adds enters a digest, a best effort or a threshold. **Unverified** marks
a citation whose text was not re-read when this note was written.

## 1. Why

Most athletes rarely go all out, so their best efforts barely move. What does move is their submaximal
output at a fixed heart rate: "At 145 bpm you ran 5:52/km this month against 6:10 in September". It is the
one signal built entirely from easy and steady efforts, which is commitment 2 of `docs/VISION.md`: most
efforts are not maximal, and an ordinary effort is evidence in itself.

It is named "output at the same heart rate". It is not called fitness, because heart rate at a given
effort also moves with fatigue, heat, sleep, hydration and caffeine, and the app has no view of those.

## 2. Sources

| Source                                           | Finding used                                                                                                                  | Status                         |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Lamberts et al. 2011, Br J Sports Med 45:797     | In cyclists, power at a fixed submaximal heart rate tracks performance, and a submaximal test can follow training.            | Citation given; **unverified** |
| Buchheit 2014, Front Physiol 5:73                | A submaximal heart-rate measure is to be judged against its own measurement error, so a change counts only when it clears it. | Citation given; **unverified** |
| Hammes et al. 2016, Int J Sports Physiol Perform | Output at a fixed heart rate can rise with the fatigue of overreaching. A rise is therefore not always a gain.                | Citation given; **unverified** |

The first supports the signal, the second the rule for claiming a change, and the third its limit.

## 3. Method

Parameters are in `SAME_HEART_RATE` (`packages/core/src/constants.ts`), the one source.

- **Blocks.** A digest keeps `hrBlocks`: 5-minute blocks of steady effort taken after the first 10
  minutes of an activity (`HR_BLOCK_S`, `HR_SKIP_S`), each with its mean heart rate and output.
- **What counts.** Outdoor runs, whose output is the flat speed that costs the block's metabolic power
  (the running economy prior's mean), and rides with a power meter, whose output is the measured watts.
  Treadmill pace and estimated watts can be what is wrong, so they are left out, and so is any activity
  whose heart rate is set aside (`AnalysisResult.heartRateSetAside`). A run block faster than the world
  record ceiling for five minutes, or under twice resting power, is left out as the heart-rate check leaves it.
- **Weeks.** One point for each Sunday (UTC, as the trend's weeks end), from the first whose 28-day window
  lies inside the period to the last, at most the newest 52. The window is the 28 days to the Sunday.
- **Reference heart rate.** Fixed per sport for the whole period: the median block heart rate of the
  blocks in the weeks shown, rounded to 5 bpm. A week reports only when the reference lies inside the
  heart rate range its window observed. There is no extrapolation.
- **Fit.** Output on heart rate by Theil-Sen: the median of the slopes between every two blocks at
  different heart rates, and the median of what each block says the output is at the reference along that
  slope. Both medians resist a few wild blocks. A window of more than 48 blocks contributes 48, taken at even
  steps through time, so the cost is bounded.
- **A week needs** 8 blocks, from 4 activities, in 2 different weeks, with a heart rate standard deviation
  of 5 bpm or more. Without spread, output cannot be told apart from the heart rate it is read at.
- **Interval.** The activities are resampled, not the blocks, since one activity's blocks share its day:
  200 draws with `mulberry32`, seeded from the week, so a week reads the same in any period. The interval is
  the 5th to the 95th percentile of the draws, which is 90%. A pair of blocks weighs the product of
  the counts of their activities, so each draw is a weighted median over the same sorted slopes.
- **A real change.** The first and the last reporting week give the change. It is real only when their 90%
  intervals do not overlap. Otherwise the output "has held, within the error".

## 4. Checks

- A synthetic ride and a synthetic run, with output at a fixed heart rate rising 5% over the 7 weeks between the
  middle of the first window and the middle of the last, read as a real change of 4% to 6%.
- The same library with noise only gives no real change. Over 40 seeds of 3% noise, one gave a false change,
  which is about what 90% intervals allow when two are compared.
- A set-aside activity, a treadmill run and a virtual-power ride are not used: adding them changes nothing.
- The answer is the same twice, and whatever order the digests arrive in.

## 5. Limits

- **Fatigue and overreaching.** Hammes et al. found output at a fixed heart rate can rise with
  overreaching fatigue. The page says a rise can come with fatigue as well as with training.
- **Heat, hydration, caffeine, sleep, altitude.** They move heart rate at a given effort. They are not
  modelled, so a change over a few weeks is more trustworthy than one between two hot and cool weeks.
- **Cardiac drift.** The first 10 minutes are skipped, but a long block late in an effort sits higher in
  heart rate than an early one at the same output. Blocks of one activity share its drift.
- **A short period.** The windows lie inside the period, so a 6-week period reports about two weeks. A
  sport whose steady stretches stop within 4 weeks of the period's start reports none.
- **A run's output is its flat speed.** Hills, wind and surface are not in it. The model prices the gradient,
  not the wind or a soft surface.
- **No comparison between athletes or sports.** The reference heart rate is the athlete's own, and each
  sport is read in its own unit (commitment 5).
