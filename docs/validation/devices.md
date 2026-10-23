# FIT importer against real device files

This checks the FIT importer on 25 real FIT files and 6 python-fitparse CSV decodings. The files are
from [python-fitparse](https://github.com/dtcooper/python-fitparse) (MIT, commit `d88bb6997138`) and
live in `packages/core/test-corpus/fitparse/`. The checks are in
`packages/core/src/corpus/fit.corpus.test.ts`:

```
npx vitest run --project core packages/core/src/corpus/fit.corpus.test.ts
```

The test has three parts. Each file's verdict is pinned, so a change to any file shows up.
The protocol decoder is compared with the CSV record by record. The pipeline output is compared
with each device's own session summary.

Devices are named from each file's `file_id` manufacturer and product number. Where the number is
not a known Garmin model, it is given as the number.

## Per-file results

Differences are ours minus the device's, in the units shown. Percentages are of the device value.
"n/a" means the device summary has no such field, or the file has no such sensor.

| File                                                       | Device (file_id)                  | Sport            | Verdict                                                | Distance                 | Timer             | Mean HR       | Mean power |
| ---------------------------------------------------------- | --------------------------------- | ---------------- | ------------------------------------------------------ | ------------------------ | ----------------- | ------------- | ---------- |
| 2013-02-06-12-11-14.fit                                    | Garmin, product 1124              | running          | ok: run, 2625 samples                                  | 0.000%                   | -0.1 s            | +1.9 bpm      | n/a        |
| 2015-10-13-08-43-15.fit                                    | Garmin, product 1325              | cycling          | ok: ride, 1624 samples                                 | 0.000%                   | -0.2 s            | n/a           | n/a        |
| 20170518-191602-1740899583.fit                             | Garmin, product 2337              | indoor rowing    | rejected: unsupported sport                            | n/a                      | n/a               | n/a           | n/a        |
| 2019-02-17-062644-ELEMNT-297E-195-0.fit                    | Wahoo ELEMNT (product 28)         | cycling          | ok: ride, 23592 samples                                | -0.003%                  | 0.0 s             | +0.2 bpm      | -0.3%      |
| Edge810-Vector-2013-08-16-15-35-10.fit                     | Garmin Edge 810 (product 1567)    | cycling          | ok: ride, 4700 samples                                 | -0.005%                  | -0.05 s           | -0.1 bpm      | -0.2%      |
| activity-large-fenxi2-multisport.fit                       | Garmin fenix 2 (product 1967)     | run, run, ride   | ok: run 2295, run 6765, ride 3212                      | -0.045%, 0.000%, -0.003% | +0.2, +0.5, 0.0 s | n/a           | n/a        |
| activity-settings-corruptheader.fit                        | manufacturer 15, product 1        | not known        | rejected: shorter than one minute (13.7 s)             | n/a                      | n/a               | n/a           | n/a        |
| activity-small-fenix2-run.fit                              | Garmin fenix 2 (product 1967)     | running          | ok: run, 2834 samples                                  | -0.013%                  | +2.0 s            | n/a           | n/a        |
| activity-unexpected-eof.fit                                | manufacturer 15, product 1        | not known        | rejected: file incomplete or corrupt                   | n/a                      | n/a               | n/a           | n/a        |
| compressed-speed-distance.fit                              | Garmin, product 1436              | cycling          | rejected: records have device time only, no date       | n/a                      | n/a               | n/a           | n/a        |
| coros-pace-2-cycling-misaligned-fields.fit                 | COROS PACE 2 (product 802)        | cycling          | ok: ride, 12719 samples                                | -0.006%                  | -5.0 s            | n/a           | n/a        |
| developer-types-sample.fit                                 | manufacturer 95                   | running          | ok: run, 3424 samples                                  | 0.000%                   | -1.0 s            | n/a           | +0.3%      |
| elemnt-bolt-no-application-id-inside-developer-data-id.fit | ELEMNT BOLT (product 31)          | cycling          | ok: ride, 132 samples                                  | -0.79%                   | 0.0 s             | n/a           | +2.3%      |
| event_timestamp.fit                                        | Garmin, product 2158              | swimming         | rejected: unsupported sport                            | n/a                      | n/a               | n/a           | n/a        |
| garmin-edge-500-activity.fit                               | Garmin Edge 500 (product 1036)    | cycling          | ok: ride, 12692 samples                                | 0.000%                   | -0.1 s            | +0.9 bpm      | n/a        |
| garmin-edge-820-bike.fit                                   | Garmin Edge 820 (product 2530)    | cycling          | ok: ride, 66 samples                                   | 0.000%                   | +1.5 s            | -0.4 bpm      | n/a        |
| garmin-fenix-5-bike.fit                                    | Garmin fenix 5 (product 2697)     | cycling          | ok: ride, 62 samples                                   | 0.000%                   | +1.6 s            | -0.4 bpm      | n/a        |
| garmin-fenix-5-run.fit                                     | Garmin fenix 5 (product 2697)     | running          | rejected: shorter than one minute (56.9 s)             | n/a                      | n/a               | n/a           | n/a        |
| garmin-fenix-5-walk.fit                                    | Garmin fenix 5 (product 2697)     | walking          | rejected: unsupported sport                            | n/a                      | n/a               | n/a           | n/a        |
| nick.fit                                                   | manufacturer 70, product 46       | not known        | rejected: corrupt (checksum; data ends mid-message)    | n/a                      | n/a               | n/a           | n/a        |
| null_compressed_speed_dist.fit                             | manufacturer 260, product 0       | cycling, virtual | ok: ride, indoor, 1808 samples                         | 0.000%                   | 0.0 s             | n/a (HR 0)    | -0.1%      |
| sample-activity-indoor-trainer.fit                         | Garmin, product 1169              | cycling          | ok: ride, 2264 samples, indoor                         | 0 m (ours 0 m)           | +2.2 s            | -0.3 bpm      | -1.6%      |
| sample-activity.fit                                        | Garmin Edge 500 (product 1036)    | cycling          | ok: ride, 11742 samples                                | 0.000%                   | -0.4 s            | -0.1 bpm      | n/a        |
| sample_mulitple_header.fit                                 | Garmin, product 1765              | swim, ride, run  | ok: ride 4420, run 2851 (swim and transitions skipped) | +0.012%, 0.000%          | -2.1, +0.3 s      | -0.2, 0.0 bpm | n/a        |
| strava-android-app-201.10-b1218918.fit                     | Strava Android (manufacturer 265) | running          | rejected: file incomplete or corrupt (byte 7472)       | n/a                      | n/a               | n/a           | n/a        |

Sensor flags for each accepted activity (power, heart rate, altitude, indoor) and the sample count
are pinned in the test's expectation table. Samples with a `paused` flag are not counted as timer.

The tolerances, each justified in the test's comments:

- Distance within 1%. This compares the last cumulative sample with the device's session total.
- Timer within the larger of 10 s and 2%. The device and the 1 Hz grid can place a pause edge a second or two apart.
- Mean heart rate within 2 bpm, over the same non-paused samples.
- Mean power within 3%, on the device's convention. FIT `avg_power` is `total_power /
total_timer_time`, so a timer second with no power value counts as zero. Our grid interpolates
  gaps of up to 10 s, so the test puts those zeros back. Over the corpus in total, the mean with
  zeros is closer to the device than the mean without them. Per file this is not always so: the
  indoor trainer's device value lies between the two.

## Differential decode against python-fitparse

Six `*-records.csv` files (the brief said five) were compared record by record with `decodeFit`
(not the resampled pipeline).

| CSV                                   | Rows  | Compared fields                                                          | Worst difference                        | Mismatches |
| ------------------------------------- | ----- | ------------------------------------------------------------------------ | --------------------------------------- | ---------- |
| compressed-speed-distance-records.csv | 754   | timestamp, heart rate, speed, distance (no altitude or position columns) | speed 0, distance 0                     | 0          |
| garmin-edge-500-activity-records.csv  | 10686 | timestamp, heart rate, speed, distance, altitude, position               | speed 0, distance 0, altitude 5.7e-14 m | 0          |
| garmin-edge-820-bike-records.csv      | 15    | as above                                                                 | 0                                       | 0          |
| garmin-fenix-5-bike-records.csv       | 19    | as above                                                                 | 0                                       | 0          |
| garmin-fenix-5-run-records.csv        | 21    | as above                                                                 | 0                                       | 0          |
| garmin-fenix-5-walk-records.csv       | 17    | as above                                                                 | 0                                       | 0          |

The tolerances are the FIT field resolution, or half the last digit the CSV prints, and never wider:
speed 0.0005 m/s, distance 0.005 m, altitude 1e-6 m. Timestamps, heart rate and positions must be
exact. Cadence and temperature are not decoded and so are not compared.

Two differences between python-fitparse's CSV and our records are expected, and the test asserts
both counts:

- `compressed-speed-distance`: the first FIT record holds only a timestamp. The CSV starts at the
  second record.
- `garmin-edge-500-activity`: nine records have no position field. The CSV repeats the previous
  position in them. Our decoder leaves them without a position, which is the file's content.

All 11,512 rows agree on timestamp (exact FIT seconds), and the rest agree within the tolerances.

Differences that looked like mismatches at first and were not decoder bugs:

- Matching the CSV by timestamp is needed. The Edge 500 file has 15 timestamps that repeat, and an
  earlier matcher picked the wrong record for them.
- The compressed-speed file's timestamps are system times (below 2^28 seconds), which have no date.
  The Garmin SDK cannot read compressed timestamps at all, so it is not a reference for that file.
  The CSV's raw values agree with our `timestampS` exactly.

## Bugs found and fixed

Each fix has a test in the owned area. Where a test's existing expectation encoded the wrong
behaviour, it was changed, and the reason is given here.

1. **Compressed speed and distance were not decoded** (record field 8, three bytes). Records that
   carried only that field had no speed or distance, so the compressed-speed file's distance was
   zero. The reader now keeps byte-array fields, and the decoder reads the 12-bit speed and
   distance counter the way the FIT SDK does, including its 4096 wrap. Tests:
   `decodeFit compressed speed and distance` in `fit/protocol/decode.test.ts`.
2. **Session timer time, distance and averages were not read.** The decoder now exposes
   `totalTimerTime`, `totalDistance`, `avgHeartRate` and `avgPower`, and each record's raw
   `timestampS`. Test: `decodeFit timestamps and session totals` in `decode.test.ts`. The SDK
   differential test's session view was extended to match.
3. **A later session in a multi-session file carried the device's running distance.** The
   triathlon file's run reported 52,534 m instead of 9,806 m, and the ride included the swim and
   transition (+1,786 m). A unit's distance is now measured from the device's distance at the end
   of the previous record. A single session keeps the device's own count, so its total matches the
   device's. Tests: `counts a session from where the previous one ended`, `keeps the distance a
device counted before its first record`, and `does not subtract a counter that went back` in
   `fit/parse.test.ts`. The round-trip fixture in the same file now starts its distance at zero.
4. **Records with only device time were reported as "Activity is shorter than one minute"**. Such
   a file (compressed-speed) is now reported as "Records have no date, only device time". Test:
   `says records with only device time have no date, not that the ride is too short`. The existing
   test `skips records without a timestamp when counting samples` expected the old, misleading
   reason; it now expects the new one.
5. **Sparse recordings were rejected as shorter than a minute.** The Edge 820 ride (64.5 s, 15
   records) and the fenix 5 bike ride (60.4 s, 19 records) were refused because the gate counted
   records. Every format's unit is now measured by the seconds its records cover, each gap counted
   up to the 10 s the resampler bridges (see 7 for longer gaps). Tests:
   `accepts a minute of activity recorded every five seconds` in `fit/parse.test.ts`, and
   `accepts a sparsely recorded track by the seconds its records cover, in any format` in
   `import/pipeline.test.ts`.
6. **A trainer ride with altitude noise was labelled outdoor.** `sample-activity-indoor-trainer.fit`
   has no position and no speed, and its altitude varies between 0 and 4 m. The file declares no
   indoor sub-sport (its session is `generic`), so the signal comes from the samples. A cycling unit
   with no position is now indoor when it has power, its altitude spans under 10 m, and it is under
   0.5 m/s for at least 95% of its recorded time, where paused time is not counted. A missing speed
   counts as stopped, so the altitude test keeps a powered outdoor climb with no GPS and no speed
   sensor outdoor. Tests: `marks a trainer ride with altitude noise, no speed and power indoor` in
   `fit/parse.test.ts`, the unit tests in `import/pipeline.test.ts` under `indoor inference for units
without positions`, and this file's expectation in the corpus test.
7. **Records far apart counted as riding.** A gap longer than 10 s is a pause, but the minimum-length
   rule credited it as 10 s, so seven records an hour apart passed as a six-hour activity. Each
   longer gap now credits one second, and a segment needs a minute of recorded (not paused) seconds.
   Tests in `import/pipeline.test.ts`: `refuses seven records an hour apart, which cover seven
seconds and not six hours`, and `refuses a ride with an hour-long pause and only 59 seconds of
riding`.
8. **A session whose first record had no distance kept the device's total.** Its distance then
   carried the earlier sessions' metres. The origin is now the device's running total before the
   first record that has a distance. Test: `counts a session whose first record has no distance
from where the previous one ended` in `fit/parse.test.ts`.

## Known limitations

- **An outdoor ride with power, no GPS and no speed sensor is marked indoor when its altitude spans
  under 10 m.** A flat outdoor ride cannot be told from a stationary trainer by its samples. A ride
  that climbs 10 m or more stays outdoor. No corpus file covers the flat case.
- **What the indoor flag does.** An indoor ride has no gradient: the digest sets its grade to zero
  and keeps no climb sections (`digest/digestActivity.ts`). A powered indoor ride also gets no
  power-meter calibration sums, because the digest skips them before the calibration runs. The
  calibration code itself (`digest/calibration.ts`) does not read the flag. Air density is sea level.
- **ELEMNT BOLT average power depends on the convention.** 17 of its 132 samples have no power value.
  On the device's convention, where those seconds count as zero, the mean is 186 W against the
  device's 182 W, +2.3%. Our pipeline interpolates them, so its own mean for this file is 196 W,
  +7.7%. Interpolation raises the average here, and the comparison does not use it.
- **Distance for a sparse recording can lag the device.** The device's total includes distance up to
  its stop, and the last record may be a few seconds earlier. The Edge 820 file is exact, but this
  is why the distance tolerance is 1% and not tighter. The ELEMNT BOLT's -0.79% has no explanation:
  its 8 s of elapsed time without timer time has no records.
- **Files with device time only cannot be dated.** `compressed-speed-distance.fit` is rejected for
  this reason, although its speed and distance now decode correctly.
- **Unsupported sports are refused:** swimming, indoor rowing (`fitnessEquipment`) and walking.
- **Damaged files are refused whole.** `nick.fit`, `strava-android` and `activity-unexpected-eof`
  are rejected rather than partly used. The Garmin SDK reports an error on each.
- **Trailing data after a FIT file is ignored.** Only the first file is read, with a warning.
  `activity-settings-corruptheader.fit` has 83 bytes of this after its CRC.
- **Zero heart rate is missing.** `null_compressed_speed_dist.fit` reports 0 bpm throughout, which
  is not a valid reading, so every sample is dropped and counted (1808 values).
- **Gaps over four hours** start a new activity. Each part after the first counts distance from its
  own first sample, and a session that follows another counts from where the device's count stood.
  No corpus file covers this.
- **Not compared:** cadence, temperature, developer fields and the other fields the app does not
  use.
- **Corpus counts differ from the brief.** There are 25 FIT files and 6 CSVs, not about 30 and five.
  The brief named Edge 500, 810 and 820, fenix 2 and 5, ELEMNT and Bolt, Coros, Strava and an
  indoor trainer. All are present.
