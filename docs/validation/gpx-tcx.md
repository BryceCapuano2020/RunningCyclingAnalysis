# GPX and TCX validation against real device files

The GPX and TCX importers are checked against real files from two third-party test suites, not
against files the project generated. The tests are `packages/core/src/corpus/gpx.corpus.test.ts`
and `packages/core/src/corpus/tcx.corpus.test.ts`. Run them with:

```sh
npx vitest run --project core packages/core/src/corpus
```

## Corpus and references

| Corpus                                           | Source                                                 | Licence    |
| ------------------------------------------------ | ------------------------------------------------------ | ---------- |
| `packages/core/test-corpus/gpxpy/` (11 files)    | tkrajina/gpxpy `test_files` @ `8bbf933eac9a`           | Apache-2.0 |
| `packages/core/test-corpus/tcxparser/` (3 files) | vkurup/python-tcxparser `tests/files` @ `5ecaac92f8f2` | BSD-2      |

Reference values come from sources that do not use this code:

1. **Device lap summaries in the TCX files.** `TotalTimeSeconds`, `DistanceMeters`,
   `AverageHeartRateBpm` and `MaximumHeartRateBpm` for each `Lap`. The test reads them with a
   regex over the raw XML, outside any `Track`.
2. **python-tcxparser's own tests.** `tests/test_tcxparser.py`, fetched with
   `gh api repos/vkurup/python-tcxparser/contents/tests/test_tcxparser.py --jq .content | base64 -d`.
   Its exact values for `test.tcx` are used in the test comments. Its `tcxparser/tcxparser.py`
   defines the averages: `hr_avg` is `int(mean of the trackpoint HeartRateBpm values)`,
   `duration` is the sum of `TotalTimeSeconds`, and `pace` is duration over distance.
3. **gpxpy 1.6.2** (PyPI), run in a scratch virtualenv. `track.get_duration()` and
   `track.length_2d()` for each track. gpxpy's `test.py` (tkrajina/gpxpy, fetched the same way)
   asserts only relations for these tracks, except `test_segment_length_2d`, which pins 111319.49 m
   for one degree of longitude at the equator. That value is used as a check of the great-circle
   formula.

gpxpy measures on the WGS84 equatorial radius (`EARTH_RADIUS = 6378.137 km` in its `geo.py`). This
code uses the IUGG mean radius, 6371.0088 km. Every gpxpy length is therefore scaled by
6371008.8 / 6378137 = 0.998882 before it is compared.

## TCX results

| File                 | Outcome                                      | Distance   | Timer  | Heart rate                  |
| -------------------- | -------------------------------------------- | ---------- | ------ | --------------------------- |
| `test.tcx`           | Running, 1993 s, 3 laps                      | 4686.311 m | 1993 s | Yes, 60 to 189              |
| `no_hr.tcx`          | Running, 1993 s, 3 laps                      | 4686.311 m | 1993 s | None (`hasHeartRate` false) |
| `sup_activity_1.tcx` | Refused: `Unsupported sport: Other` (paddle) | n/a        | n/a    | n/a                         |

Per lap, for `test.tcx` (device value, then ours, then the error):

| Lap | Device distance | Ours      | Error  | Device time | Ours  | Error  | Device avg HR | Ours   | Device max HR | Ours |
| --- | --------------- | --------- | ------ | ----------- | ----- | ------ | ------------- | ------ | ------------- | ---- |
| 1   | 1609.34 m       | 1607.45 m | -0.12% | 608.47 s    | 608 s | -0.08% | 139           | 138.67 | 189           | 189  |
| 2   | 1609.34 m       | 1611.06 m | +0.11% | 714.80 s    | 715 s | +0.03% | 172           | 171.53 | 188           | 188  |
| 3   | 1470.55 m       | 1466.48 m | -0.28% | 669.51 s    | 670 s | +0.07% | 167           | 167.11 | 180           | 180  |

Against the python-tcxparser assertions for `test.tcx`:

| Quantity             | python-tcxparser value                   | Ours                     | Agrees within |
| -------------------- | ---------------------------------------- | ------------------------ | ------------- |
| Distance             | 4686.31103516 m                          | 4686.311 m               | 0.01 m        |
| Duration             | 1992.78 s                                | 1993 s grid              | 2%            |
| Pace                 | 07:05 per km (425 s)                     | 425.07 s per km          | 1 s           |
| Heart rate maximum   | 189                                      | 189                      | exact         |
| Heart rate minimum   | 60                                       | 60                       | exact         |
| Heart rate average   | 156 (mean of 383 trackpoints, truncated) | 160.02 (time-weighted)   | see finding 9 |
| Altitude first, last | 178.942626953 m, 166.4453125 m           | same                     | 0.01 m        |
| Altitude max, min    | 215.95324707 m, 157.793579102 m          | 215.95325 m, 157.79358 m | 0.01 m        |
| Start, end instants  | 21:29:53Z, 22:03:05Z                     | same                     | exact         |

Robustness: `test.tcx`, `no_hr.tcx` and `sup_activity_1.tcx` were each truncated at five points and
corrupted in twelve seeded copies, each with four bytes changed. Every result is either a valid activity (finite,
non-decreasing distance) or a documented refusal. Removing every `Time` gives `File contains no
activity records`. Removing the zone gives the zone message. A BOM, CRLF line endings and a
prefixed namespace give the same activity.

## GPX results

### As shipped (no `<type>`)

The app refuses a track with no type by design, so every shipped file is refused except the two
that have no track at all or an unknown sport.

| File                                      | Outcome as shipped                                            |
| ----------------------------------------- | ------------------------------------------------------------- |
| `Mojstrovka.gpx`                          | No type (creator GPSBabel)                                    |
| `around-visnjan-with-car.gpx`             | No type (creator eTrex 20x)                                   |
| `cerknicko-jezero-without-elevations.gpx` | No type (creator GPSBabel)                                    |
| `cerknicko-jezero.gpx`                    | No type (creator GPSBabel)                                    |
| `cerknicko-without-times.gpx`             | No type (creator GPSBabel)                                    |
| `gpx1.1_with_all_fields.gpx`              | `Unsupported sport: t`                                        |
| `gpx_with_garmin_extension.gpx`           | `File contains no activity records` (waypoint only, no track) |
| `korita-zbevnica.gpx`                     | `Unsupported sport: jkljkl`                                   |
| `track-with-empty-segment.gpx`            | No type (creator TC2 to GPX11 XSLT stylesheet)                |
| `track_with_speed.gpx`                    | No type                                                       |
| `unicode_with_bom.gpx`                    | `File contains no activity records` (waypoint only, no track) |

### With a type set (test only)

To exercise the parser on the real tracks, the test inserts `<type>` into each `<trk>`. Product
behaviour is unchanged. Each activity is measured by the seconds its records cover (finding 3), so
these outcomes are the current rule.

| File                                      | Typed outcome                                                                                              |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `around-visnjan-with-car.gpx`             | One activity, 514 s, 2558.5 m                                                                              |
| `cerknicko-jezero.gpx`                    | Three activities: 2469 s (1806.8 m), 155 s (860.8 m), 288 s (1065.7 m). Track 7 is refused, see finding 11 |
| `cerknicko-jezero-without-elevations.gpx` | Three activities: 2469 s (1806.8 m), 155 s (860.8 m), 288 s (1065.7 m). Track 7 is refused, see finding 11 |
| `korita-zbevnica.gpx`                     | Two activities, 4552 s (1631.0 m) and 8541 s (3297.2 m)                                                    |
| `Mojstrovka.gpx`                          | `Activity is shorter than one minute` (one time for all points)                                            |
| `cerknicko-without-times.gpx`             | `Activity is recorded too sparsely` (5 widely spaced timed fixes)                                          |
| `track-with-empty-segment.gpx`            | `Activity is shorter than one minute` (9 fixes, vouching for 35 s)                                         |
| `track_with_speed.gpx`                    | `Activity is shorter than one minute` (3 fixes, covering 14 s)                                             |
| `gpx1.1_with_all_fields.gpx`              | `Activity is shorter than one minute` (1 fix)                                                              |
| `gpx_with_garmin_extension.gpx`           | `File contains no activity records`                                                                        |
| `unicode_with_bom.gpx`                    | `File contains no activity records`                                                                        |

### Distance and duration against gpxpy

`helper` is `trackFromFixes` (the distance the GPX import uses) at its last fix. `chord, all` is
the sum of great-circle chords between every pair of consecutive timed fixes. `chord, kept` drops
the chords across gaps longer than 30 s, which the helper also drops. `helper / kept` isolates
smoothing; `helper / all` is the total effect, including the gap rule.

| File                     | Trk | Fixes | gpxpy duration (s) | Ours (s) | gpxpy length × radius (m) | Chord, all (m) | Chord, kept (m) | Helper (m) | helper / kept | helper / all |
| ------------------------ | --- | ----- | ------------------ | -------- | ------------------------- | -------------- | --------------- | ---------- | ------------- | ------------ |
| around-visnjan-with-car  | 0   | 104   | 514                | 514      | 2733.2                    | 2733.2         | 2724.1          | 2558.5     | 0.939         | 0.936        |
| cerknicko-jezero         | 1   | 173   | 2469               | 2469     | 1912.4                    | 1912.4         | 1740.0          | 1806.8     | 1.038         | 0.945        |
| cerknicko-jezero         | 2   | 52    | 155                | 155      | 873.2                     | 873.2          | 857.8           | 860.8      | 1.003         | 0.986        |
| cerknicko-jezero         | 4   | 44    | 288                | 288      | 1352.1                    | 1352.1         | 1020.0          | 1065.7     | 1.045         | 0.788        |
| cerknicko-jezero         | 7   | 21    | 1092               | 1092     | 346.6                     | 346.6          | 155.3           | 138.3      | 0.891         | 0.399        |
| korita-zbevnica          | 2   | 176   | 4552               | 4552     | 2282.0                    | 2282.0         | 1670.7          | 1631.0     | 0.976         | 0.715        |
| korita-zbevnica          | 3   | 337   | 8541               | 8541     | 3979.5                    | 3979.5         | 3278.0          | 3297.2     | 1.006         | 0.829        |
| track-with-empty-segment | 0   | 9     | 76                 | 76       | 85.9                      | 85.9           | 85.9            | 72.3       | 0.842         | 0.842        |
| track_with_speed         | 0   | 3     | 13                 | 13       | 18.6                      | 18.6           | 18.6            | 18.6       | 1.000         | 1.000        |

What the table shows:

- **Haversine matches gpxpy after the radius correction.** The chord sums match gpxpy's
  `length_2d` to within 0.03% on every track (the residual is gpxpy's rounding to 0.01 m). The test allows 0.01% of each length, or 0.01 m where that is larger. Without
  the radius correction they would differ by 0.11%. Durations match gpxpy exactly.
- **Smoothing is two-sided.** Against the gap-free chord, the helper is 16% short on the shortest
  track (9 fixes, 76 s) and 11% short on the sparse 1092 s track. It is 4 to 5% long on two other
  tracks. The helper's 20 s centred window shortens tracks that speed up or slow down within a few
  seconds, and it lengthens a few tracks at gap edges. The test pins each track's ratio to within 2 points.
- **The gap rule dominates sparse tracks.** Track 7 keeps 40% of its chord length, and korita track
  2 keeps 71%. These are design consequences, listed under limitations below.

## Findings

### Fixed

1. **Hexadecimal coordinates were read as numbers.** `Number()` accepts `0x2A`, so a GPX position
   of `lat="0x2A"` gave a real position. The XML decimal type does not allow that. The GPX parser now
   uses the same decimal check as the TCX parser. Regression test: `parseGpx coordinates` in
   `packages/core/src/gpx/parse.test.ts`. It failed before the fix (distance 983 m, expected 0).
2. **A TCX with no timed trackpoints reported the wrong reason.** It was refused as `Activity is
shorter than one minute`. The GPX parser says `File contains no activity records` for the same
   file, and the documented message is the one that should be used. Fixed in
   `packages/core/src/tcx/parse.ts`. Regression test: `reports no records when no trackpoint has a
time, as GPX does` in `packages/core/src/tcx/parse.test.ts`.
3. **The minimum-length rule counted records for GPX and TCX.** The pipeline checked 60 records, so
   a track of 155 s with 52 fixes was refused as shorter than a minute. Each unit is now measured by
   the seconds its records cover: each gap up to 10 s counts in full, and a longer gap counts as one
   second (finding 11). The code is in `packages/core/src/import/pipeline.ts`. Test, in `packages/core/src/import/pipeline.test.ts`:
   `accepts a sparsely recorded track by the seconds its records cover, in any format`. The
   cerknicko-jezero corpus test now pins the three durations it keeps.

4. **`parseIsoTime` read years 0000 to 0099 as 1900 to 1999.** `Date.UTC` maps two-digit years to
   the 1900s, so `parseIsoTime('0050-06-01T00:00:00Z', 'utc')` gave 1950. Fixed in
   `packages/core/src/import/time.ts`, which sets the year with `setUTCFullYear`. Test:
   `keeps a year below 100 as written` in `packages/core/src/import/time.test.ts`, checked
   against `Date.parse`.

### Found, outside this area (not changed)

5. **Mojstrovka.gpx has one time for all points.** 183 of 184 trackpoints are stamped
   `1901-12-13T20:45:52.2073437Z`. A file like this has no measurable duration, and it is refused as
   shorter than a minute (typed) or with no sport (as shipped).

### Limitations (quantified, by design)

6. **A track logged about once a minute loses most of its distance.** Chords across gaps longer than
   30 s get no credit. Cerknicko track 7 has 9 such gaps and reads 138 m, against 347 m of gpxpy
   length. As a typed ride it is now refused, see finding 11. Korita track 2 loses 611 m of 2282 m.
   Gaps longer than 10 s are also marked as paused, so sparse logging reads as stationary. `cerknicko-jezero trk 7` pins this in a test.
7. **Distance is horizontal.** The helper uses positions only. gpxpy's `length_3d` for cerknicko
   track 7 is 414.97 m against a 2D length of 347.0 m, 20% more. Altitude noise is not counted.
8. **Smoothing error is bounded, not zero.** See the table above: between -16% and +5% on these
   tracks, and each track is pinned to within 2 points of its table ratio.
9. **Heart rate average is time-weighted.** python-tcxparser's `hr_avg` is the mean of the trackpoint
   values, 156.65, which it truncates to 156. The app and the device's lap averages weight each
   second equally, so the app reads 160.02 (time-weighted from the raw XML: 159.96). Both are
   correct for their definitions. The test reproduces each one.
10. **Only the corpus-typed copies reach the product path.** Nine of the eleven shipped GPX files have
    no `<type>`, so the typed copies are test inputs. The shipped refusals are tested as shipped.
11. **A sparse track that vouches for under a minute is refused, as too sparse.** The refusal says
    the points are more than 10 seconds apart, not that the activity is short. A gap over 10 s credits one
    second, so a track logged about once a minute vouches for little of its time. Cerknicko
    track 7 lasts 1092 s and vouches for 57 s, so as a typed ride it is refused with that reason.
    Measuring such tracks by elapsed time would let seven points an hour apart pass as a six-hour
    activity, so sparseness is reported instead of hidden.
