import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseWorktrees, planSweep, report, stateByBranch } from './worktree-sweep.mjs'

const ROOT = '/repo'
const tree = (name, fields = {}) => ({
  path: `${ROOT}/.claude/worktrees/${name}`,
  branch: `feat/${name}`,
  detached: false,
  locked: false,
  ...fields,
})

test('reads git worktree list --porcelain', () => {
  const porcelain = [
    'worktree /repo\nHEAD aaa\nbranch refs/heads/main',
    'worktree /repo/.claude/worktrees/a\nHEAD bbb\nbranch refs/heads/feat/a\nlocked in use',
    'worktree /repo/.claude/worktrees/gate\nHEAD ccc\ndetached',
    '',
  ].join('\n\n')
  assert.deepEqual(parseWorktrees(porcelain), [
    { path: '/repo', branch: 'main', detached: false, locked: false },
    { path: '/repo/.claude/worktrees/a', branch: 'feat/a', detached: false, locked: true },
    { path: '/repo/.claude/worktrees/gate', branch: undefined, detached: true, locked: false },
  ])
})

test('an open pull request on a branch wins over an older closed one', () => {
  const states = stateByBranch([
    { number: 2, state: 'OPEN', headRefName: 'feat/a' },
    { number: 1, state: 'CLOSED', headRefName: 'feat/a' },
    { number: 3, state: 'CLOSED', headRefName: 'feat/b' },
    { number: 4, state: 'MERGED', headRefName: 'feat/b' },
  ])
  assert.equal(states.get('feat/a'), 'OPEN')
  assert.equal(states.get('feat/b'), 'MERGED')
})

test('removes only clean worktrees whose pull request is done', () => {
  const states = new Map([
    ['feat/merged', 'MERGED'],
    ['feat/closed', 'CLOSED'],
    ['feat/open', 'OPEN'],
    ['feat/dirty', 'MERGED'],
    ['feat/locked', 'MERGED'],
    ['feat/mine', 'MERGED'],
  ])
  const worktrees = [
    { path: ROOT, branch: 'main', detached: false, locked: false },
    tree('merged'),
    tree('closed'),
    tree('open'),
    tree('no-pr'),
    tree('dirty'),
    tree('locked', { locked: true }),
    tree('mine'),
    tree('gate', { branch: undefined, detached: true }),
    { path: '/elsewhere/wt', branch: 'feat/merged', detached: false, locked: false },
  ]
  const plan = planSweep({
    worktrees,
    states,
    root: ROOT,
    current: `${ROOT}/.claude/worktrees/mine/apps/web`,
    isClean: (path) => !path.endsWith('dirty'),
  })
  assert.deepEqual(plan, {
    remove: [`${ROOT}/.claude/worktrees/merged`, `${ROOT}/.claude/worktrees/closed`],
    dirty: [`${ROOT}/.claude/worktrees/dirty`],
    detached: [`${ROOT}/.claude/worktrees/gate`],
  })
})

test('says nothing when there is nothing to do', () => {
  assert.equal(report({ remove: [], dirty: [], detached: [] }), '')
  assert.match(
    report({ remove: ['/r/.claude/worktrees/a'], dirty: [], detached: ['/r/.claude/worktrees/g'] }),
    /removing 1 finished: a\.\nDetached .*: g\./,
  )
})
