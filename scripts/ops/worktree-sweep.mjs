import { execFileSync, spawn } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

// SessionStart sweep (.claude/settings.json): removes agent worktrees under .claude/worktrees whose
// pull request has merged or closed and that hold no uncommitted work, so the shared disk does not
// fill with finished checkouts (docs/PROCESS.md: remove the worktree when its pull request merges).
// It never touches the session's own worktree, a dirty or locked one, or one with an open pull
// request. Detached worktrees (gates, releases) are only listed. Removal runs in the background.

/** `git worktree list --porcelain` as objects. */
export function parseWorktrees(porcelain) {
  return porcelain
    .split('\n\n')
    .filter((block) => block.trim())
    .map((block) => {
      const lines = block.split('\n')
      const value = (key) => lines.find((line) => line.startsWith(`${key} `))?.slice(key.length + 1)
      return {
        path: value('worktree'),
        branch: value('branch')?.replace(/^refs\/heads\//, ''),
        detached: lines.includes('detached'),
        locked: lines.some((line) => line === 'locked' || line.startsWith('locked ')),
      }
    })
}

/** Each branch's pull request state: OPEN if any is open, else the newest one's state. */
export function stateByBranch(prs) {
  const states = new Map()
  for (const pr of [...prs].sort((a, b) => a.number - b.number)) {
    if (states.get(pr.headRefName) !== 'OPEN') states.set(pr.headRefName, pr.state)
  }
  return states
}

/** Which worktrees to remove, and which to name for a person to look at. */
export function planSweep({ worktrees, states, root, current, isClean }) {
  const plan = { remove: [], dirty: [], detached: [] }
  for (const tree of worktrees) {
    if (!tree.path?.startsWith(join(root, '.claude', 'worktrees') + sep)) continue
    if (tree.path === current || current.startsWith(tree.path + sep) || tree.locked) continue
    if (tree.detached) {
      plan.detached.push(tree.path)
      continue
    }
    const state = states.get(tree.branch)
    if (state !== 'MERGED' && state !== 'CLOSED') continue
    if (isClean(tree.path)) plan.remove.push(tree.path)
    else plan.dirty.push(tree.path)
  }
  return plan
}

/** The lines the session reads at start; empty when there is nothing to say. */
export function report(plan) {
  const name = (path) => path.split(sep).pop()
  const lines = []
  if (plan.remove.length) {
    lines.push(
      `Worktree sweep: removing ${plan.remove.length} finished: ${plan.remove.map(name).join(', ')}.`,
    )
  }
  if (plan.dirty.length) {
    lines.push(
      `Worktrees whose pull request is done but hold uncommitted work (check, then remove): ${plan.dirty.map(name).join(', ')}.`,
    )
  }
  if (plan.detached.length) {
    lines.push(
      `Detached worktrees (gates, releases); remove each when its run is over: ${plan.detached.map(name).join(', ')}.`,
    )
  }
  return lines.join('\n')
}

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8' })

function main() {
  const cwd = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
  const root = dirname(resolve(cwd, git(['rev-parse', '--git-common-dir'], cwd).trim()))
  const prs = JSON.parse(
    execFileSync(
      'gh',
      ['pr', 'list', '--state', 'all', '--limit', '500', '--json', 'number,state,headRefName'],
      { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
    ),
  )
  const plan = planSweep({
    worktrees: parseWorktrees(git(['worktree', 'list', '--porcelain'], cwd)),
    states: stateByBranch(prs),
    root: realpathSync(root),
    current: realpathSync(cwd),
    isClean: (path) => git(['status', '--porcelain'], path).trim() === '',
  })
  if (plan.remove.length) {
    // Deleting node_modules takes a while, so the removals finish after the session has started.
    const child = spawn(
      process.execPath,
      [fileURLToPath(import.meta.url), '--remove', ...plan.remove],
      {
        cwd: root,
        detached: true,
        stdio: 'ignore',
      },
    )
    child.unref()
  }
  const text = report(plan)
  if (text) console.log(text)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === '--remove') {
      for (const path of process.argv.slice(3)) {
        try {
          git(['worktree', 'remove', path], process.cwd())
        } catch {
          // A worktree that gained work since the plan stays; the next sweep names it.
        }
      }
    } else {
      main()
    }
  } catch (error) {
    console.error(`worktree-sweep skipped: ${error.message}`)
  }
}
