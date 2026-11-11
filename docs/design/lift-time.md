# Lifting time

Lifts store no duration. A set is a load, reps, an effort and a time of day at most. The Activities page sums hours by kind and lists each lifting day as a row, so lifting needs a time to be counted with runs and rides.

Core `liftSessionsOf(sets)` (`packages/core/src/lift/liftSessions.ts`) gives one entry per day with any set: its date, its set count, its seconds, whether those seconds were measured (`measured`) and the earliest time of day a set carries (`start`). Only live sets are passed in.

## Measured time

The logger stamps a set with the clock (`timePrecision: 'set'`) when it is saved on its own day; a set logged for an earlier day gets no stamp. A Hevy import stamps each set with its session's start (`timePrecision: 'session'`), which says nothing about how long the session ran.

A day is measured when every set carries a `set` stamp and the span from the first stamp to the last is from 5 min to 3 h (`MEASURED_MIN_SECONDS`, `MEASURED_MAX_SECONDS`). Its time is that span plus one set's allowance below, the last stamped set's, since the first stamp is taken when the first set is done.

- Under 5 min, the sets were entered one after another once the session was over, so the stamps are not the session.
- Over 3 h, the day held two sessions or a stray set, which the span would count as lifting.
- A stamp is a time of day only. It is always on its set's date, since the logger stamps only on the day being logged.

A synthetic day of 3 working sets stamped 18:00, 18:20 and 18:40 reads 43 min.

## The estimate

Any other day is estimated from its sets.

| Set     | Seconds | Why                                               |
| ------- | ------- | ------------------------------------------------- |
| Working | 180     | About 40 s under the bar and 2 to 2.5 min of rest |
| Warm-up | 120     | Shorter: lighter, fewer reps, less rest           |

A day of 20 working sets and 4 warm-ups reads as 68 min.

## Where it shows

- The Activities list: a row per lifting day, named by its two lifts with most sets ("Bench press, incline bench press +6"), with its time and sets. It opens the Lift page at that day. An estimated day's time is "~50 min" and its row says "Estimated time".
- The Activities hours chart: a lift part in each column, keyed "Lift", or "Lift, estimated" when any day in view is estimated.
- The month totals: "4 lifts · 4.9 h", written "~4.9 h" when a day of them is estimated. A total that includes an estimated day is "~36 h total".
- Nothing else reads it: no grade, load or fitness figure.

## Limits

- An estimated day does not see a long rest between sets, or a superset with none. Time spent on cardio inside a lifting session is not counted.
- A measured day counts the rest after its last set as one allowance, however long it ran.
- When lifting sessions carry a duration (a FIT strength file), that duration should replace both.
