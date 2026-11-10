# A CSV import keeps the sets you have; replacing is a choice

Stage X, 6 Nov 2026; changed after review of the Hevy import.
Open question 1 of [strength.md](../strength.md), section 4.

## Decision

The logger, an account adoption and a CSV import write through the same `PUT /api/lifts`, which inserts or
replaces by key ([lift-data.md](../lift-data.md)). A single set from the logger replaces the stored set of its
key: that is how a typo is fixed. A CSV import does not replace by default. Before it writes, the preview sorts
each set by its key (date, exercise, equipment, set order):

- No stored set has the key: the set is written.
- A stored set has the key and the same values: skipped. Nothing is written and the set's `rev` does not move.
- A stored set has the key and other values: kept as it is, unless the athlete ticks "Replace N sets that
  differ" (unchecked by default).

The import also stops at the most an account keeps (`MAX_LIFT_SETS_PER_USER`). New sets past that room are not
written; the preview and the result say how many. Replacing adds no set, so it is never cut.

Adoption at sign-in is as before: a set kept in the browser is sent with `insertOnly`, so it never replaces one
the account already holds.

## Why

- Set order is renumbered per day and lift on import, so "squat set 1" in a file is not always the set the
  athlete logged by hand as set 1. A silent replace could overwrite hand-logged work or undo an edit made to an
  earlier import.
- Re-importing the same file is harmless and writes nothing, so no `rev` moves and sync has nothing to send.
- Replacing is still there for the athlete who fixed a set in the source app and exports again.

## Cost

- A correction made in Hevy does not land unless the athlete ticks replace.
- A replace still overwrites an RPE the CSV row lacks; the count in the checkbox is the warning.
- A set deleted in the source app is not deleted here: a replace by key cannot see a missing row.

## How to reverse

Make replace the default by writing `preview.different` with the rest. No stored data changes. Values an earlier
replace overwrote are not kept anywhere and cannot be brought back.
