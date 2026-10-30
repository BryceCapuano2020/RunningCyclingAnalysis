# Age grading against published road standards

Status: the core module is in `packages/core/src/grade` (`@rca/core/grade`), and the UI is wired in
`apps/web/src/ui/grades.ts` and the pages that use it. Grades are estimates; see sections 3 and 6.

## 1. The standards

- **Source:** USATF road age standards, 2025. Compiled by Alan Jones; single-age bests by Tom
  Bernhard. Approved 2025-01-10 by Masters Long Distance Running (MLDR) of USA Track & Field. CC0
  1.0 Universal; the app still cites it (`ROAD_STANDARDS_SOURCE`).
- **Coverage:** male and female, ages 5 to 100, whole seconds at 22 published road distances (1 mile
  to 200 km). Other distances use the app's own log-log interpolation. Outside those ranges there is
  no grade (null).
- **Provenance**, in order:
  1. Download from `https://raw.githubusercontent.com/AlanLyttonJones/Age-Grade-Tables/4aac6737cb9f216c90a0a610355667cd3d921c61/2025%20Files/`:
     `MaleRoadStd2025.xlsx`, SHA-256 `f9fc6cdc202194dccf730c352d49c025f7466e50049a54224535ece3b956099e`;
     `FemaleRoadStd2025.xlsx`, SHA-256 `3dd4fc6ccba593019066dece02ddda3a8b264c76f338476a6cf6c40917560c99`.
  2. `python3 -I packages/core/scripts/extract-road-standards.py MaleRoadStd2025.xlsx FemaleRoadStd2025.xlsx > road-standards.json`
     reads the seconds sheets and refuses any file whose hash differs.
  3. `node packages/core/scripts/build-road-standards.mjs road-standards.json` writes `roadStandards.ts`,
     which records a SHA-256 of its tables. A hand edit fails the tests.

## 2. How a run is graded

- **Grade** = age-standard time for the distance covered, divided by the actual time. Male 40,
  5 km in 20:00: 812 ÷ 1200 = 0.6767, or 67.67%.
- **Between table distances** the standard is interpolated log-linearly (log time against log
  distance). Table distances return the published seconds exactly. **Age** is `ageAt`, the
  calendar-year difference from the birth year (section 6).

## 3. How a ride is graded

Owner decision, 2026-10-23: a ride is graded through its equal-energy flat running equivalent, the
running speed that costs the same metabolic power, over the ride's duration. The ride level is
model-derived, not a published cycling standard. The UI calls `ageGradeForEffort` on each ride's
running equivalent, and shows the model's 5th to 95th percentile as the range.

Owner decision, 2026-10-30: a ride keeps its level words but is capped. The running age factors have no
ceiling for a ride, so a strong young rider, and an older or female rider at modest watts, would read above
100%. `gradeCeiling` is the lower of 1 and the grade of the open running record's speed
(`RUN_WORLD_RECORD_SPEEDS`) for the length, at the athlete's age and sex. A ride whose centre equivalent
is at or above it is flagged as implausible input (power meter calibration, weight setting or a
mislabelled e-bike ride are the things to check), shown as that, and left out of the balance: the grade
gap, the energy comparison and the share card. A range end above it is held at it. The level target is
hidden when its target is above 100%, or at the ceiling for a ride. At 20 minutes the ceiling binds at 100%,
which a 70 kg rider's 20-minute power reaches at about 5.6 W/kg (man of 25), 4.4 (man of 65), 5.2 (woman
of 25) and 3.8 (woman of 65). A genuinely elite rider is flagged too; there is no override on this flag.

## 4. Level bands

WMA-style bands, lower bounds inclusive: World 0.90, National 0.80, Regional 0.70, Local 0.60,
Recreational below. The names are `GRADE_LEVELS` labels, and the UI uses them as written.
`gradePercent` rounds down (0.8999 shows 89.9%, never 90), and `levelOf` takes the unrounded grade,
so they agree. Both return null for NaN, infinite or negative input.

## 5. One year of age

Female 69 to 70 at 100 km changes the standard by 1.62%, pinned by a test. The largest one-year
steps are 19.7% (male 5 to 6, 50 mile; section 6), 33.1% (female 98 to 99) and
51.7% (female 99 to 100), both from marathon distance up. Standards never fall with age from about
22 (men) and 26 (women), at any distance, so an overstated age inflates the grade for adults. Below
those ages most distances fall, and an overstated age deflates the grade there.

## 6. Limits

- **Birth year only.** Until the athlete's birthday the calendar-year age can be one year too high,
  which moves the grade by one year's change in the standard (section 5).
- **Dated by activity.** The UI takes each effort's age on the day of the activity that set it. A ride
  uses the date of its own best ride at that duration, since its equivalent comes from that ride.
- **Road races at sea level.** The standards do not adjust for altitude, trail, track or cross-country.
- **Hilly courses and GPS error.** Grade-adjusted pace is an estimate; measured distance can be off.
- **Training is not a race:** a training grade is an estimate, not a race result or a ranking.
- **Source anomalies, kept as published:** male age 5 (7 Mile, 3579 s, is slower than 12 km,
  3150 s, the only inversion); female age 100, 10 km (12172 s, where the 10 km factor gives 11686 s);
  male age 80, 12 km (factor out of line with its neighbours, factor sheet only, seconds unaffected).
  Tests pin the first two.
