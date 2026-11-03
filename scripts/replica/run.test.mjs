import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { refusalCounts, seedProblem } from './report.mjs'
import { outDirProblem } from './run.mjs'

/** A scratch folder, removed after the callback. */
function inScratch(run) {
  const dir = mkdtempSync(join(tmpdir(), 'rca-replica-'))
  try {
    return run(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('an output folder is refused inside a git work tree unless git ignores it', () => {
  inScratch((dir) => {
    const outside = join(dir, 'outside', 'deeper')
    assert.equal(outDirProblem(outside), null)

    const repo = join(dir, 'repo')
    mkdirSync(repo)
    assert.equal(spawnSync('git', ['init', '-q'], { cwd: repo }).status, 0)
    writeFileSync(join(repo, '.gitignore'), 'private-out/\n')
    assert.equal(outDirProblem(join(repo, 'private-out')), null)
    assert.equal(outDirProblem(join(repo, 'private-out', 'nested')), null)
    assert.match(
      outDirProblem(join(repo, 'other-out')),
      /inside a git work tree that does not ignore it/,
    )
    mkdirSync(join(repo, 'other-out'))
    assert.match(outDirProblem(join(repo, 'other-out')), /does not ignore it/)
  })
})

const refusal = (status, code) => ({ sport: 'run', status, code, body: '' })

test('refusals are counted by status and error code, most common first', () => {
  const refused = [
    refusal(409, 'stale'),
    refusal(422, null),
    refusal(409, 'stale'),
    refusal(500, null),
  ]
  assert.equal(refusalCounts(refused), '409 stale x2, 422 x1, 500 x1')
})

test('a seeded account fails the run when any activity was refused or none loaded', () => {
  const seeded = (loaded, refused, total) => ({ activities: { total, loaded, refused } })
  assert.equal(seedProblem(seeded(3, [], 3)), null)
  assert.equal(
    seedProblem(seeded(1, [refusal(409, 'stale'), refusal(409, 'stale')], 3)),
    '2 of 3 activities were refused (409 stale x2)',
  )
  assert.match(seedProblem(seeded(0, [], 0)), /no activities were loaded/)
})
