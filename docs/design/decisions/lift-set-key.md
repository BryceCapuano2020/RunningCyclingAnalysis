# A set is keyed by date, exercise, equipment and set order

Stage X, 6 Nov 2026. Raised by the design review of [lift-data.md](../lift-data.md); strength.md decision 4
chose the fields.

## Decision

The key is the local date, the exercise slug, the equipment and the set order. The set order counts across
every session of that lift on that day, so a morning and an evening session of squats are sets 1 to 5 and 6 to
10, not two set 1s. The logger numbers on from the day's last set. A CSV import renumbers within date and lift,
in the order of its session time and then its own set order, because Strong's "Set Order" restarts each
workout. Two devices logging the same session offline can write the same key; the last write to reach the
server wins.

## Why

- A set has no file and no exact time to key on, and a CSV may carry a date only (strength.md, decision 4).
- Counting across the day keeps two sessions apart without needing a time.
- Equipment is part of the lift (e1rm.md, section 6), so it is part of the key.

## Cost

- Deleting a set from the middle of a day leaves a gap in the numbers. Nothing renumbers, so keys stay stable.
- Two devices logging one session collide. Rare for one athlete, and the athlete sees the server's copy after
  the next pull.

## How to reverse

The key is the table's primary key, the browser store's key and the delete route's text, so changing it is a
migration that rebuilds `lift_sets`, plus a store upgrade. It is the hardest of the lifting decisions to undo.
That cost grows with stored sets, so any change must come before lifting ships.
