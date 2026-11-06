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
const FAILED = new Set(['FAILURE', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE'])
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

/** What one pull request needs next: { kind, detail }. */
export function verdict(pr) {
  if (pr.isDraft) {
    return { kind: 'draft', detail: pr.mergeStateStatus === 'DIRTY' ? 'conflict with main' : '' }
  }
  const checks = latestChecks(pr.statusCheckRollup)
  if (pr.mergeStateStatus === 'DIRTY') return { kind: 'conflict', detail: 'rebase on main' }
  if (checks.get(STATIC_JOB)?.result === 'SKIPPED') {
    return {
      kind: 'stale-draft-run',
      detail: 'its run saw a draft: re-run all jobs or push a commit',
    }
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

/** The --action text: a red main and the rows that need action, or '' when there are none. */
export function actionText(mainLine, mainState, rows) {
  const lines = rows.filter((row) => ACTION.includes(row.kind)).map(formatLine)
  if (mainState.startsWith('RED')) lines.unshift(mainLine)
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
    }
  } catch (error) {
    console.error(`pr-queue could not run: ${error.message}`)
    process.exitCode = 1
  }
}
