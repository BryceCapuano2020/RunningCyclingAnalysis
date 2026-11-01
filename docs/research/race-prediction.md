# Race prediction: method and evidence

The Run page predicts the 5 km, 10 km, half marathon and marathon (`packages/core/src/predict/`). Each race
sits in the middle of two estimates that read the way the two common predictors read:

- **an app's:** from the races and hard efforts already run;
- **a watch's:** from a VO2max worked out of heart rate against pace.

The first tends slow and the second fast. The prediction is their geometric mean, and the range is built
from published errors, not from the two estimates' spread alone.

## The two sources

- **From your runs:**
  - The anchors are the best time at each record distance in the period (the mile, 5 km, 10 km and half
    marathon), as run, not adjusted for hills.
- **From heart rate:**
  - **One estimate per run:** each outdoor run with trusted heart rate gives one, from its longest best
    window of 10 min or more, the one held at the highest share of the running reference heart rate.
  - **Oxygen cost:** the window's flat-equivalent pace gives Daniels' oxygen cost, VO2 = −4.60 +
    0.182258 v + 0.000104 v², with v in m/min.
  - **Share of VO2max:** its heart rate gives the share of VO2max by Swain et al. (1994, Med Sci Sports
    Exerc 26:112): %HRmax = 0.64 × %VO2max + 37.
  - **VO2max:** cost over share, with the median over runs weighted by how hard each window was (at least two
    runs at or over 85% of the reference, as it always was).
  - **Anchors:** the 5 km and 10 km this VO2max would run, by Daniels & Gilbert's formula (Oxygen Power,
    1979), which reproduces the VDOT table to 0.5% (`daniels.test.ts`).
  - **Why a ramp:** a window held under 85% of the reference counts for nothing, one on the line counts for half,
    one at 90% or more counts in full, and between them it counts by a straight line (`vo2maxShare.ts`). Below the
    line the intercept of Swain's relation is a larger part of the estimate and its error grows; near the maximum heart
    rate plateaus. A hard cut at one share moved the estimate, and every race time carried from it, in one step when
    a run drifted across the line or the reference moved a beat; the ramp moves it with them. Whether there is an
    estimate is the old rule: two runs at or over the line, and "on N hard runs" counts them.

**The hill cap.** A window of 10 min or more cannot be faster on the flat than the runner's fastest mile
as run. When a window's flat-equivalent pace is, the grade model has inflated it on hills, so that run is left
out of the heart-rate side, and the note says how many were. On one multi-year library the cap lowered the heart-rate
VO2max over 12 weeks to match its 12-month figure.

## Carrying anchors to races

Both sources' anchors are carried the same way, so they differ only in what they rest on.

- **5 km, 10 km and half marathon:**
  - The anchors are carried by Riegel's law, t2 = t1 × (d2/d1)^1.07. The 1.06 exponent is Riegel's 1977
    figure; Vickers & Vertosick (2016, BMC Sports Sci Med Rehabil 8:26) found 1.07 well calibrated up to
    the half in 2,303 recreational runners.
  - The anchors within about three times the race's distance are carried (`RIEGEL_MAX_RATIO`), and their
    times are averaged in log time, each weighted by how near its distance is to the race's (a normal in the
    log of the ratio, a ratio of two counting for about 0.6). Taking the fastest implied time instead read
    every best as all-out; a forward test of the old rule found it optimistic, and the bias larger the
    further the anchor from the race.
  - A prediction is never slower than the athlete's own best at that distance among the bests it rests on:
    a time already run is a floor, and the range moves with it. A recorded best slower than the top of the
    range is named on the row, since the race was carried from other distances.
- **Marathon:**
  - Vickers & Vertosick's model 1, speed = 0.16018617 + 0.83076202 × v_Riegel + 0.06423826 × (miles per
    week / 10), applied to each anchor within 4.5 times the marathon's distance (10 km up, since the
    correction is fitted to that reach) and averaged with the same distance weights.
  - It corrects Riegel, which ran about 10 min fast at the median, for training volume.
  - The weekly distance is the running distance in the eight weeks ending with the newest run, per week
    (`volume.ts`).

## The range

- **What it shows:** the 10th to 90th percentile of a log-normal around the prediction.
- **Its standard deviation:** the race's published error combined with half the two sources' log
  disagreement.
- **The published errors:** the marathon's 0.07 is Vickers & Vertosick model 1's validation error, about
  15 min at 3:40. The shorter races' values (0.04, 0.045, 0.055) are a judgement scaled with distance, since
  no comparable recreational validation was found.
- **When the sources disagree** by more than 10% in VO2max terms, the page says which points higher and
  that an all-out 5 km would show which is nearer.

## Known limits

- **The marathon is not a record distance:** the digest keeps bests at the mile, 5 km, 10 km and half
  marathon, so a marathon run is not kept as a best to compare with. Adding it changes the digest, so it
  waits for a revision.
- **The reference heart rate:** it is the highest on file in the period, not a tested maximum. A spike
  raises the heart-rate VO2max, and an easy period lowers it.
- **Hills:** the flat-equivalent pace leans on a grade model whose downhill correction is unvalidated. The
  hill cap removes the worst windows, but a hilly window slower than the fastest mile still counts.
- **Recency:** bests count only within the period on screen; they are not weighted.
- **Models left out:** Tanda (2011) and Smyth & Muniz-Pumares' marathon fraction of critical speed were not
  used. Tanda was fitted on 40–111 km a week, outside many recreational runners' range, and Smyth's
  fraction is reported only by finish time, so it would be circular as a predictor.
