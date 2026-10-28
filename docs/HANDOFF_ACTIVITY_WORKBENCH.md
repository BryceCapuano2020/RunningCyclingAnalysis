# Activity workbench checkpoint — 28 October 2026

The user requested a checkpoint because account usage is low. **Do not deploy to production.**
The selected implementation scope is the activity-analysis workbench, before zones/calendar/load
or training recommendations. Use Luna 6 High subagents for independent work/review when helpful.

## Checkout and dependency

- Managed worktree: `/Users/brycecapuano/.codex/worktrees/activity-workbench/RunningCycling`.
- Branch: `feat/activity-analysis-workbench`, based on audit PR #126 at `1515f4fd`.
- PR #126 is another agent's completed audit work. At this checkpoint it is open with all CI checks
  green. Do not overwrite it; target its branch for a stacked feature PR until it merges, then
  rebase/retarget onto main.
- Original checkout is unchanged apart from its earlier untracked audit documents. Work here.
- Use Node **22.17.0**: prepend `/Users/brycecapuano/.nvm/versions/node/v22.17.0/bin` to PATH.
  Default shell Node 21 produces false pinned-digest failures on both the base and feature branch.

## Implemented

- Versioned core `ActivityTrace`, recorded speed/HR/power/altitude/cadence/temperature streams,
  recorded laps, half-open elapsed selections, moving-time statistics and histograms, conservative
  interval suggestions. Virtual power is excluded from measured streams.
- FIT fractional cadence and lap decoding; TCX cadence/temperature/laps; GPX cadence/temperature.
  Run cadence is normalized for FIT/TCX. GPX run cadence has explicit unknown-unit metadata.
- Bounded, scope-separated IndexedDB evidence cache (64 MiB total, 12 MiB per entry), indexed LRU
  metadata, four-entry worker memory cache, account deletion tombstones, explicit original-file
  fallback, duplicate reimport recovery and account/device identity guards.
- Workbench controls, timelines, laps, interval summary/distributions, metric selection, unit
  formatting and source-unit caveat. Privacy and architecture docs describe retention.
- Regressions identified by independent Luna reviews were addressed in the checkpoint or listed
  below. No server schema migration or scientific model revision is intended.

## Evidence already obtained

- Full core suite after cadence provenance: 114 files, **2,187 tests passed** on Node 22.
- Full private Strava export, local core import: **2,698 files, 1,947 supported activities**
  (1,801 runs, 146 rides), all trace validation passed; histogram coverage equaled selection
  observation counts. 1,393 cadence streams, 443 temperature streams, 9,836 laps. No private
  data was uploaded or committed. Script/log are `/tmp/rca-workbench-real-data.mts` and `.log`.
- Storage/session focused tests passed (113 before final core fixes), parent account/privacy/
  transport focused tests passed, UI focused tests passed before final lint refactor.
- Operations tests: 58 passed. Policy tests: 79 passed. Initial build passed.
- First desktop browser smoke: duplicate reimport and ephemeral sample passed; selection/reload
  test failed only because its case-sensitive caption locator used the old wording, now corrected.
- Independent UI review found fractional-input crash and gap-bridging plots, now fixed with tests.
  Re-review requested a common validity predicate so chart outliers match summary bounds.
- Independent core review found unknown distance at an unrecorded end boundary and TCX explicit lap
  metadata ignored; regression fixes are included in the checkpoint.
- Independent storage review's NaN byte-ledger poisoning finding was fixed and has pure regression
  coverage plus a new browser integration test awaiting execution.

## Required continuation before release

1. Read the final checkpoint validation results below; re-run only checks still missing or affected
   by subsequent changes. Confirm no active helper agent is editing before modifying files.
2. Run the complete release gates with Node 22: `npm run check`, `npm run test:perf`,
   `npm run e2e`, and `npm run e2e:worker -w @rca/web`. These never deploy. CI also runs dependency
   audit. Tests use throwaway local API/D1/R2; production must remain untouched.
3. Run new `workbench.spec.ts` and `workbench-cache.spec.ts` across Chromium and WebKit first.
   They cover cache reload, selection, duplicate reimport, sample non-persistence, explicit original
   download, account scope isolation/deletion, refused cache writes, and corrupt ledger recovery.
   Check new test assumptions rather than weakening the assertions when one fails.
4. Accessibility tests now wait for loaded workbench controls and include expanded distributions
   at 320 px. Confirm light/dark axe checks and no horizontal document overflow.
5. Further cache integration coverage should exercise actual budget eviction. NaN/corrupt shape
   recovery is covered, but an in-range yet inconsistent byte ledger (e.g. manually set 0/0 while
   rows exist) can still be trusted. Independent reviewer found no ordinary transaction path to
   this state; consider bounded reconciliation if stronger corruption recovery is required.
6. Re-review any followup fixes independently. Keep every source file under 400 lines, do not add
   lint disables, do not change scientific pins to accommodate Node 21. Avoid the previously
   declined wording changes and leave audit exclusions Q3/Q6/SEC1/S1 unchanged.
7. Create/update a draft feature PR, attach it to this chat, and obtain green CI on the final head.
   After #126 merges, rebase/retarget. Stop before production deployment. This checkpoint is not
   a completed release or a claim that all release gates passed.

Private data location and authorization are in the original checkout's ignored
`.handoff/LOCAL_DATA.md`. Keep private scripts/results outside version control and report counts
only. Existing logs under `/tmp/rca-workbench-*` can help diagnose failures.

## Final checkpoint validation

All helper agents have stopped editing. Current checkpoint passes workspace typecheck, lint,
focused UI tests (8), focused core regression tests (73), account/cache/privacy/transport tests
(136), deployment configuration tests (21), and operations tests (58). Final production build and
size-ratchet results are in `/tmp/rca-workbench-final-*`.

The complete coverage run and latest desktop browser run were intentionally stopped when the user
reported only 2% usage remaining. They overlapped a UI file extraction, so interim missing-module
errors in their logs are obsolete; the extraction is now complete. The complete release suite and
new browser tests still require a clean run from this checkpoint. No PR was created or deployment
performed. Keep this branch as a checkpoint until the remaining gates and reviews pass.
