import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const read = (path) => readFile(new URL(path, new URL('../../', import.meta.url)), 'utf8')

test('git ignores the replica output folder and account downloads, so one git add -A cannot publish them', async () => {
  const lines = (await read('.gitignore')).split('\n')
  assert.ok(lines.includes('.replica-out/'), 'the default output folder is not ignored')
  // The app names a download rca-export-YYYY-MM-DD.json; the synthetic one is synthetic.rca-export.json.
  assert.ok(lines.includes('*rca-export*.json'), 'account downloads are not ignored')
})

test('the tools that handle real data say so at the top of the file', async () => {
  for (const file of ['replica.mjs', 'truth-check.mjs']) {
    const header = (await read(`scripts/replica/${file}`)).slice(0, 1500)
    assert.match(header, /PRIVATE DATA\./, file)
  }
})
