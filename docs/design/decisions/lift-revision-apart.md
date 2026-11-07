# Lift changes move `liftRevision`, not `libraryRevision`

Stage X, 6 Nov 2026. strength.md's build budget said `libraryRevision` in `routes/me.ts` gains a lift term.

## Decision

`/api/me` carries `liftRevision` beside `libraryRevision`, which stays as it was. The browser keeps a baseline for
each and pulls lifts only when `liftRevision` moves. Every lift write raises it by exactly one, and a test pins that.

## Why

- The activity library reloads in full whenever `libraryRevision` changes (`libraryTabs.ts`). A lift term in it
  would reload every activity after each logged set and spend the list-rows meter set by set; about 100 sets would
  use the day's allowance.
- One step per write lets the browser tell its own write from another tab's: an answer one above what it last
  read means nothing else changed, so it skips the pull.

## How to reverse

Fold the term into `libraryRevision` and drop the field. Readers compare the tag for inequality only, so nothing
breaks, but the reload cost above returns.
