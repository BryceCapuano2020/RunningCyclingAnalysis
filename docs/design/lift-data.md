# Lift sets: record, storage and sync (design)

Status: built (stage X), after two reviews (approve with changes, all taken below). Where
lifting lives is settled in [strength.md](strength.md); this note is the record, the server table and routes,
the browser store and how the two agree. The estimator that reads the sets is [e1rm.md](e1rm.md). Synthetic
values only.

## 1. The set record

`LiftSet`, in `packages/core/src/lift/types.ts`, with its bounds in `lift/limits.ts`. The contract's zod schema
reads those bounds, so the API, the browser store and a later CSV import refuse the same things.

| Field         | Type                                                                                    | Bound                                                                                       |
| ------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| date          | `YYYY-MM-DD`, local                                                                     | A real date in 1970 to 2100 (`isLocalDate`, the dated-settings years).                      |
| time          | `HH:MM`, local, optional                                                                | 00:00 to 23:59.                                                                             |
| timePrecision | `'set' \| 'session'`, optional                                                          | Present exactly when `time` is.                                                             |
| exercise      | slug                                                                                    | `^[a-z0-9]+(-[a-z0-9]+)*$`, 1 to 48 characters.                                             |
| equipment     | `barbell \| dumbbell \| machine \| smith \| cable \| kettlebell \| bodyweight \| other` | One of these.                                                                               |
| setOrder      | integer                                                                                 | 1 to 200: position within the date and lift, across all sessions of that day.               |
| reps          | integer                                                                                 | 1 to 100.                                                                                   |
| loadKg        | number                                                                                  | 0 to 1,000, at most two decimals. Added load for `bodyweight`; one dumbbell for `dumbbell`. |
| rpe           | number, optional                                                                        | 1 to 10 in steps of 0.5.                                                                    |
| warmup        | `true`, optional                                                                        | Absent means a working set.                                                                 |

The **set key** is date, exercise, equipment and set order, written `2026-03-02.back-squat.barbell.3`
([decisions/lift-set-key.md](decisions/lift-set-key.md)). Pounds are converted to kilograms when a set is
entered. Exercise names come from the core catalog or a slug the athlete typed; a typed slug is close to free
text, and the privacy page says so. Notes are not kept.

The Hevy CSV layout is not verified: the reader accepts the two layouts third-party pages describe and refuses
any other header by name. It is to be pinned from the owner's first export header row (column names only, never
his rows), after which a synthetic fixture is built from it.

Caps, in the contract with the other limits: 60,000 sets an account (about nine years of a heavy lifter's
logging), 500 sets in one write, 500 keys in one delete. A write or delete that names one key twice is refused,
with the index of the second.

## 2. Server

**Migration 0012** (by hand, as 0009 is):

- table `lift_sets`: `user_id`, `date`, `exercise`, `equipment`, `set_order`, `reps`, `load_kg`, `rpe` (null),
  `warmup` (0 or 1), `time` (null), `time_precision` (null), `updated_at`. Primary key
  `(user_id, date, exercise, equipment, set_order)`. Foreign key `user_id` to `users(id)` on delete cascade, so
  account deletion needs no new statement. Checks hold the equipment and precision names, and `time` and
  `time_precision` null together;
- `users.lift_count INTEGER NOT NULL DEFAULT 0 CONSTRAINT users_lift_count_cap CHECK (lift_count BETWEEN 0 AND
60000)`;
- `users.lift_revision INTEGER NOT NULL DEFAULT 0`.

A new table and defaulted columns leave the rollback floor's Worker working. The cap lives in the check, so
raising it is a migration.

**Writes take two statements, whatever their size.** D1 allows 100 bound values a statement, and a set has
about 12, so sets are bound as one JSON text and read with `json_each`. A write is one batch, which D1 runs as
one transaction:

1. `UPDATE users SET lift_count = lift_count + <new keys>, lift_revision = lift_revision + 1 WHERE id = ?
RETURNING lift_count, lift_revision`, where `<new keys>` counts the payload's distinct keys with no stored row
   (one primary-key lookup each). If the count would pass 60,000, the check fails and the whole batch rolls
   back. The route answers 409 and refunds only when the error names `users_lift_count_cap`; any other
   constraint error is a 500, so the browser never holds sets for a cap it has not reached. An empty
   `RETURNING` means the user row is gone: 401.
2. `INSERT INTO lift_sets (...) SELECT ... FROM json_each(?) WHERE true ON CONFLICT (...) DO UPDATE SET ...`
   (insert or replace), or `DO NOTHING` in insert-only mode, whose answer lists the keys it skipped.

A delete is the same pair: the update subtracts the payload's distinct keys that have a row, then
`DELETE FROM lift_sets WHERE user_id = ?1 AND (date, exercise, equipment, set_order) IN (SELECT ... FROM
json_each(?2))`. Every statement names `user_id`. A test pins two statements per write, as LIMITS.md does for
listing, and an `EXPLAIN QUERY PLAN` test pins the delete to a primary-key search, not a scan of the account. Rows read per write are about the payload's size.

**Routes**, each behind `requireUser`, a body limit and a daily budget of its own (`liftRead`, `liftWrite`),
listed in `apps/api/LIMITS.md`:

| Route                    | Body                              | Does                                                                                                                                                                                                                               |
| ------------------------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/lifts?cursor=` |                                   | `sameOriginReadGuard`. One page of 1,000 sets in key order, the next cursor and the account's `liftRevision`. Counts on the list-rows meter. The cursor is the last key's tuple, encoded opaque, so `.10` never sorts before `.2`. |
| `PUT /api/lifts`         | `{ sets, insertOnly? }`, 1 to 500 | Inserts or replaces each set by key; with `insertOnly`, keeps stored sets and returns their keys. Answers with `liftRevision`.                                                                                                     |
| `POST /api/lifts/delete` | `{ keys }`, 1 to 500              | Removes those sets. A key with no set is not an error, so a resent delete settles. Answers with `liftRevision`.                                                                                                                    |

A 400 names each refused set by its index (`sets.N`), so the browser drops only those.

**`/api/me` gains `liftRevision`**, beside `libraryRevision`, and `libraryRevision` stays as it is. Folding the
lift term into it would make every logged set reload the whole activity library (`libraryTabs.ts` lists the
library on every change of that tag), which spends the list-rows meter set by set. The browser keeps a
baseline for each and pulls lifts only when `liftRevision` moves. This replaces the strength.md budget line
that said `libraryRevision` gains a lift term.

Across devices the last write to arrive wins; the server's `updated_at` records it, and no client clock is
trusted.

## 3. Browser

**Store.** IndexedDB database `rca-lifts`, opened through `openIndexedDb`, one object store `rows` keyed
`<scope>|<set key>` with an index on `scope`. The scope is `device` when signed out and the user id when
signed in. A row holds the set, `state` (`synced`, `put`, `delete`), `rev` (raised on each local change),
`saved` (the last values the server confirmed, if any), `ackRevision` (the account revision of that
confirmation) and `attempts`. A signed-out visitor's sets live only here. A signed-in account's server copy
is the record; the store holds a mirror plus the changes not yet sent, so a set logged without signal is kept.

**One flush per browser.** A flush takes the Web Lock `rca-lifts-flush` and has one request in flight, so two
tabs, or a timed-out request and its resend, can never deliver an older `rev` after a newer one. It sends, in
order: deletes; puts of keys that have `saved` values (replaces, which need no room); then new keys. At the cap
only the last group is refused.

**Transitions** of one row in an account's scope. "Ack r" answers a send of `rev` r.

| State \ event | Local save   | Local delete    | Ack r, r = rev      | Ack r, r < rev | 400 naming the row                                                    | Cap (409)                           | Other failure               | Pull has the set        | Complete pull lacks the set                         |
| ------------- | ------------ | --------------- | ------------------- | -------------- | --------------------------------------------------------------------- | ----------------------------------- | --------------------------- | ----------------------- | --------------------------------------------------- |
| absent        | put, rev 1   | absent          | n/a                 | n/a            | n/a                                                                   | n/a                                 | n/a                         | synced                  | absent                                              |
| synced        | put, rev + 1 | delete, rev + 1 | n/a                 | n/a            | n/a                                                                   | n/a                                 | n/a                         | synced, server's values | absent, unless `ackRevision` is newer than the pull |
| put           | put, rev + 1 | delete, rev + 1 | synced, `saved` set | unchanged      | back to `saved` as synced, or absent without it; counted as not saved | held until room or the next session | held, attempts + 1, backoff | unchanged               | unchanged                                           |
| delete        | put, rev + 1 | delete          | absent              | unchanged      | back to `saved` as synced                                             | n/a                                 | held, attempts + 1, backoff | unchanged               | unchanged                                           |

- **Other failure** is any status but 2xx, 400, 401 and 409: network, 5xx, 429, 413, 403 while the account
  is being deleted, 404. The row is held, never dropped; `attempts` paces the retries. A 400 that names no row
  holds every row of that request. A 401 stops the flush.
- **Restart** (tab, worker or browser): rows keep their state, and the next flush resends. A resend is safe: a
  put replaces, a delete of a missing set settles.
- **Stale reply**: an ack applies only when `rev` still matches, checked in the transaction that writes it.
- **Pull** reads every page, then applies them in one pass. It is complete only when every page carried the
  same `liftRevision`; otherwise nothing is removed and it runs again later. A row confirmed at a newer revision
  than the pull is never removed by it. Pulls run when `liftRevision` moves, not on every view.
- **Adoption** (sign-in with device sets) is part of the existing offer to add this browser's activities to the
  account, never automatic. Accepted, device rows go up with `insertOnly`, so a set the account holds stays
  ([lift-reimport.md](decisions/lift-reimport.md)); skipped keys are counted to the athlete, and device rows go
  once sent.
- **Sign-out** removes the account's `synced` rows and keeps its `put` and `delete` rows for its next sign-in.
  The store reports how many are unsent, so sign-out can warn.
- **Sign-in of another account** removes every other account's rows, unsent ones included, as the outbox sweep
  does. A shared browser must never hand one person's log to another; the cost is that the first account's
  unsent sets are lost, which the sign-out warning names. Remove all clears the whole database.

## 4. Export, privacy, revision

- The account export moves to `EXPORT_VERSION` 3 and gains `lifts: LiftSet[]`, read page by page from the
  server. LIMITS.md names its cost: up to 60 pages and 60,000 rows on the list-rows meter.
- The privacy page names every `lift_sets` column, and `privacyFields.test.ts` maps each one to that sentence.
- `LIFT_REVISION` (core, `lift/revision.ts`) names the estimator that made a `LiftState`. Sets store raw values
  and e1RM is computed on read, so a new revision needs no migration.

## 5. Tests the build adds

- Contract: every bound at its edge, both ways; the key round-trips; the cursor orders `.2` before `.10`.
- API: create, read, update, delete; a second account cannot read, replace or delete the first's sets;
  duplicate keys refused; two statements per
  write; the 409 at the cap rolls back the whole batch and refunds; `insertOnly` returns skipped keys; 400 names
  the index; `lift_count` stays equal to the row count through inserts, replaces and deletes; `liftRevision`
  moves on every write and `libraryRevision` does not; account deletion leaves no `lift_sets` row.
- Browser: each cell of the table, a restart mid-send, a stale ack, a pull with a revision change between pages,
  the flush order at the cap, two tabs flushing, adoption with a clashing key, sign-out and the sweep.
