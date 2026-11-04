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

## Guards

Rules that prose kept failing to hold are hooks in `.claude/settings.json`, which every session in
this repository loads when it starts:

- Before each prompt, `pr-queue.mjs --action` prints the pull requests that need someone (a failing
  or stale run, a conflict, auto-merge off) and a red `main`. It prints nothing when all is well.
- Before each shell command, `agent-guard.mjs` refuses: a vitest or Playwright run (directly, or
  through any `test`, `e2e`, `check` or `verify:release` script) outside the test slot;
  `gh pr checks`, `gh run watch`, watch loops and sleeps that wait on CI; `git stash`; a push to
  `main` or a force-push without a lease. A deploy, a remote Wrangler call or a secret asks the
  owner in the main session and is refused to agents.
- The split between coordinator and agents: an agent (any subagent) opens pull requests as drafts
  and cannot mark one ready or merge it by any route, and the reviewer cannot commit, push or write
  to a pull request.
- The owner's evals (`evals/owner-caught`) are the owner's: `agent-guard.mjs` refuses Edit, Write,
  NotebookEdit and shell writes there in every session, and refuses `gh` calls that add or create the
  `owner-evals` label; the `size` job fails a pull request that changes the folder without that label.
- At startup, `worktree-sweep.mjs` removes clean worktrees under `.claude/worktrees` whose pull
  request has merged or closed, and lists detached ones and finished ones holding uncommitted work.

A refused command is a signal, not an obstacle: do not route around it with another tool.

## The coordinator never waits

- Auto-merge is always on. Every pull request that is ready for review gets squash auto-merge as
  soon as it is opened (`gh pr merge --auto --squash <number>`), and a draft gets it when it is
  marked ready, which happens once review has passed. GitHub has no default for this, and a workflow
  cannot set it with the default token, because a merge made through `GITHUB_TOKEN` starts no CI
  run on `main`; so whoever opens the pull request sets it.
- No turn ends on "waiting for checks". After setting auto-merge, move to the next unblocked item.
  The app's CI monitor wakes the session when a check fails, a conflict appears or a review comment
  arrives.
- The monitor wakes a session only for a pull request with Auto-fix on, and nothing wakes it when a
  pull request merges. A turn that leaves a ready pull request without Auto-fix says so in its last
  message, with that pull request's state, so the owner can turn it on.
- Start every turn with one `npm run pr:queue`, so a red run that no monitor reported is found the
  next time anyone writes.
- Never poll CI (`gh pr checks`, `gh run watch`, sleep loops). Each poll re-reads the whole context.
  To see the queue, run `npm run pr:queue` once: one line per open pull request with what it needs
  next (a run that saw a draft, failing checks, a conflict, auto-merge off, running, merging, draft)
  and whether `main` is green.
- Keep about six pull requests open. Start a new builder when one merges, not before.
- Never end a turn on a question while queued work is unblocked. Ask, then carry on with the work
  the answer does not affect.
- The queue lives in the stage plan (`.claude/stage-<x>/PLAN.md`) and its status file, so "what
  next" never needs the owner.

Why: the coordinator was idle about two thirds of its active time, mostly between a pull request
going green and the next instruction, and CI polling was 14% of its calls. A day later polling was
40% of its shell calls, and with 14 pull requests open and none merging for three hours the weekly
usage limit ran out. In November #398 failed a performance budget with auto-merge on and no
monitor, and sat red for seven hours until the owner looked. The pull request stacked on it waited
for a merge that would have woken no one.

## Sessions and context

- Start a fresh coordinator session for each wave, from the stage plan, its status file and memory.
  End it when the wave has merged.
- Subagent reports stay short, about 1 KB: branch, sha, verdict, decisions others need and what is
  left. Detail belongs in the commit message or the pull request body.
- Read only the section of a long document that the task needs.
- A package design stays under about 200 lines: decisions, interfaces and acceptance tests.

Why: the coordinator's context averaged about 460k tokens per call and compacted 15 times, and
subagent reports were most of it.

## Formula and model changes

A change to a formula, a model or one of its constants (a threshold estimator, a grade anchor, an
economy, a zone rule) goes through these steps before code:

1. A spec in `docs/design/` with the formula, every constant and the published source behind it.
2. A prototype on synthetic athletes that shows what the change does to their numbers.
3. A science review of the spec and the numbers only, not the code, by an Opus reviewer:
   `rca-reviewer` spawned with the Agent tool's `model` set to `opus`, since its definition runs on
   Sonnet.
4. One presentation to the owner: the spec, the numbers and the reviewer's verdict together.

The pull request that builds it adds a calibration case on synthetic athletes: a test that pins the
model's figures against its published source. In autonomous mode the spec and the reviewer's
verdict stand in for the owner's "build it", and the pull request stays a draft until the owner has
read the spec.

Why: formula proposals reached the owner unreviewed, and a grade anchor shipped without
calibration. The owner caught both on their own data.

## Branches and pull requests

- One package per pull request, at about 600 changed lines or fewer, tests included. Split a large
  package by finding.
- Open a draft pull request as soon as the first commit builds, so review can start. A draft runs
  no long CI jobs; the full suite runs when it is marked ready.
- Mark a pull request ready before its final push, never in the same moment after one. A push and
  `gh pr ready` seconds apart gave #213, #227 and #232 a single run that saw a draft and failed on
  purpose. CI now reads the draft state when it runs, so re-running all jobs fixes such a run.
- Keep one pull request that changes pinned results (the identity tests) in flight at a time, and
  merge it before the next one starts. Two at once re-pin against each other until one is held.
- Builders open drafts and never mark one ready or set auto-merge. The coordinator does both once
  review has no blockers.
- A stacked pull request does not wait for its base to merge, since a merge wakes no one. When the
  base is marked ready, rebase the stacked one onto the base's tip, retarget it to `main`, mark it
  ready and set auto-merge. `main` does not require branches to be up to date, so either may land
  first. If the stacked one lands first it carries the base, which is then closed as included. One
  merged into its base branch (#285 into #286's) reaches `main` only with that base.
- A stack is at most three pull requests deep. Past that, land the base before stacking more: a
  deeper stack stalls as one when its base fails, and every fix to the base ripples up through it.
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

- Dependabot pull requests are in the queue like any other. One that sits on a red `main` needs a
  rebase (comment `@dependabot rebase`). The Node types stay on the Node major in `.nvmrc`.
- A builder's green is a claim, not a result. A pull request is green only when CI's run on its
  head commit passes, as `npm run pr:queue` shows; the coordinator never marks one ready, or calls it
  done, on a builder's report alone. The stage U process review found builder reports of a pass
  that CI did not confirm, so builders list the exact commands and Playwright projects they ran.
- A documentation-only pull request (every changed file is Markdown, under `docs/` or `LICENSE`)
  takes a short lane: format, lint, the ops tests and the unit tests that read Markdown.
- Unit tests run in two shards and end-to-end tests in three, so a code pull request finishes in
  about the time of its slowest shard rather than the whole suite. Every push to `main` gets its
  own run, and only pull request runs are cancelled by a newer push.
- A flaky Playwright test fails CI by design (`failOnFlakyTests`). Fix it the same day, or move it
  out of the required run with an issue that names it. Rerun a failed job at most once.
- A failed performance budget is a regression until shown otherwise.
- A failed run gets one complete fix. Read every failed job, not just the first. For a performance
  budget, read every budget's figure in that run and fix or loosen each one under 15% headroom in
  the same push. For a timeout, list the tests over half the limit. #398 took three rounds of one
  push and one run each: the 12-week load, then a test timing out under coverage, then the body mass
  change.
- While `main` is red, no pull request is marked ready until a fix is open, and the fix merges first.
- A pull request over 800 changed lines (`package-lock.json` aside) fails the size job unless it
  carries the `integration` label, which marks a merge of pull requests already reviewed on their
  own. Re-run the job after adding the label.
- Pull requests audit production dependencies; the weekly supply-chain run audits every dependency.
- A file over 360 lines, or a performance budget with under 15% headroom, is split or loosened
  before the next change to it. Two ready pull requests never both grow one: each passes alone and
  the merge breaks `main`.

## Review

- Every change gets an independent review. Fix and re-review until there are no blockers.
- A change to a model whose figures the athlete sees adds a row to the
  [model ledger](design/model-ledger.md): the pull request, why, and its effect on synthetic
  athletes. A model changed in the current stage stays frozen until the owner has used it for a day,
  unless a bug forces a fix.
- Review reads the public text too: the PR body, commit messages and every added doc line. None may
  carry personal data, dates or figures from the owner's exports.
- For changes to account, sync or worker-lifecycle state, write the transition table first (states
  by events, including worker restarts and stale replies) and get it reviewed before coding.
- If a third round still finds a blocker, stop and re-scope or split the pull request.

## Releases

- Release each package on its own, once it is green on `main` and has passed the replica (the
  signed-in replica and its truth check, which stay local), with the owner's go each time. One go
  covers one release and never carries over to the next.
- The steps run from a clean worktree at the release commit, and every release gets a row in
  [RELEASES.md](RELEASES.md).

Why: one package per release keeps a regression traceable to one change, and the owner uses each
change on their own data before the next lands.

## Retro at each gate

At each stage gate the coordinator writes recurring problems into this file or into
`.claude/agents/`, so the next wave starts with them. The latest is [RETRO_STAGE_D.md](RETRO_STAGE_D.md).

## Repository settings this process assumes

These are owner settings in GitHub, not files in the repository.

- Allow auto-merge (Settings, General).
- Branch protection on `main` without "require branches to be up to date".
- One required check, `CI result`, which passes only when every gating job passed. Until the owner
  swaps to it, the older list stands: `Lint, typecheck, unit tests, build`,
  `End-to-end (Playwright)`, `Dependency audit`, `Performance budgets`, `Statistical simulations`
  and `Unit tests in shuffled order`.
- Head branches deleted on merge (Settings, General), so GitHub retargets a stacked pull request to
  `main` when its base merges.
