import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const root = new URL('../../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

/** Phrases from the branch the project hardened on, which no longer describe the repository. */
const STALE = [
  [/hardening (branch|release)/i, 'there is no hardening branch; the source is main'],
  [
    /not run those workflows from the default branch/i,
    'CI runs on every pull request and every push to main',
  ],
  [/CI has never run/i, 'CI runs on every pull request and every push to main'],
]

test('the overview, architecture and production pages carry no hardening-branch leftovers', async () => {
  for (const path of ['README.md', 'docs/ARCHITECTURE.md', 'docs/PRODUCTION.md']) {
    const text = await read(path)
    for (const [pattern, why] of STALE) {
      assert.doesNotMatch(text, pattern, `${path} has stale wording: ${why}`)
    }
  }
})
