# A re-imported set replaces the stored one

Stage X, 6 Nov 2026. Open question 1 of [strength.md](../strength.md), section 4.

## Decision

When a set arrives with the date, exercise, equipment and set order of a stored set, the new set replaces it.
The logger, a CSV import and an account adoption all write through the same `PUT /api/lifts`, which inserts or
replaces by key ([lift-data.md](../lift-data.md)). A CSV import says before it writes how many sets it will
replace. The one exception is adoption at sign-in: a set kept in the browser before sign-in never replaces one
the account already holds.

## Why

- Replacing is how a typo gets fixed. An athlete who corrects a set in another app and exports again expects
  the correction to land. Keeping the stored set would ignore it with no sign.
- One rule for the logger and the import. An edit in the logger is a replace by key already, so keeping on
  import would make the same key behave two ways.
- Re-importing the same file is harmless: the values are the same.
- Adoption is the exception because the device copy may come from a shared browser, and an account's own log
  outranks it.

## Cost

- A CSV row with no RPE replaces a logged set that had one. The import's count of replaced sets is the warning.
- A set deleted in the source app is not deleted here: a replace by key cannot see a missing row.

## How to reverse

Change the import to skip keys the account already holds (`INSERT ... ON CONFLICT DO NOTHING` for import
writes). No stored data changes. If the import later needs both, a `mode` on the write request carries it.
