# Lifting time

Lifts store no duration. A set is a load, reps, an effort and a time of day at most. The Activities page sums hours by kind, so lifting needs a time to be counted with runs and rides.

## The estimate

Core `liftSessionsOf(sets)` (`packages/core/src/lift/liftSessions.ts`) gives one entry per day with any set: its date, its set count and its seconds.

| Set     | Seconds | Why                                               |
| ------- | ------- | ------------------------------------------------- |
| Working | 180     | About 40 s under the bar and 2 to 2.5 min of rest |
| Warm-up | 120     | Shorter: lighter, fewer reps, less rest           |

A day of 20 working sets and 4 warm-ups reads as 68 min. Only live sets are passed in.

## Where it shows

- The Activities hours chart: a lift part in each column, keyed "Lift, estimated".
- The month totals: "4 lifts · ~4.9 h". A total that includes it is "~36 h total".
- Nothing else reads it: no grade, load or fitness figure.

## Limits

- A long rest between sets, or a superset with none, is not seen. Time spent on cardio inside a lifting session is not counted.
- When lifting sessions carry a duration (a FIT strength file), that duration should replace the estimate.
