import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildMarker, MARKER_FILE, readMarker } from './build-marker.mjs'

const git = (answers) => async (args) => {
  const value = answers[args[0]]
  if (value instanceof Error) throw value
  return value
}

test('records the commit and whether the tree was clean', async () => {
  assert.deepEqual(await buildMarker(git({ 'rev-parse': 'abc', status: '' })), {
    sha: 'abc',
    dirty: false,
  })
  assert.deepEqual(await buildMarker(git({ 'rev-parse': 'abc', status: ' M a.ts' })), {
    sha: 'abc',
    dirty: true,
  })
})

test('a build outside a repository records an unknown, dirty source', async () => {
  assert.deepEqual(await buildMarker(git({ 'rev-parse': new Error('not a repository') })), {
    sha: 'unknown',
    dirty: true,
  })
})

test('reads a marker back, and refuses a dist without one', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'marker-'))
  await assert.rejects(readMarker(dir), /missing from the web build/)
  await writeFile(join(dir, MARKER_FILE), '{"sha":"abc","dirty":false}\n')
  assert.deepEqual(await readMarker(dir), { sha: 'abc', dirty: false })
  await writeFile(join(dir, MARKER_FILE), '{"sha":1}')
  await assert.rejects(readMarker(dir), /not a build marker/)
})
