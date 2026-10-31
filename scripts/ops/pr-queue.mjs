import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// One line per open pull request saying what it needs next, so the coordinator reads the queue in
// one command instead of polling checks (docs/PROCESS.md). npm run pr:queue, or --json for objects.

/** The required checks that only collect their shards; a failed shard says more. */
const COLLECTORS = ['Lint, typecheck, unit tests, build', 'End-to-end (Playwright)']
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

/** Each check's newest run: a commit keeps a cancelled run beside the one that replaced it. */
export function latestChecks(rollup = []) {
  const latest = new Map()
  for (const item of rollup) {
    const check =
      item.__typename === 'StatusContext'
        ? {
            name: item.context,
            done: item.state !== 'PENDING' && item.state !== 'EXPECTED',
            result:
              item.state === 'SUCCESS'
                ? 'SUCCESS'
                : item.state === 'ERROR'
                  ? 'FAILURE'
                  : item.state,
            at: item.startedAt ?? '',
          }
        : {
            name: item.name,
            done: item.status === 'COMPLETED',
            result: item.conclusion,
            at: item.startedAt ?? '',
          }
    // A queued check may not have a start time yet, and it always belongs to the newest run.
    const seen = latest.get(check.name)
    if (!seen || (seen.done && (!check.done || check.at >= seen.at))) latest.set(check.name, check)
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
    if (process.argv.includes('--json')) {
      console.log(JSON.stringify({ main: { sha: main?.headSha, state: mainState }, rows }, null, 2))
    } else {
      console.log(`main ${main?.headSha?.slice(0, 8) ?? ''}: ${mainState}`)
      for (const row of rows) console.log(formatLine(row))
    }
  } catch (error) {
    console.error(`pr-queue could not run: ${error.message}`)
    process.exitCode = 1
  }
}
