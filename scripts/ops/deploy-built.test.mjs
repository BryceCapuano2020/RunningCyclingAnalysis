import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkDeploySource, deployArguments } from './deploy-built.mjs'

const SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'

/** A fake git keyed by its first argument; a value that is an Error is thrown. */
function fakeGit(answers) {
  const calls = []
  const git = async (args) => {
    calls.push(args.join(' '))
    const value = answers[args[0] === 'rev-parse' ? args.slice(0, 2).join(' ') : args[0]]
    if (value instanceof Error) throw value
    return value ?? ''
  }
  return { git, calls }
}

const clean = {
  status: '',
  fetch: '',
  'rev-parse HEAD': SHA,
  'rev-parse --verify': SHA,
  'merge-base': '',
}
const withShort = (answers) => ({ ...answers, 'rev-parse --short=8': SHA.slice(0, 8) })
const built = { sha: SHA, dirty: false }
const check = (git, options) => checkDeploySource(git, { marker: async () => built, ...options })

test('accepts a clean checkout at a commit on origin/main', async () => {
  const { git, calls } = fakeGit(withShort(clean))
  assert.deepEqual(await check(git), { sha: SHA, short: SHA.slice(0, 8) })
  assert.ok(calls.includes(`merge-base --is-ancestor ${SHA} refs/remotes/origin/main`))
})

test('refuses a commit behind the tip of origin/main unless --allow-older is given', async () => {
  const { git } = fakeGit(withShort({ ...clean, 'rev-parse --verify': 'f'.repeat(40) }))
  await assert.rejects(check(git), /behind the tip of origin\/main/)
  assert.deepEqual(await check(git, { allowOlder: true }), { sha: SHA, short: SHA.slice(0, 8) })
})

test('refuses a web build made from another commit, or from a dirty tree, or missing', async () => {
  const { git } = fakeGit(withShort(clean))
  await assert.rejects(
    checkDeploySource(git, { marker: async () => ({ sha: 'e'.repeat(40), dirty: false }) }),
    /not made from a clean checkout of a1b2c3d4/,
  )
  await assert.rejects(
    checkDeploySource(git, { marker: async () => ({ sha: SHA, dirty: true }) }),
    /not made from a clean checkout/,
  )
  await assert.rejects(
    checkDeploySource(git, {
      marker: async () => {
        throw new Error('build-info.json is missing from the web build. Run npm run build first.')
      },
    }),
    /missing from the web build/,
  )
})

test('refuses a dirty tree, tracked or untracked', async () => {
  const { git } = fakeGit(withShort({ ...clean, status: '?? scratch.txt' }))
  await assert.rejects(check(git), /uncommitted or untracked/)
})

test('refuses a commit that is not on origin/main', async () => {
  const { git } = fakeGit(withShort({ ...clean, 'merge-base': new Error('exit 1') }))
  await assert.rejects(check(git), /not a commit on origin\/main/)
})

test('refuses when origin/main cannot be fetched', async () => {
  const { git } = fakeGit(withShort({ ...clean, fetch: new Error('offline') }))
  await assert.rejects(check(git), /offline/)
})

test('refuses when the commit cannot be read', async () => {
  const { git } = fakeGit(withShort({ ...clean, 'rev-parse HEAD': 'HEAD' }))
  await assert.rejects(check(git), /Could not read the commit/)
})

test('the deploy is tagged with the short commit id, messaged with the full one and given the id for /api/health', () => {
  assert.deepEqual(deployArguments({ sha: SHA, short: SHA.slice(0, 8) }), [
    'deploy',
    '--tag',
    'a1b2c3d4',
    '--message',
    `Commit ${SHA}, local release`,
    '--define',
    '__BUILD_SHA__:"a1b2c3d4"',
  ])
})
