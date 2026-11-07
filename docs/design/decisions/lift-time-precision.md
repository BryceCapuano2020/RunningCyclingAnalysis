# `timePrecision` is `set` or `session`

Stage X, 6 Nov 2026. Open question 2 of [strength.md](../strength.md), section 4.

## Decision

- `set`: the time is when that set was done. The in-app logger writes it.
- `session`: the time is when the session started. A CSV with a date and time column (the Strong export has
  one) writes it.
- No time: the field is absent. A CSV with a date only writes no time.

A CSV can set `session` only. No common export carries a time per set, and a CSV that claimed `set` would put
every set of a session at one instant.

## Why

- The names say what the time belongs to, in the words of the record (a set, a session).
- The interference analysis needs to know which: hours since the last lower-body lift use a `set` time
  exactly, a `session` time as the start of a window, and a date alone joins at the day
  ([strength.md](../strength.md), decision 10).

## How to reverse

The names live in the D1 check constraint, the contract enum and the browser store. Renaming is one
migration that rewrites the column and replaces the check, plus a reader that maps the old names for one
release. Cheap now; it grows with stored sets, so a rename should come before lifting ships.
