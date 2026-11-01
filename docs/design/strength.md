# Strength: where lifting lives

Status: designed, nothing built. Stage F builds it (see [README.md](README.md)). The estimator, error
bands and equipment rules are in [research/strength.md](../research/strength.md). This record settles
where lifting sits in the types, the storage and the screens, so the build does not reopen it.

Principle: lifting has no shared currency with running and riding. Its numbers keep their own units,
sit beside the endurance numbers and are never summed with them (VISION.md, commitment 5).

## 1. The shapes

A set record is one row per set:

| Field         | Meaning                                                                          |
| ------------- | -------------------------------------------------------------------------------- |
| date          | Local calendar date of the session. Always present.                              |
| time          | Local time of day. Optional.                                                     |
| timePrecision | What the time means: the set's own, or the session's start. Absent with no time. |
| exercise      | The lift, with its equipment as part of the key (research section 5).            |
| setOrder      | Position of the set within that date and exercise.                               |
| reps, load    | Reps done, and load in kilograms (added load for a bodyweight lift).             |
| rpe           | Effort on the set. Optional.                                                     |

`LiftState` is what the lift module computes from the sets: e1RM per lift with its range, the
demonstrated floor, relative strength and weekly load. It travels beside the `SessionState` fields.

A balance reading is pairwise: `{ pair, unit, lead: { centre, low, high }, lean }`, typed as `PairReading`
in `packages/core/src/types.ts`. A positive lead favours the first discipline of `pair`. Run and ride is
the one pair that exists today (`BALANCE_PAIR` in `ui/sports.ts`). The hero's `BalanceReading` extends
`PairReading`; `balanceGap.ts` has the same lead and lean without `pair` or `unit`.

## 2. Decisions

1. **`Sport` stays run and ride. `Discipline = Sport | 'lift'`. Lifts stay out of `ActivityDigest`,
   `AnalysisResult` and the activity library.** Why: all three are shaped around streams and files, and
   a set has neither. Widening `Sport` would put a lift in every place that expects a file. Code about
   all three disciplines takes `Discipline`. Code about streams keeps `Sport`.

2. **Lifting has its own D1 table and its own IndexedDB database (`openIndexedDb` is already generic).
   Both hold raw sets. No file hashes are invented. e1RM is computed on read.** Why: a made-up hash
   would pass a set off as a file the library can re-read, repair and dedupe. Computing on read means a
   better estimator needs no migration of stored values.

3. **Lifting has its own revision constant.** Why: `MODEL_REVISION` is global and exclusive. Bumping it
   holds every run and ride until it is re-read, so an estimator change must not touch it.

4. **Dedupe on date, exercise and set order, never `workoutKey`.** Why: `workoutKey` matches files of
   one workout saved in different formats, and a set has no formats. A CSV may carry a date only, so
   the key cannot need a time.

5. **Import is an in-app logger first, then a plain lifting CSV with its own entry point. The CSV reuses
   `readCsvRows` in `import/csv.ts` and the bounds in `import/limits.ts`.** Why: the logger is the only
   path that gets RPE and exact times, and it needs no parser. A separate entry point keeps the file
   import free of a CSV that holds no stream. Reusing the reader and limits means no second parser to
   harden.

6. **`LiftState` is a sibling of the `SessionState` fields, never fields on `AnalysisResult`.** Why: a
   result is remembered by its digests and period, and sets have neither. Fields on it would make every
   run and ride result carry and key on lifting.

7. **Hours and load are never summed across systems. Lifting is its own row.** Why: kilojoules, heart
   rate points and sets of reps do not measure one thing, and the hours of a lift include rest between
   sets. A sum would suggest a comparison the data cannot make. Weekly load per system is shown as
   side-by-side rows, one per system.

8. **Run and ride stay the hero meter. Lifting gets a Strength card beside it.** Why: a gap needs a
   common unit. Run and ride share one, the age grade. An e1RM and a grade do not, so no lift number
   goes on the meter. The card shows e1RM with its range, the floor against the estimate,
   relative strength at the dated body mass, and weekly load per system.

9. **A lift and run pair exists only when the interference analysis gives a measured effect with an
   interval.** It is its own pair with its own unit, drawn by the same meter. Why: a pair on the meter
   must be a measured gap with a range, as run and ride is. Without a measured effect there is nothing
   to draw, so the meter stays run and ride.

10. **Interference joins lift times to runs by date and respects the precision flag.** Why: with a date
    only, the hours between a lift and a run are unknown. A date-only lift joins at the day. Analyses by
    hours since the last lift use only lifts that have a time, and leave the others out rather than
    guess.

## 3. Budget for the build

Each of these is a line item with its own test, so none is found at the gate.

- Account export: bump `EXPORT_VERSION` in `export/accountExport.ts`, since sets are the athlete's data.
- Privacy wording: the privacy tests name every new column (`privacyDigestFields.test.ts`,
  `privacyPage.test.ts`), and the page says what is stored.
- `libraryRevision` in `routes/me.ts` gains a lift term, so another tab sees a lift change.
- Account deletion cascades already. The new table takes the same user foreign key with a cascade.

## 4. Open

- Whether a re-import of a set with the same date, exercise and set order replaces the stored set or
  keeps it.
- The names of the two `timePrecision` values, and whether a CSV with a session time can set them.
- Whether the connector may save lift logs (ROADMAP.md, Phase 3).
