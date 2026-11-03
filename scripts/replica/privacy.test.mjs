import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = (path) => readFile(root + path, 'utf8')
const ignored = (path) =>
  spawnSync('git', ['check-ignore', '-q', '--no-index', path], { cwd: root }).status === 0

test('git ignores the replica output folder and account downloads, so one git add -A cannot publish them', () => {
  assert.ok(ignored('.replica-out/seed.json'), 'the default output folder is not ignored')
  // The app names a download rca-export-YYYY-MM-DD.json; a browser may add " (1)"; the synthetic one is synthetic.rca-export.json.
  for (const name of [
    'rca-export-2026-10-03.json',
    'rca-export-2026-10-03 (1).json',
    'synthetic.rca-export.json',
  ]) {
    assert.ok(ignored(name), `${name} is not ignored`)
  }
})

test('the tools that handle real data say so at the top of the file', async () => {
  for (const file of ['replica.mjs', 'truth-check.mjs']) {
    const header = (await read(`scripts/replica/${file}`)).slice(0, 1500)
    assert.match(header, /PRIVATE DATA\./, file)
  }
})
