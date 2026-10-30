# Build process

How a change gets from the plan to `main`. Most work here is done by Claude Code: one coordinator
session plans, briefs and merges, and subagents build, review and gate in their own git worktrees.
These rules come from measuring that loop over a week of late October 2026 (about 100 pull requests
and the coordinator's own transcript). When a retro finds a better way, change this file.

## Roles

- **Coordinator.** One session per wave. It owns the plan and the queue, briefs agents, and merges.
  It edits little code itself.
- **Builder** (`rca-builder`): one scoped change in its own worktree, with tests.
- **Reviewer** (`rca-reviewer`): read-only, with ranked findings at `file:line`.
- **Gate** (`rca-gate`): one stage-gate check on a built `main` between stages.

The agent definitions live in `.claude/agents/` (local, not in the repository). Spawn agents by
`subagent_type`, not as general-purpose agents told to read a file: the type applies its model and
tool limits, so a reviewer really cannot write. A session loads agent types when it starts.

## The coordinator never waits

- Auto-merge is always on. Every pull request that is ready for review gets squash auto-merge as
  soon as it is opened (`gh pr merge --auto --squash <number>`), and a draft gets it when it is
  marked ready, which happens once review has passed. GitHub has no default for this, and a workflow
  cannot set it with the default token, because a merge made through `GITHUB_TOKEN` starts no CI
  run on `main`; so whoever opens the pull request sets it.
- No turn ends on "waiting for checks". After setting auto-merge, move to the next unblocked item.
  The app's CI monitor wakes the session when a check fails, a conflict appears or a review comment
  arrives.
- Never poll CI (`gh pr checks`, `gh run watch`, sleep loops). Each poll re-reads the whole context.
- Never end a turn on a question while queued work is unblocked. Ask, then carry on with the work
  the answer does not affect.
- The queue lives in the stage plan (`.claude/stage-<x>/PLAN.md`) and its status file, so "what
  next" never needs the owner.

Why: the coordinator was idle about two thirds of its active time, mostly between a pull request
going green and the next instruction, and CI polling was 14% of its calls.

## Sessions and context

- Start a fresh coordinator session for each wave, from the stage plan, its status file and memory.
  End it when the wave has merged.
- Subagent reports stay short, about 1 KB: branch, sha, verdict, decisions others need and what is
  left. Detail belongs in the commit message or the pull request body.
- Read only the section of a long document that the task needs.
- A package design stays under about 200 lines: decisions, interfaces and acceptance tests.

Why: the coordinator's context averaged about 460k tokens per call and compacted 15 times, and
subagent reports were most of it.

## Branches and pull requests

- One package per pull request, at about 600 changed lines or fewer, tests included. Split a large
  package by finding.
- Open a draft pull request as soon as the first commit builds, so CI runs the full suite on a clean
  runner while review happens.
- Push ordinary commits and never squash locally: GitHub squashes on merge. Two local squashes
  reverted merged work (#41 undid #39, and #158 undid #155).
- Never rebase a green pull request. `main` does not require branches to be up to date. Rebase
  only for a conflict, or when a merged change touches this pull request's tests, and then push with
  `--force-with-lease`.
- Remove the worktree when its pull request merges.

Why: half of all re-pushes came after a green run, only about 40% of CI time went into runs that
counted, and pull requests over 1,000 lines took about twice as long to merge.

## Tests on the shared machine

- The machine has 8 cores, so keep vitest workers machine-wide at about 8 (test slots times
  workers per slot).
- Run every vitest, Playwright, perf, simulation and full typecheck run through the stage's
  `testslot.sh`.
- Run the tests for the code you touched, and leave the full suite to CI.
- Reviewers do not run tests.
- A test that fails only under load is rerun alone before it counts as a failure.

Why: load reached four to six times the core count, and unit tests then failed on the 5-second
timeout at random.

## CI

- A documentation-only pull request (every changed file is Markdown, under `docs/` or `LICENSE`)
  takes a short lane: format, lint, the ops tests and the unit tests that read Markdown.
- Unit tests run in two shards and end-to-end tests in three, so a code pull request finishes in
  about the time of its slowest shard rather than the whole suite. Every push to `main` gets its
  own run, and only pull request runs are cancelled by a newer push.
- A flaky Playwright test fails CI by design (`failOnFlakyTests`). Fix it the same day, or move it
  out of the required run with an issue that names it. Rerun a failed job at most once.
- A failed performance budget is a regression until shown otherwise.

## Review

- Every change gets an independent review. Fix and re-review until there are no blockers.
- For changes to account, sync or worker-lifecycle state, write the transition table first (states
  by events, including worker restarts and stale replies) and get it reviewed before coding.
- If a third round still finds a blocker, stop and re-scope or split the pull request.

## Retro at each gate

At each stage gate the coordinator writes recurring problems into this file or into
`.claude/agents/`, so the next wave starts with them.

## Repository settings this process assumes

These are owner settings in GitHub, not files in the repository.

- Allow auto-merge (Settings, General).
- Branch protection on `main` without "require branches to be up to date".
- Required checks: `Lint, typecheck, unit tests, build`, `End-to-end (Playwright)`,
  `Dependency audit`, `Performance budgets` and `Statistical simulations`.
