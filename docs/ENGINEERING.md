# Engineering goal and pillars

## Goal

A new contributor can understand any part of RunningCyclingAnalysis in an afternoon and change it
safely the same day. Every claim the app or its docs make is backed by a test or a cited source,
and releasing is automated and boring.

Maintainability comes first. When a change makes the code harder to understand, it needs a reason
strong enough to justify that cost, and the reason belongs in the PR description.

## Pillars

1. **Maintainable by default.**
   - One module, one job. A file over 400 lines, or a function over 60 lines, is a refactor
     candidate, and the size ratchet in `scripts/ops/size-budget.test.mjs` stops growth.
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
     timeout, and dependencies are pinned.
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

## Current hotspots

These core files are over the 400-line budget and are held by the size ratchet. A change to one
should leave it smaller; the API's activity routes, the web app's analysis hook and `App.tsx` were
split this way in the refactor that introduced this document.

| File                                  | Lines | Direction                                                   |
| ------------------------------------- | ----- | ----------------------------------------------------------- |
| `packages/core/src/fit/archive.ts`    | 670   | Separate zip, gzip and nesting from the per-entry policy    |
| `packages/core/src/session.ts`        | 568   | Move near-duplicate grouping and library bookkeeping out    |
| `packages/core/src/xml/parse.ts`      | 438   | Separate entity decoding and the tree builder from the scan |
| `packages/core/src/digest/combine.ts` | 407   | Move the virtual-power accuracy and summaries out           |

Hooks and components compose many small parts, so their function bodies may exceed 60 lines;
the ratchet is enforced per file.
