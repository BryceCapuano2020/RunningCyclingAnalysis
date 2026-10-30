import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { BUDGETS, measureBundle, overBudget } from './check-bundle-size.mjs'

/** A built dist with the given files in assets/; random bytes do not compress, so a size is a size. */
async function dist(files, html) {
  const dir = await mkdtemp(join(tmpdir(), 'bundle-'))
  await mkdir(join(dir, 'assets'))
  await writeFile(join(dir, 'index.html'), html)
  for (const [name, bytes] of Object.entries(files)) {
    await writeFile(join(dir, 'assets', name), randomBytes(bytes))
  }
  return dir
}

const PAGE = `<script type="module" crossorigin src="./assets/index-a.js"></script>
<link rel="modulepreload" crossorigin href="./assets/shared-a.js">
<link rel="stylesheet" crossorigin href="./assets/index-a.css">
<link rel="icon" href="./favicon.svg">`

test('adds up what the page loads at once, and keeps the worker and the other chunks apart', async () => {
  const dir = await dist(
    {
      'index-a.js': 3000,
      'shared-a.js': 2000,
      'index-a.css': 1000,
      'analysis.worker-a.js': 4000,
      'ResultPage-a.js': 1500,
      'ProfilePage-a.js': 500,
      'font.woff2': 9000,
    },
    PAGE,
  )
  const measured = await measureBundle(dir)
  assert.ok(measured.initial > 6000 && measured.initial < 6300, `initial ${measured.initial}`)
  assert.ok(measured.worker > 4000 && measured.worker < 4100, `worker ${measured.worker}`)
  assert.deepEqual(
    measured.chunks.map((chunk) => chunk.file),
    ['assets/ResultPage-a.js', 'assets/ProfilePage-a.js'],
  )
})

test('names each part that is over its budget, and nothing when all fit', () => {
  const fits = { initial: 1000, worker: 1000, chunks: [{ file: 'assets/a.js', size: 1000 }] }
  assert.deepEqual(overBudget(fits), [])
  const over = {
    initial: BUDGETS.initial + 1,
    worker: BUDGETS.worker + 1,
    chunks: [
      { file: 'assets/Big-a.js', size: BUDGETS.chunk + 1 },
      { file: 'assets/Small-a.js', size: 10 },
    ],
  }
  const problems = overBudget(over)
  assert.equal(problems.length, 3)
  assert.match(problems[0], /initial load/)
  assert.match(problems[1], /analysis worker/)
  assert.match(problems[2], /assets\/Big-a\.js/)
})

test('refuses a build it cannot read', async () => {
  const empty = await mkdtemp(join(tmpdir(), 'bundle-'))
  await assert.rejects(measureBundle(empty), /index\.html is missing/)
  const noScript = await dist({}, '<p>none</p>')
  await assert.rejects(measureBundle(noScript), /loads no script/)
  const lacking = await dist({}, PAGE)
  await assert.rejects(measureBundle(lacking), /which the build lacks/)
})
