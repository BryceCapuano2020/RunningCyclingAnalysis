# Finer levels below 60%

10 Nov 2026. Run, ride and lift share one level list, from `GRADE_LEVELS` in `packages/core/src/grade/ageGrade.ts`.

## Decision

The WMA bands stay: Local 60, Regional 70, National 80, World 90. Below 60 the app adds its own bands:

| Grade   | Level        | Meaning                                      |
| ------- | ------------ | -------------------------------------------- |
| 50 - 59 | Club         | Fast enough to hold your own in a club race. |
| 40 - 49 | Trained      | Regular, structured training shows.          |
| 30 - 39 | Active       | You exercise most weeks.                     |
| < 30    | Recreational | You move for fun, not for pace.              |

The same words apply to run, ride and lift. The rule is unchanged: `levelOf` takes the unrounded grade and
`gradePercent` rounds down, so a corner that shows 50% reads Club and 49.9% reads Trained, never 50% Trained.
Method says once that the bands below 60% are this app's own, and defines each.

## Why

The owner: "I want more granular levels at the bottom range. Like I'm fairly athletic, I'd say more so than the
vast majority of men my age (but not compared to actual competitive sport standards). So I shouldn't be getting
'recreational' for all three." One word for everything under 60% told a trained athlete nothing.

## Cost

- The four new names are not WMA's. Method says so.
- Digests are unchanged: a level is derived from the grade at read time, so `MODEL_REVISION` does not move.
- The level colour tokens stay five (Recreational to Club share the lowest wash).

## Reverse

Delete the three entries in `GRADE_LEVELS`, the `OWN_LEVEL_MEANING` table in `apps/web/src/ui/levelMeaning.ts` and
the Method lines that read it, then restore the expectations in the tests that name the new levels.
