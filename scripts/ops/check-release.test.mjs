import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkRelease } from './check-release.mjs'

/** A fake git whose answers are keyed by the first argument after `git`. */
function fakeGit(answers) {
  const calls = []
  const git = async (args) => {
    calls.push(args.join(' '))
    const key = args[0] === 'rev-parse' ? args.join(' ') : args[0]
    const value = answers[key]
    if (value instanceof Error) throw value
    return value ?? ''
  }
  return { git, calls }
}

const clean = {
  'rev-parse --abbrev-ref HEAD': 'main',
  status: '',
  fetch: '',
  'rev-parse HEAD': 'abc123',
  'rev-parse --verify refs/remotes/origin/main': 'abc123',
}

test('accepts a clean main checkout identical to origin/main', async () => {
  await assert.doesNotReject(checkRelease(fakeGit(clean).git))
})

test('refuses any branch other than main', async () => {
  const { git } = fakeGit({ ...clean, 'rev-parse --abbrev-ref HEAD': 'hardening' })
  await assert.rejects(checkRelease(git), /must run from main/)
})

test('refuses a detached HEAD', async () => {
  const { git } = fakeGit({ ...clean, 'rev-parse --abbrev-ref HEAD': 'HEAD' })
  await assert.rejects(checkRelease(git), /must run from main/)
})

test('refuses uncommitted or untracked changes', async () => {
  const { git } = fakeGit({ ...clean, status: ' M packages/core/src/session.ts' })
  await assert.rejects(checkRelease(git), /uncommitted or untracked/)
})

test('refuses a local main that differs from origin/main', async () => {
  const { git } = fakeGit({ ...clean, 'rev-parse HEAD': 'def456' })
  await assert.rejects(checkRelease(git), /not origin\/main/)
})

test('refuses when origin/main cannot be fetched', async () => {
  const { git } = fakeGit({ ...clean, fetch: new Error('network down') })
  await assert.rejects(checkRelease(git), /network down/)
})
