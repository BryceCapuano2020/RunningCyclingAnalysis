# Stage D retro

What the process cost and where it broke during Stage D, with the fix for each. The rules that came
out of it are in [PROCESS.md](PROCESS.md). Numbers are from `gh pr list --state merged` and the CI
history of `main` for pull requests #185 to #341.

## Numbers

- 147 pull requests merged. Median time from open to merge was 1.7 hours; the slowest tenth took
  more than 7.8 hours.
- Size still tracks time. Under 300 changed lines (51 PRs): 0.5 hours. 300 to 1,000 (63): 2.2 hours.
  Over 1,000 (33): 3.2 hours.
- About 700 CI runs, near five per merged PR. Only 6 were re-run attempts of the same commit, so
  the cost is new pushes, not reruns.
- 38 of 147 pushes to `main` failed. `main` was red for about 21 of the 36 hours (first failing run
  to the next green run, so overlapping runs make it approximate). There were 20 red spells. The
  median lasted about an hour and the longest about three.

## What kept main red

Counts are failed runs by job; a run can fail more than one.

- Flaky Playwright shards: 13. Fixed one by one (#268, #336, #337).
- Shuffled unit order: 10. That job is not a required check, so PRs merged past it. Fixed by making
  tests independent of order and of the clock (#299, #300, #328).
- Performance budgets at the edge: 8. Several budgets had almost no headroom, so a slow runner
  failed them. #335 added headroom.
- Two PRs that pass alone and break `main` together: 9. Two PRs each added to
  `packages/core/src/types.ts`, and together it crossed the 400-line limit (#245). Two merges each added the same package export, which
  broke the typecheck for six runs in a row (#252). Neither PR was wrong on its own.
- Unit shard failures: 2.

The conflict rate between PRs stayed small. The red runs came from checks that no single PR run
could see, and from checks that were not required.

## What went wrong, and the fix

- **Disk full from about 90 worktrees.** Worktrees were left behind after merge. Fix: builders
  remove theirs on merge (in `rca-builder`), and the coordinator sweeps merged ones at the start of
  each wave. Cap: about 15 live worktrees.
- **40 orphaned CPU burners held load at 130 for hours.** Agents started load to reproduce flakes and
  left it running. Fix: kill them before reporting (in `rca-builder`), and reproduce
  load only through `testslot.sh`, with a timeout.
- **Auto-merge set before review.** A PR could merge before its review was done. Fix: only the coordinator marks ready, after review passes.
- **Shared git stash stack.** The stack is shared by every worktree, so one agent can pop another's
  entry. Fix: never use `git stash`; use a WIP commit (in `rca-builder`).
- **PRs that pass alone and break `main` together.** See above. Fix: keep near-limit files and
  budgets from being grown by two PRs at once (rule 4).
- **Personal data in public text.** Personal data reached a design doc table and a pull request body. The doc text was removed (#341), but git history keeps it. Fix: the reviewer reads the PR body, commit messages and every added doc line, not only code.
- **A PR merged into the wrong branch.** #285 was stacked on #286's branch, so it merged into that
  branch and reached `main` only with #286. Another stacked PR (#314) did the same. Fix: a stacked
  PR retargets to `main` after its base merges, and auto-merge is set only then.
- **Pin-changing PRs serialised by hand.** The coordinator held back the second PR that moved the
  identity pins by hand. Fix: the rule stays (one in flight). `pr:queue` should
  mark pin-changing PRs so the coordinator does not have to remember. That change is not built yet.

## Rules to keep

No polling of CI. Ready before the final push. No local squash. Test slots and the machine-wide
worker count. Short reports. The documentation-only lane and sharded CI. Draft PRs skip long CI.
The 400-line limit. Transition tables before sync code. Fresh coordinator per wave.

## Rules added

Added to [PROCESS.md](PROCESS.md). Rules 1, 4 and 5 also go into `.claude/agents/rca-builder.md`
(local file) as one line each.

1. Builders open drafts and never mark ready or set auto-merge.
2. A stacked PR retargets to `main` after its base merges, then gets auto-merge.
3. Shuffled unit order is a required check. While `main` is red, no PR is marked ready until a fix
   PR is open, and the fix merges first.
4. A file over 360 lines or a performance budget under 15% headroom is split or loosened first.
   Two ready PRs never both grow one.
5. Review covers public text: PR body, commit messages and added doc lines carry no personal
   data, dates or figures from the owner's exports.
