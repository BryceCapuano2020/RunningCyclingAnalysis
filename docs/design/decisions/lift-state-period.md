# A lift is read as of its newest set up to the period's end

Stage X, 6 Nov 2026. Raised in review of `LiftState` ([e1rm.md](../e1rm.md), sections 2 and 5).

## Decision

For a period, each lift's estimate reads every set on or before the period's end, with its usual 56-day window
ending at its newest eligible session. The period's start never trims the window. A lift with any set on or
before the end is listed, dated by its last session, even if that is before the start. The start and end choose
only which weeks of lifting load are shown.

## Why

- Cutting at the start would make the same lift read differently by period: a 7-day period would estimate from
  one session.
- The run and ride standings read history before the window too, and a stale sport still answers, dated.
- The product rule is to answer when the data can, and say how old the answer is.

## How to reverse

Filter sets by the period's start before `estimateLift` in `liftState.ts`. No stored data changes.
