import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('dependabot checks npm workspaces and actions weekly, grouped, with a small open-PR cap', async () => {
  const source = await read('.github/dependabot.yml')
  const blocks = source.split(/^ {2}- package-ecosystem: /m).slice(1)
  assert.deepEqual(
    blocks.map((block) => block.split('\n')[0].trim()),
    ['npm', 'github-actions'],
  )
  for (const block of blocks) {
    assert.match(block, /interval: weekly/)
    assert.match(block, /^\s+groups:/m)
    const limit = Number(/open-pull-requests-limit: (\d+)/.exec(block)?.[1])
    assert.ok(limit >= 1 && limit <= 5, `open-pull-requests-limit ${limit} is not between 1 and 5`)
  }
  assert.match(blocks[0], /directories:\s*\n\s+- \/\n\s+- \/apps\/\*\n\s+- \/packages\/\*/)
})

test('local audit evidence is git-ignored, so one git add -A cannot publish it', async () => {
  assert.match(await read('.gitignore'), /^docs\/audits\/$/m)
})

test('the production notes tell the owner to switch on secret scanning and push protection', async () => {
  const notes = (await read('docs/PRODUCTION.md')).replace(/\s+/g, ' ')
  assert.match(notes, /Secret scanning and push protection/)
  assert.match(notes, /security_and_analysis/)
})
