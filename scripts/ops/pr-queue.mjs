import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// One line per open pull request saying what it needs next, so the coordinator reads the queue in
// one command instead of polling checks (docs/PROCESS.md). npm run pr:queue, or --json for objects.
// --action prints only what needs someone to act, and nothing when all is well: the UserPromptSubmit
// hook in .claude/settings.json runs it before every prompt.

/** The required checks that only collect their shards; a failed shard says more. */
const COLLECTORS = ['Lint, typecheck, unit tests, build', 'End-to-end (Playwright)', 'CI result']
/** Checks that run on every code pull request but do not block a merge. */
export const OPTIONAL = ['Unit tests in shuffled order']
/** CI skips this job only when its run decided the pull request was a draft. */
const STATIC_JOB = 'Lint, typecheck, build'
// CANCELLED is read on its own (see verdict): a replaced run, or a timeout next to the real failure.
const FAILED = new Set(['FAILURE', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE'])
const FIELDS =
  'number,title,isDraft,mergeStateStatus,autoMergeRequest,headRefName,author,statusCheckRollup'

/** Most urgent first: these need someone to act, the rest only need time. */
const ORDER = [
  'stale-draft-run',
  'failing',
  'conflict',
  'no-auto-merge',
  'no-checks',
  'running',
  'merging',
  'draft',
]

const IDS = /\/runs\/(\d+)(?:\/job\/(\d+))?/

/** One rollup item as a check, with the workflow run and job it came from (0 when unknown). */
function toCheck(item) {
  if (item.__typename === 'StatusContext') {
    const failed = item.state === 'ERROR' ? 'FAILURE' : item.state
    return {
      name: item.context,
      done: item.state !== 'PENDING' && item.state !== 'EXPECTED',
      result: item.state === 'SUCCESS' ? 'SUCCESS' : failed,
      at: item.startedAt ?? '',
      end: '',
      workflow: null,
      run: 0,
      job: 0,
    }
  }
  const [, run, job] = IDS.exec(item.detailsUrl ?? '') ?? []
  return {
    name: item.name,
    done: item.status === 'COMPLETED',
    result: item.conclusion,
    at: item.startedAt ?? '',
    end: item.completedAt ?? '',
    workflow: item.workflowName ?? '',
    run: Number(run ?? 0),
    job: Number(job ?? 0),
  }
}

/**
 * Each check as the latest attempt of the latest run on the head commit. A commit keeps cancelled
 * and draft-gate runs beside the run that replaced them; a job that only an older run has is
 * dropped, so a stale failure never surfaces. A StatusContext keeps its newest report.
 */
export function latestChecks(rollup = []) {
  const checks = rollup.map(toCheck)
  const newestRun = new Map()
  for (const c of checks) {
    if (c.workflow !== null)
      newestRun.set(c.workflow, Math.max(newestRun.get(c.workflow) ?? 0, c.run))
  }
  const latest = new Map()
  for (const check of checks) {
    if (check.workflow !== null && check.run < newestRun.get(check.workflow)) continue
    const seen = latest.get(check.name)
    // A re-run attempt has a higher job id. A queued check may lack a start time and then belongs
    // to the newest attempt.
    const newer =
      check.job && seen?.job
        ? check.job >= seen.job
        : seen?.done && (!check.done || check.at >= seen.at)
    if (!seen || newer) latest.set(check.name, check)
  }
  return latest
}

/**
 * How long a finished run may stand as the latest before it counts: marking a pull request ready or
 * pushing cancels the old run, and the new run's checks reach the rollup a little later.
 */
export const SETTLE_MS = 10 * 60 * 1000

/** Whether the latest run finished within SETTLE_MS of now, so a newer run may still be on its way. */
function settling(checks, now) {
  const ends = [...checks.values()].map((c) => Date.parse(c.end)).filter(Number.isFinite)
  return ends.length > 0 && now - Math.max(...ends) < SETTLE_MS
}

/** What one pull request needs next: { kind, detail }. */
export function verdict(pr, now = Date.now()) {
  if (pr.isDraft) {
    return { kind: 'draft', detail: pr.mergeStateStatus === 'DIRTY' ? 'conflict with main' : '' }
  }
  const checks = latestChecks(pr.statusCheckRollup)
  if (pr.mergeStateStatus === 'DIRTY') return { kind: 'conflict', detail: 'rebase on main' }
  // A run that saw a draft, or one a newer push or ready event cancelled, is replaced by the run that
  // follows. Only when no newer run has shown up after SETTLE_MS does it need someone.
  const sawDraft = checks.get(STATIC_JOB)?.result === 'SKIPPED'
  const all = [...checks.values()]
  // A timed-out job also reads CANCELLED: a real failure beside it wins, and a run with jobs still
  // going is not finished yet.
  const failedJob = all.some(
    (c) => c.result === 'FAILURE' && !OPTIONAL.includes(c.name) && !COLLECTORS.includes(c.name),
  )
  const cancelled =
    !failedJob && all.every((c) => c.done) && all.some((c) => c.result === 'CANCELLED')
  if ((sawDraft || cancelled) && settling(checks, now)) {
    return { kind: 'running', detail: 'its last run was replaced; the next one is starting' }
  }
  if (sawDraft) {
    return {
      kind: 'stale-draft-run',
      detail: 'its run saw a draft: re-run all jobs or push a commit',
    }
  }
  if (cancelled) {
    return { kind: 'stale-draft-run', detail: 'its run was cancelled and none followed: re-run it' }
  }
  if (checks.size === 0) return { kind: 'no-checks', detail: 'no CI run yet' }
  const failed = [...checks.values()].filter((c) => c.done && FAILED.has(c.result))
  const blocking = failed.filter((c) => !OPTIONAL.includes(c.name))
  const optionalFailed = failed.filter((c) => OPTIONAL.includes(c.name))
  const optional = optionalFailed.length
    ? `; not required, failing: ${optionalFailed.map((c) => c.name).join(', ')}`
    : ''
  if (blocking.length) {
    const jobs = blocking.filter((c) => !COLLECTORS.includes(c.name))
    const shown = (jobs.length ? jobs : blocking).map(
      (c) => `${c.name} (${c.result.toLowerCase()})`,
    )
    return { kind: 'failing', detail: shown.join(', ') + optional }
  }
  const running = [...checks.values()].filter((c) => !c.done).length
  if (running)
    return { kind: 'running', detail: `${running} of ${checks.size} checks running${optional}` }
  if (!pr.autoMergeRequest) {
    return {
      kind: 'no-auto-merge',
      detail: `green: gh pr merge --auto --squash ${pr.number}${optional}`,
    }
  }
  return { kind: 'merging', detail: `green, auto-merge on${optional}` }
}

/** The queue, most urgent first, then by number. */
export function queue(prs) {
  return prs
    .map((pr) => ({ number: pr.number, title: pr.title, author: pr.author?.login, ...verdict(pr) }))
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.number - b.number)
}

/** Kinds that need someone to act now; the rest only need time or belong to a builder. */
export const ACTION = ['stale-draft-run', 'failing', 'conflict', 'no-auto-merge']

/** How many pull requests may be open at once, bots aside (docs/PROCESS.md, The coordinator never waits). */
export const OPEN_CAP = 6

/**
 * One line when more pull requests are open than OPEN_CAP, or ''. Dependabot's are left out: its own
 * config caps them. Past the cap the queue stalls as one, so slices land through a feature branch.
 */
export function capLine(rows) {
  const open = rows.filter((row) => !row.author?.startsWith('app/')).length
  return open > OPEN_CAP
    ? `${open} pull requests open, cap ${OPEN_CAP}: open no new one, and merge reviewed slices into their feature branch (docs/PROCESS.md)`
    : ''
}

/** The --action text: a red main, the rows that need action and the cap line, or '' when there are none. */
export function actionText(mainLine, mainState, rows) {
  const lines = rows.filter((row) => ACTION.includes(row.kind)).map(formatLine)
  if (mainState.startsWith('RED')) lines.unshift(mainLine)
  const cap = capLine(rows)
  if (cap) lines.push(cap)
  return lines.length
    ? ['PR queue, needs action (npm run pr:queue for all):', ...lines].join('\n')
    : ''
}

export function formatLine(row) {
  const title = row.title.length > 60 ? `${row.title.slice(0, 59)}…` : row.title
  return `#${row.number}  ${row.kind.padEnd(15)}  ${title}${row.detail ? `\n        ${row.detail}` : ''}`
}

function gh(args) {
  return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const rows = queue(gh(['pr', 'list', '--state', 'open', '--limit', '100', '--json', FIELDS]))
    const [main] = gh([
      'run',
      'list',
      '--branch',
      'main',
      '--workflow',
      'CI',
      '--limit',
      '1',
      '--json',
      'headSha,status,conclusion',
    ])
    const mainState = !main
      ? 'no run'
      : main.status !== 'completed'
        ? 'running'
        : main.conclusion === 'success'
          ? 'green'
          : `RED (${main.conclusion})`
    const mainLine = `main ${main?.headSha?.slice(0, 8) ?? ''}: ${mainState}`
    if (process.argv.includes('--json')) {
      console.log(JSON.stringify({ main: { sha: main?.headSha, state: mainState }, rows }, null, 2))
    } else if (process.argv.includes('--action')) {
      const text = actionText(mainLine, mainState, rows)
      if (text) console.log(text)
    } else {
      console.log(mainLine)
      for (const row of rows) console.log(formatLine(row))
      const cap = capLine(rows)
      if (cap) console.log(cap)
    }
  } catch (error) {
    console.error(`pr-queue could not run: ${error.message}`)
    process.exitCode = 1
  }
}
