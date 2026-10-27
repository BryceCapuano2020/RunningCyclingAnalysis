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
  lies inside the period to the last, at most the newest 52. The window is the 28 days to the Sunday. For
  all time, which has no start, the first week is that of the first full 28 days, so no week is read from a
  shorter window.
- **Reference heart rate.** Fixed per sport for the library: the median heart rate of its newest 52 weeks
  of blocks (not set aside), rounded to 5 bpm, so choosing another period does not move it. Activities
  outside the period are not judged for set-aside, so a faulty sensor outside it can enter the median. A week reports only when the reference lies inside the
  heart rate range its window observed. There is no extrapolation.
- **Fit.** Output on heart rate by Theil-Sen: the median of the slopes between every two blocks at
  different heart rates, and the median of what each block says the output is at the reference along that
  slope. Both medians resist a few wild blocks, and an even number of values gives the mean of the two
  middle ones. A window of more than 48 blocks is thinned by activity: at most 24 activities, spread through
  the window, each keeping an equal share of the 48 blocks, spread through its own. The fit then spans the
  whole window, and the minimums are judged on the blocks it takes.
- **A week needs** 8 blocks, from 6 activities, in 2 different weeks, with a heart rate standard deviation
  of 5 bpm or more. Without spread, output cannot be told apart from the heart rate it is read at.
- **Interval.** The activities are resampled, not the blocks, since one activity's blocks share its day:
  200 draws with `mulberry32`, seeded from the week, so the draws of a week are the same in any period (its
  reference heart rate is the library's, so it reads the same too unless the library changes). A percentile
  interval of the draws covered the true output only 74% to 82% of the time with four activities, so the 90%
  interval is the output plus and minus the draws' standard deviation, scaled by the square root of n over
  n - 1 for n activities and read on Student's t with n - 1 degrees of freedom. It is centred on the
  output. A pair of blocks weighs the product of the counts of their activities, so each draw is a weighted
  median over the same sorted slopes. Simulated outputs with a 2% spread between activities and 2% between
  blocks are covered by it about 90% of the time (91%, 90% and 92% for 2, 4 and 8 activities a week).
- **A real change.** The first and the last reporting week give the change. It is real only when their 90%
  intervals do not overlap. Otherwise the page says there is no clear change, and with fewer than 4
  reporting weeks that there are too few weeks to say.

## 4. Checks

- A synthetic ride and a synthetic run, with output at a fixed heart rate rising 5% over the 7 weeks between the
  middle of the first window and the middle of the last, read as a real change of 4% to 6%.
- The same library with noise only gives no real change. Of the libraries that report, with a 2% spread
  between activities and 2% between blocks and 8 to 20 weeks, a false change was said in 1 of 180 with two
  activities a week, 2 of 180 with four, and 0 of 161 with a quarter of two a week skipped, so that windows
  sit near the minimum of 6 activities. One a week never reports. The test holds this under 5%.
  The earlier percentile interval with a minimum of 4 gave 8 in 100 at one a week.
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
