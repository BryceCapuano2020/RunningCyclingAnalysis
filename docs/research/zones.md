# Training zones

Status: implemented 2026-10-28 (`packages/core/src/zones/`). Nothing here enters a digest, a best effort
or a threshold, so the model revision is unchanged. **Unverified** marks a citation whose book text was not
re-read when this note was written; the zone edges were checked against the pages listed in section 3.

## 1. Why

A zone turns one number the athlete knows (threshold power, maximum heart rate, threshold pace) into
ranges they can train and read activities against. The app shows them on Profile and offers them to
features that need them, such as time in each zone, through `zonesAt(date)`.

The app does not invent a scheme. Each measure uses one published scheme, whose edges are constants in
`packages/core/src/zones/schemes.ts`, the one source.

## 2. Schemes

Cuts are multiples of the reference. n cuts make n + 1 zones. Each zone starts where the one below ends, so
every reading falls in one zone: the lowest zone starts at 0 and the highest has no upper limit.

| Measure | Reference                  | Zones | Cuts                             | Source                                                        |
| ------- | -------------------------- | ----- | -------------------------------- | ------------------------------------------------------------- |
| Power   | Ride threshold power, W    | 7     | 55, 75, 90, 105, 120, 150% of it | Allen and Coggan, _Training and Racing with a Power Meter_    |
| Heart   | Maximum heart rate, bpm    | 5     | 60, 70, 80, 90% of it            | Edwards 1993, _The Heart Rate Monitor Book_; names from Polar |
| Pace    | Run threshold pace, as m/s | 5     | pace at 129, 114, 106, 99% of it | Friel, _The Triathlete's Training Bible_ (4th ed., VeloPress) |

- **Power.** Coggan's seven levels: active recovery, endurance, tempo, lactate threshold, VO2max, anaerobic
  capacity and neuromuscular power. His table gives whole percents (below 55, 56-75, 76-90, 91-105,
  106-120, 121-150, above 150), and TrainingPeaks prints the same edges as 55-74, 75-89, 90-104 and so on.
  Both put the edges between zones at 55, 75, 90, 105, 120 and 150%, which is what the app uses.
- **Heart rate.** The five zones of 50-60, 60-70, 70-80, 80-90 and 90-100% of maximum, named very light,
  light, moderate, hard and maximum (Polar's names). The first zone also takes readings under 50%, so a
  reading is never outside every zone.
- **Pace.** Friel writes running pace zones as a percent of threshold pace, where more than 100% is
  slower: zone 1 slower than 129%, zone 2 114-129%, zone 3 106-113%, zone 4 99-105% and zone 5 faster than
  99%. Friel splits zone 5 into 5a, 5b and 5c by effort length (97-100%, 90-96%, under 90%); the app keeps
  one zone, since its boundaries overlap zone 4 as published and the split is for session design, not
  for reading an activity. Pace is stored as a speed in m/s, so a cut at p% of threshold pace is the
  threshold speed times 100 / p. Names are Friel's: recovery, aerobic, tempo, sub-threshold, and above
  threshold for the joined zone 5.

## 3. Where the reference comes from

A reference is one of two things, and the zone set says which.

- **You entered** (`source: 'entered'`). A dated setting (`maxHeartRate` per sport, `thresholdPower` for
  rides, `thresholdPace` for runs). The entry in effect on the local date applies; before the first entry the
  earliest applies. See the policy in `docs/DESIGN.md` and on the Method page.
- **From your rides** or **from your runs** (`source: 'estimated'`). The app's own figures for the period on
  screen: the critical-power fit (a run's flat speed, or a ride's metabolic W/kg turned into watts at
  the body mass in effect on that date) and the reference heart rate of each sport
  (`AnalysisResult.rideMaxHeartRate`, `runMaxHeartRate`). An estimate the analysis refuses, such as a
  threshold with too few efforts, gives no zones. Zones are never made from a guess.

Critical power is the app's threshold estimate, not a 20 minute test or a lactate test, so power and pace
zones from it are an estimate. An entered threshold replaces it.

Sources checked on 2026-10-28:

- Coggan seven levels and edges: https://biketips.com/coggan-power-zones/ and
  https://www.trainingpeaks.com/learn/articles/joe-friel-s-quick-guide-to-setting-zones/
- Friel running pace zones: https://www.trainingpeaks.com/learn/articles/joe-friel-s-quick-guide-to-setting-zones/
  (percent of threshold pace by zone).
- Polar five zones and names: https://www.polar.com/us-en/guide/heart-rate-zones

Books (citations as given, **unverified** against the book text): Allen H, Coggan A, _Training and Racing
with a Power Meter_, VeloPress; Edwards S, _The Heart Rate Monitor Book_, Fleet Feet Press, 1993; Friel J,
_The Triathlete's Training Bible_, 4th ed., VeloPress, 2016.

## 4. Limits

- Maximum heart rate zones move with a reference that is itself an estimate, and with age, heat and
  sleep. The app's reference is the highest sustained heart rate on file, not a lab value.
- Zones do not rate ability. They do not enter the age grade, the level or the Balance.
- A threshold estimated from a different period gives different zones; the Profile page shows the period
  the analysis on screen covers.

## 5. Time in zones

Status: implemented 2026-10-28 (`packages/core/src/zones/timeInZones.ts`, `traceZones.ts`, `periodTime.ts`,
`zoneShares.ts`). Nothing here enters a digest, so the model revision is unchanged. The page copy is in
`docs/DESIGN.md` under Time in zones.

- **From a digest.** A digest keeps moving seconds in bins (`DISTRIBUTION_BINS`: 1 bpm, 5 W, 0.05 m/s). The zones in effect
  on the activity's local date cut those bins. A reading is in the zone it is at or above the floor of and below the ceiling of.
  Heart rate and measured power are whole numbers, so `zonesFor` cuts their zones on whole-number edges, the first whole number
  at or above the cut (0.6 of 219 bpm is 131.4, so the zone above starts at 132; 0.55 of 201 W is 110.55, so 111 W). A bin of them
  holds whole numbers (one beat, or five watts) and is shared by them: 110 to 114 W with an edge at 111 W has one watt below
  and four above, so a fifth and four fifths of its seconds, and a one-beat bin is never split. This agrees with the trace
  below and with the Profile ranges, which are written from the same edges. Speed is not a whole
  number, so a bin that straddles an edge is split in proportion to the width each side, as if its seconds were spread evenly
  across it; the error is under 0.05 m/s of moving time at each edge. Every second is kept either way.
- **From a trace.** The activity page reads the recorded stream second by second, so there is no bin to split. A reading
  on an edge is in the zone the edge opens (`low <= reading < high`), as in the Profile ranges ("138-187 W", "375 W or more").
  It reads the trace as recorded, not as the plots read it: a run's seconds slower than 0.5 m/s have no pace in the plots, but
  the digests count them (they are moving, not paused), in the lowest pace zone, so the trace counts them there too and a
  whole-activity interval agrees with the sport page.
- **A period** adds the activities up zone by zone, each cut by its own zones, so zones that changed during the period
  are applied on the dates they were in effect. Zones are summed by level, which every date shares. A period is compared
  with the one before it in the same estimated zones, because the references of an analysis belong to the period on
  screen; entered settings are dated, so they apply on their own dates in both. When an entered setting changed between
  the periods (`MeasureTime.enteredReferences` differ), the zones moved, so a change in shares could be the zones and not the
  athlete: no change is claimed and the page says the zones changed. An estimated reference is the same in both, and a
  dated weight moving an estimated ride threshold is the app's own figure, so neither stops the comparison.
- **Left out.** An activity is counted for a measure only with a distribution of it (digests from before distributions were
  kept have none), zones in effect on its date, and, for heart rate, a sensor the analysis did not set aside. The set-aside is
  one judgement over every visible activity (`heartRateSetAsideOf`, the analysis' own rule without the rest of it), so the period
  before is read by the same rule as the one on screen and an activity page agrees with the sport page. It is a judgement of the
  data, not of a period: it is made once, with the bike model fitted over all visible activities, and each period's analysis takes it,
  restricted to its own activities. A period judged alone can differ (a period with no calibrated rides prices rides with the
  default bike model), which is why none is. The page counts
  a set-aside heart rate apart from one that was never recorded. Power is
  counted from a power meter only, since a digest keeps no distribution for estimated watts. The page says how many
  activities each measure left out.
- **Easy and hard.** Easy is zones 1 and 2 and hard is zone 4 and up, for every measure: Coggan's active recovery and
  endurance against lactate threshold and above; Edwards's very light and light against hard and maximum; Friel's recovery and
  aerobic against sub-threshold and above threshold. These are the app's grouping for one sentence, not a published
  scheme, so the sentence names the zones.
- **Limits.** Time in zones inherits the limits of section 4. Estimated zones move with the analysis, so the same
  activity can sit in a different zone after a period change. It does not grade ability.
