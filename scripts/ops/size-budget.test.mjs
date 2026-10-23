import test from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))

/** Source files above this many lines are refactor candidates (docs/ENGINEERING.md, pillar 1). */
const LINE_BUDGET = 400

/**
 * Files already over the budget, with the most lines each may have. A ratchet: lower an entry
 * whenever a change shrinks its file, and remove it once the file is within budget. Never raise
 * one; split the file instead.
 */
const OVER_BUDGET = {
  'packages/core/src/fit/archive.ts': 670,
  'packages/core/src/session.ts': 568,
  'packages/core/src/tcx/parse.ts': 438,
  'packages/core/src/xml/parse.ts': 438,
  'packages/core/src/gpx/parse.ts': 431,
  'packages/core/src/digest/combine.ts': 407,
}

const SOURCE = /\.(ts|tsx|mjs)$/
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', 'test-results', 'test-corpus'])

async function sourceFiles(dir) {
  const files = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) files.push(...(await sourceFiles(join(dir, entry.name))))
    } else if (SOURCE.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) {
      files.push(join(dir, entry.name))
    }
  }
  return files
}

async function lineCounts() {
  const counts = new Map()
  for (const top of ['apps', 'packages', 'scripts']) {
    for (const file of await sourceFiles(join(root, top))) {
      const text = await readFile(file, 'utf8')
      counts.set(relative(root, file), text.split('\n').length - (text.endsWith('\n') ? 1 : 0))
    }
  }
  return counts
}

test('no source file grows past the line budget or its ratchet', async () => {
  const problems = []
  for (const [file, lines] of await lineCounts()) {
    const limit = OVER_BUDGET[file] ?? LINE_BUDGET
    if (lines > limit) problems.push(`${file}: ${lines} lines (limit ${limit}); split it`)
  }
  assert.deepEqual(problems, [])
})

test('ratchet entries are still needed and still exist', async () => {
  const counts = await lineCounts()
  const stale = []
  for (const [file, limit] of Object.entries(OVER_BUDGET)) {
    const lines = counts.get(file)
    if (lines === undefined) stale.push(`${file}: no longer exists; remove its entry`)
    else if (lines <= LINE_BUDGET) stale.push(`${file}: now ${lines} lines; remove its entry`)
    else if (lines < limit) stale.push(`${file}: now ${lines} lines; lower its entry to ${lines}`)
  }
  assert.deepEqual(stale, [])
})
