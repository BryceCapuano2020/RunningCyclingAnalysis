import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { OVER_BUDGET } from './size-budget.ratchet.mjs'

/*
 * docs/ENGINEERING.md states standards for the repository. This file holds the ones a test can check, so
 * the page stays true; the others are review guidance and the page says so.
 */
const root = fileURLToPath(new URL('../../', import.meta.url))
const read = (path) => readFile(join(root, path), 'utf8')
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'coverage',
  'test-results',
  'test-corpus',
  '.git',
  '.claude',
])

async function files(dir, keep) {
  const found = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) found.push(...(await files(path, keep)))
    } else if (keep(entry.name)) {
      found.push(path)
    }
  }
  return found
}

const inTrees = async (keep) =>
  (
    await Promise.all(['apps', 'packages', 'scripts'].map((top) => files(join(root, top), keep)))
  ).flat()

test('the hotspot table lists exactly the files the size ratchet holds over budget, at its limits', async () => {
  const doc = await read('docs/ENGINEERING.md')
  const section = doc.slice(doc.indexOf('## Current hotspots'))
  const listed = Object.fromEntries(
    [...section.matchAll(/^\| `([^`]+)`\s*\| (\d+)\s*\|/gm)].map((row) => [row[1], Number(row[2])]),
  )
  assert.deepEqual(
    listed,
    OVER_BUDGET,
    'docs/ENGINEERING.md and scripts/ops/size-budget.ratchet.mjs disagree: update the table or the ratchet',
  )
})

// Written in two parts so this file does not contain the text it looks for.
const WALL_CLOCK = 'performance' + '.now('

test('unit tests assert no wall-clock time; timing budgets live in *.perf.test files', async () => {
  const unit = await inTrees(
    (name) => /\.test\.(ts|tsx|mjs)$/.test(name) && !/\.(perf|sim)\.test\./.test(name),
  )
  const offenders = []
  for (const file of unit) {
    if ((await readFile(file, 'utf8')).includes(WALL_CLOCK)) offenders.push(relative(root, file))
  }
  assert.deepEqual(offenders, [], 'move the timing check to the sibling *.perf.test.ts, or drop it')
})

test('no source or test file disables a lint rule', async () => {
  const code = await inTrees((name) => /\.(ts|tsx|mjs)$/.test(name))
  const offenders = []
  for (const file of code) {
    if (file.endsWith('engineering-doc.test.mjs')) continue
    if (/(oxlint|eslint)-disable/.test(await readFile(file, 'utf8')))
      offenders.push(relative(root, file))
  }
  assert.deepEqual(offenders, [])
})

test('dependencies are locked: every workspace manifest matches package-lock.json and CI installs with npm ci', async () => {
  const lock = JSON.parse(await read('package-lock.json'))
  const manifests = ['package.json']
  for (const top of ['apps', 'packages']) {
    for (const entry of await readdir(join(root, top), { withFileTypes: true })) {
      if (entry.isDirectory()) manifests.push(`${top}/${entry.name}/package.json`)
    }
  }
  const mismatches = []
  for (const manifest of manifests) {
    const declared = JSON.parse(await read(manifest))
    const locked =
      lock.packages[manifest === 'package.json' ? '' : manifest.replace('/package.json', '')]
    for (const kind of ['dependencies', 'devDependencies']) {
      if (JSON.stringify(declared[kind] ?? {}) !== JSON.stringify(locked?.[kind] ?? {})) {
        mismatches.push(`${manifest} ${kind}`)
      }
    }
  }
  assert.deepEqual(mismatches, [], 'run npm install and commit package-lock.json')
  const ci = await read('.github/workflows/ci.yml')
  assert.match(ci, /run: npm ci/)
  assert.doesNotMatch(ci, /run: npm install/)
})

test('the page says what is review guidance rather than a check', async () => {
  const doc = (await read('docs/ENGINEERING.md')).replace(/\s+/g, ' ')
  assert.match(doc, /function over 60 lines is a review prompt, not a checked rule/)
  assert.doesNotMatch(doc, /\bdependencies are pinned\b/)
})

test('the coverage gate covers the web app and the contract with thresholds of their own', async () => {
  const config = await read('vitest.config.ts')
  for (const included of ["'apps/web/src/**/*.{ts,tsx}'", "'packages/contract/src/**/*.ts'"]) {
    assert.ok(config.includes(included), `coverage.include lists ${included}`)
  }
  for (const glob of [
    "'apps/web/src/**'",
    "'apps/web/src/worker/**'",
    "'packages/contract/src/**'",
  ]) {
    assert.match(
      config,
      new RegExp(`${glob.replace(/[*/]/g, '\\$&')}: \\{ lines: \\d+`),
      `a threshold for ${glob}`,
    )
  }
})

test('unit tests in core and web time out at 15 s, not the 5 s default that failed under load', async () => {
  for (const path of ['packages/core/vitest.config.ts', 'apps/web/vite.config.ts']) {
    assert.match(await read(path), /testTimeout: 15_000/, path)
  }
})

test('a unit test that draws the sample season raises no timeout: the draw is warmed at import or it is not slow', async () => {
  const draws = /\b(loadSample|seasonDigests|sampleSeason|samplePlan)\(/
  // The closing of a test with a limit: `}, 30_000)`, or a timeout option of five digits or more.
  const raised = /\}, ?\d[\d_]{4,}\)|timeout: ?\d[\d_]{4,}/
  const unit = await inTrees(
    (name) => /\.test\.(ts|tsx)$/.test(name) && !/\.(perf|sim)\.test\./.test(name),
  )
  const offenders = []
  for (const file of unit) {
    const text = await readFile(file, 'utf8')
    if (draws.test(text) && raised.test(text)) offenders.push(relative(root, file))
  }
  assert.deepEqual(offenders, [])
})
