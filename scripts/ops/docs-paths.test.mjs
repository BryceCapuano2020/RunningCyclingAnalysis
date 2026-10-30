import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

/*
 * A path a doc names in code font must exist, so a file that moves or goes fails here until the page
 * says where it is now. Build output and per-deployment names are not in the repository and are listed.
 */
const root = fileURLToPath(new URL('../../', import.meta.url))
const DOCS = ['docs/ARCHITECTURE.md', 'docs/ENGINEERING.md', 'apps/api/LIMITS.md']
const NOT_IN_REPOSITORY = new Set(['apps/web/dist'])
const PATH = /^(?:apps|packages|docs|scripts|ops|\.github)\/[\w./-]*[\w-]$/

const exists = (path) =>
  access(join(root, path)).then(
    () => true,
    () => false,
  )

for (const doc of DOCS) {
  test(`every repository path ${doc} names in code font exists`, async () => {
    const text = await readFile(join(root, doc), 'utf8')
    const named = new Set(
      [...text.matchAll(/`([^`\s]+)`/g)]
        .map((match) => match[1].replace(/:\d+(?:-\d+)?$/, ''))
        .filter((token) => PATH.test(token) && !NOT_IN_REPOSITORY.has(token)),
    )
    assert.ok(named.size >= 3, `${doc} should name some paths; the matcher found ${named.size}`)
    const missing = []
    for (const path of named) if (!(await exists(path))) missing.push(path)
    assert.deepEqual(missing, [])
  })
}

test('every relative link in the checked docs points at a file that exists', async () => {
  const missing = []
  for (const doc of DOCS) {
    const text = await readFile(join(root, doc), 'utf8')
    for (const match of text.matchAll(/\]\((?!https?:|#|mailto:)([^)#\s]+)(?:#[^)]*)?\)/g)) {
      const target = join(dirname(join(root, doc)), match[1])
      if (!(await exists(target.slice(root.length)))) missing.push(`${doc}: ${match[1]}`)
    }
  }
  assert.deepEqual(missing, [])
})
