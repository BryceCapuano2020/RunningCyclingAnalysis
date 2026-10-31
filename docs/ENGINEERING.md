# Engineering goal and pillars

## Goal

A new contributor can understand any part of RunningCyclingAnalysis in an afternoon and change it
safely the same day. Every claim the app or its docs make is backed by a test or a cited source,
and releasing is automated and boring.

Maintainability comes first. When a change makes the code harder to understand, it needs a reason
strong enough to justify that cost, and the reason belongs in the PR description.

## Pillars

1. **Maintainable by default.**
   - One module, one job. A file over 400 lines is a refactor candidate, and the size ratchet in
     `scripts/ops/size-budget.test.mjs` stops growth. A function over 60 lines is a review prompt,
     not a checked rule.
   - Shared contracts live in `packages/contract`. Shared numbers live in exactly one constant.
     Shared UI behaviour lives in one component or hook.
   - Prefer deleting code to adding it. Any new feature must name what it makes simpler, or what
     it costs, in its PR.
   - Names and comments explain why, not what. There are no lint-disable comments.
2. **Correct, with evidence.**
   - Every fix starts with a test that fails.
   - Importers are checked against real device files in `packages/core/test-corpus` and against
     independent decoders. The energy model is checked against references it was not built from,
     in `docs/validation`.
   - Numbers in docs and UI copy come from code constants, or are pinned by tests.
3. **Lean and production-grade.**
   - The service runs within Cloudflare's free tier, with explicit ceilings for every billable
     resource (`apps/api/LIMITS.md`).
   - CI is deterministic: there are no wall-clock assertions in unit tests, every job has a
     timeout, and dependencies are locked by `package-lock.json` and installed with `npm ci`.
   - Releases are gated, smoke-tested and reversible. Backups are encrypted, and restores are
     drilled.
4. **Private and secure by default.**
   - Analysis happens on the device. The server stores only what the privacy page lists.
   - Every route is scoped to its owner and budgeted, and it fails closed.
5. **Honest and accessible.**
   - The app reports estimates with their uncertainty and never ranks sporting ability.
   - Every flow works by keyboard and screen reader, at 320 px wide, and in both colour schemes.
6. **Small, reviewed changes.**
   - Each PR is one theme with a green CI.
   - Every change gets at least one independent review pass before merge.
   - No more than three PRs are stacked before the stack is reviewed and merged.

## Changing the digest

An `ActivityDigest` is stored on the server and in the browser, and read by code of other versions: a
Worker rolled back to the rollback floor (`docs/RELEASES.md`), a browser tab on yesterday's build. One
reader, in `packages/core/src/digest/readDigest.ts`, decides what a digest is for the device library,
the API and the signed-in app; the zod schemas in `packages/contract` only carry its verdict. A change
to the digest follows these rules, and each has a test that fails when it is broken.

1. **A new field is optional, and listed in the reader.** The reader builds an object that must name
   every key of `ActivityDigest`, so a key left out is a compile error. Add it to the maximal digest in
   `packages/contract/src/digestFields.test.ts` too; that test reads the digest through every reader and
   fails if a field is not kept. The compile check names the top-level keys only; a key added to a
   nested type (a split, a flag, a curve point) is guarded by that fixture alone.
2. **Every number has a bound.** Add it to `packages/core/src/digest/readLimits.ts` and to
   `docs/LIMITS.md`; `apps/web/src/limitsDoc.test.ts` fails until the page lists it, and
   `packages/contract/src/digestBounds.test.ts` holds each bound to its edge.
3. **A reader ignores a key it does not know.** It strips it, and does not keep it or refuse the digest:
   what is kept is stored and sent on, so it must have been checked. An older build then lists the
   activity without the field. `digestFields.test.ts` pins this.
4. **A new name is dropped by readers of stored data and refused on create.** A quality kind (a key of
   `flagCounts` is one too) or a record distance a build does not know is dropped from a stored row or
   the device library, and the activity stays. The server refuses it on create. A release that adds
   one still moves the rollback floor, because the floor's reader refuses a kind it does not know.
   A name is a string: a number or an object where a kind goes is damage, and is refused everywhere.
5. **A number out of bounds is unknown, not a reason to hide the activity.** A reader of stored data
   (a stored row, the device library) reads a number past its bound as that field's own unknown value
   (null for a heart rate or a mean power, NaN for a distance, climb, output or power term), cuts a
   list longer than its cap, and drops a flag, climb section, distance best or piece of evidence it
   cannot place. What names the activity (id, name, sport, version, start, duration, power source,
   model revision) is never repaired, and a value of the wrong type is damage and is never repaired.
   A create refuses all of it. `digestReaders.test.ts` requires that every row the rollback floor reads
   is read, but for those identity fields. A refused digest still carries what could be read of its
   identity (`tryReadDigest` in `@rca/core/digest/read`), with `newer` set on the stored view when a
   newer build wrote it (a version above 1, a sport this build does not know, a model revision above
   its own), so a caller can list the activity and ask for a rebuild instead of counting it unreadable.
6. **A create never takes what the rollback floor cannot read back.** `packages/contract/src/digestReaders.test.ts`
   feeds thousands of damaged copies of every kind of digest to the readers and to a frozen copy of the
   floor's schemas (`packages/contract/src/test/floorDigest.ts`), and fails if a create takes one the
   floor refuses, or if the readers differ where they should not. When the floor moves, replace the copy.
7. **A digest that exists in a library is still read.** The same test reads the sample and the
   synthetic corpus at every revision and requires the floor's reading, unchanged.

## Current hotspots

No file is over the 400-line budget. The size ratchet in `scripts/ops/size-budget.test.mjs` lists any
that is, with the most lines it may have, and stops it growing; a change to one should leave it smaller.
Hooks and components compose many small parts, so their function bodies may exceed 60 lines; the
ratchet is enforced per file.
