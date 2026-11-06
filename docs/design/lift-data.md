# Lift sets: record, storage and sync (design)

Status: designed for stage X; nothing built. Where lifting lives is settled in [strength.md](strength.md); this
note is the record, the server table and routes, the browser store and how the two agree. The estimator that
reads the sets is [e1rm.md](e1rm.md). Synthetic values only.

## 1. The set record

`LiftSet`, in `packages/core/src/lift/types.ts`, with its bounds in `lift/limits.ts`. The contract's zod schema
reads those bounds, so the API, the browser store and a later CSV import refuse the same things.

| Field         | Type                                  | Bound                                                                      |
| ------------- | ------------------------------------- | -------------------------------------------------------------------------- |
| date          | `YYYY-MM-DD`, local                   | A real date in 1970 to 2100 (`isLocalDate`, the dated-settings years).     |
| time          | `HH:MM`, local, optional              | 00:00 to 23:59.                                                            |
| timePrecision | `'set' \| 'session'`, optional        | Present exactly when `time` is.                                            |
| exercise      | slug                                  | `^[a-z0-9]+(-[a-z0-9]+)*$`, 1 to 48 characters.                            |
| equipment     | `barbell \| dumbbell \| machine \| smith \| cable \| kettlebell \| bodyweight \| other` | One of these. |
| setOrder      | integer                               | 1 to 200: position within the date and lift.                               |
| reps          | integer                               | 1 to 100.                                                                  |
| loadKg        | number                                | 0 to 1,000, at most two decimals. Added load for `bodyweight`; one dumbbell for `dumbbell`. |
| rpe           | number, optional                      | 1 to 10 in steps of 0.5.                                                   |
| warmup        | `true`, optional                      | Absent means a working set.                                                |

The **set key** is date, exercise, equipment and set order, written `2026-03-02.back-squat.barbell.3`. A
lift is exercise plus equipment (e1rm.md, section 6), so the key holds both. Pounds are converted to
kilograms when a set is entered. No field holds free text: exercise names come from the core catalog or a
slug the athlete typed, and notes are not kept.

Account-wide caps, in the contract with the other limits: 60,000 sets an account (about nine years of a
heavy lifter's logging), 500 sets in one write, 500 keys in one delete.

## 2. Server

**Table `lift_sets`** (migration 0012, written by hand as 0009 is): `user_id`, `date`, `exercise`,
`equipment`, `set_order`, `reps`, `load_kg`, `rpe` (null), `warmup` (0 or 1), `time` (null),
`time_precision` (null), `updated_at`. Primary key `(user_id, date, exercise, equipment, set_order)`. Foreign
key `user_id` to `users(id)` on delete cascade, so account deletion needs no new statement. Check constraints
hold the equipment and precision names, and `time` and `time_precision` null together. The same migration
adds `users.lift_revision INTEGER NOT NULL DEFAULT 0`. A new table and a defaulted column leave the rollback
floor's Worker working.

**Routes**, each behind `requireUser`, a body limit and a daily budget of its own (`liftRead`, `liftWrite`),
listed in `apps/api/LIMITS.md`:

| Route                     | Body                     | Does                                                                                                      |
| ------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------- |
| `GET /api/lifts?cursor=`  |                          | One page of 1,000 sets in key order, and the next cursor. Also counts on the list-rows meter.             |
| `PUT /api/lifts`          | `{ sets }`, 1 to 500     | Inserts or replaces each set by its key. The count check and the inserts are one batch: a write that would take the account past 60,000 sets is refused whole with 409, and a replace needs no place. |
| `POST /api/lifts/delete`  | `{ keys }`, 1 to 500     | Removes those sets. A key with no set is not an error, so a resent delete settles.                       |

Every write bumps `users.lift_revision` in the same batch. `libraryRevision` in `routes/me.ts` becomes
`<count>.<bytes>.<liftRevision>`, so another tab or device sees a lift change. Readers compare it for
inequality only, so the longer form needs no client change. A refused write is refunded, as the dated
settings are.

## 3. Browser

**Store.** IndexedDB database `rca-lifts`, opened through `openIndexedDb`, one object store `rows` keyed
`<scope>|<set key>` with an index on `scope`. The scope is `device` when signed out and the user id when signed
in. A row holds the set, a state (`synced`, `put`, `delete`), `rev` (a counter raised on each local change)
and `attempts`. A signed-out visitor's sets live only here. A signed-in account's server copy is the record,
and the store holds a mirror plus the changes not yet sent, so a set logged without signal in a gym is kept.

**Transitions** of one row in an account's scope. "Ack r" is the server's answer to a send of `rev` r.

| State \ event          | Local save               | Local delete             | Ack r, r = rev                    | Ack r, r < rev | Refused (400)               | Cap (409)        | Network, 5xx, 429      | Pull has the set        | Complete pull lacks the set |
| ---------------------- | ------------------------ | ------------------------ | --------------------------------- | -------------- | --------------------------- | ---------------- | ---------------------- | ----------------------- | --------------------------- |
| absent                 | put, rev 1               | absent                   | n/a                               | n/a            | n/a                         | n/a              | n/a                    | synced                  | absent                      |
| synced                 | put, rev + 1             | delete, rev + 1          | n/a                               | n/a            | n/a                         | n/a              | n/a                    | synced, server's values | absent                      |
| put                    | put, rev + 1             | delete, rev + 1          | synced                            | unchanged      | absent; counted as not saved | put, held       | put, attempts + 1      | unchanged               | unchanged                   |
| delete                 | put, rev + 1             | delete                   | absent                            | unchanged      | absent                      | n/a              | delete, attempts + 1   | unchanged               | unchanged                   |

- **Restart** (tab, worker or browser): rows keep their state, and the next flush resends every `put` and
  `delete`. A resend is safe: a put replaces, a delete of a missing set settles.
- **Stale reply**: an ack applies only when `rev` still matches, checked in the transaction that writes it, so
  an edit made while a send was out is never marked saved.
- **Never dropped for retries.** Unlike the activity outbox, a set has no file to add again, so a row is only
  let go on a 400. A 409 holds puts until a delete frees room or the next session.
- **Pull** reads every page first, then applies them in one pass. Only a complete pull removes a `synced` row
  the server lacks, so a cut-off pull never deletes.
- **Two tabs** share the store. Each change is one transaction, so a tab never overwrites a newer `rev`.
- **Sign-in with device sets** (adoption): each `device` row becomes a `put` in the account's scope unless the
  account already has that key, in which case the account's set stays and the device row is counted as not
  added. Device rows go once adopted.
- **Sign-out** removes the account's `synced` rows and keeps its `put` and `delete` rows for its next sign-in.
  **Sign-in of another account** removes every other account's rows, as the outbox sweep does, so a shared
  browser never hands one person's log to another. Remove all clears the whole database.
- **Account deleted elsewhere**: a 401 stops the flush; the next sign-in's sweep removes the rows.

## 4. Export, privacy, revision

- The account export moves to `EXPORT_VERSION` 3 and gains `lifts: LiftSet[]`, read from the server.
- The privacy page names every `lift_sets` column, and `privacyFields.test.ts` maps each one to that sentence.
- `LIFT_REVISION` (core, `lift/revision.ts`) names the estimator that made a `LiftState`. Sets store raw values
  and e1RM is computed on read, so a new revision needs no migration.

## 5. Tests the build adds

- Contract: every bound at its edge, both ways; the key round-trips.
- API: create, read, update, delete; a second account cannot read or touch the first's sets; the 409 at the
  cap with the refund; the page cursor; `lift_revision` moves on every write and `libraryRevision` with it;
  account deletion leaves no `lift_sets` row.
- Browser: each cell of the table above, a restart mid-send, a stale ack, a cut-off pull, adoption with a
  clashing key, sign-out and the sweep.
