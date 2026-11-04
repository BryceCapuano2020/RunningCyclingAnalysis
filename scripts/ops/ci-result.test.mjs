import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { failures } from './ci-result.mjs'
import { jobBlocks } from './workflow-blocks.mjs'

const ci = await readFile(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8')
const blocks = jobBlocks(ci)

test('CI result needs every job that gates, and not the shuffled-order run', () => {
  const result = blocks.get('result').join('\n')
  assert.match(result, /^ {4}name: CI result$/m)
  assert.match(
    result,
    /^ {4}if: \$\{\{ always\(\) \}\}$/m,
    'it reports even when a job it needs failed',
  )
  const needs = /^ {4}needs: \[(.*)\]$/m.exec(result)[1].split(', ')
  const gating = [...blocks.keys()].filter((job) => job !== 'result' && job !== 'order')
  assert.deepEqual([...needs].sort(), gating.sort())
})

test('the CI result job runs the tested verdict on every run', () => {
  const result = blocks.get('result').join('\n')
  assert.match(result, /NEEDS: \$\{\{ toJSON\(needs\) \}\}/)
  assert.match(result, /DRAFT: \$\{\{ needs\.changes\.outputs\.draft \}\}/)
  assert.match(result, /run: node scripts\/ops\/ci-result\.mjs/)
  assert.doesNotMatch(result, /github\.event\.pull_request\.draft/)
})

const all = (result, overrides = {}) =>
  Object.fromEntries(
    [
      'changes',
      'static',
      'unit',
      'verify',
      'perf',
      'sim',
      'sim-result',
      'e2e',
      'e2e-result',
      'size',
      'audit',
    ].map((job) => [job, { result: overrides[job] ?? result }]),
  )
const pr = { draft: 'false', code: 'true', event: 'pull_request' }

test('CI result passes only when every gating job passed', () => {
  assert.deepEqual(failures({ ...pr, needs: all('success') }), [])
  assert.deepEqual(failures({ ...pr, needs: all('success', { perf: 'failure' }) }), [
    'perf (failure)',
  ])
  assert.deepEqual(failures({ ...pr, needs: all('success', { e2e: 'cancelled' }) }), [
    'e2e (cancelled)',
  ])
  assert.deepEqual(failures({ ...pr, needs: all('success', { unit: 'skipped' }) }), [
    'unit (skipped)',
  ])
  assert.deepEqual(failures({ ...pr, draft: 'true', needs: all('skipped') }), ['draft'])
})

test('a skip passes only on a documentation-only pull request or for the size job on main', () => {
  const docs = all('success', { unit: 'skipped', perf: 'skipped', sim: 'skipped', e2e: 'skipped' })
  assert.deepEqual(failures({ ...pr, code: 'false', needs: docs }), [])
  assert.deepEqual(
    failures({ ...pr, code: 'false', needs: { ...docs, audit: { result: 'skipped' } } }),
    ['audit (skipped)'],
  )
  assert.deepEqual(failures({ ...pr, needs: all('success', { size: 'skipped' }) }), [
    'size (skipped)',
  ])
  const push = { draft: 'false', code: 'true', event: 'push' }
  assert.deepEqual(failures({ ...push, needs: all('success', { size: 'skipped' }) }), [])
  // A failed changes job leaves code empty: then no skip passes.
  assert.deepEqual(
    failures({ ...pr, code: '', needs: all('success', { changes: 'failure', unit: 'skipped' }) }),
    ['changes (failure)', 'unit (skipped)'],
  )
})

test('a pull request over 800 lines needs the integration label, read when the job runs', () => {
  const size = blocks.get('size').join('\n')
  assert.match(size, /^ {4}needs: changes$/m)
  assert.match(size, /draft != 'true' && github\.event_name == 'pull_request'/)
  assert.match(size, /':\(exclude\)package-lock\.json'/)
  assert.match(size, /if \[ "\$lines" -le 800 \]; then exit 0; fi/)
  assert.match(size, /gh api "repos\/\$GITHUB_REPOSITORY\/issues\/\$PR\/labels"/)
  assert.doesNotMatch(size, /grep -q/, 'grep -q can exit early and trip pipefail')
})

test('pull requests audit production dependencies; the weekly run audits them all', async () => {
  assert.match(blocks.get('audit').join('\n'), /npm audit --omit=dev --audit-level=moderate/)
  const weekly = await readFile(
    new URL('../../.github/workflows/supply-chain.yml', import.meta.url),
    'utf8',
  )
  assert.match(weekly, /run: npm audit --audit-level=high/)
  assert.match(weekly, /run: npm audit --omit=dev --audit-level=moderate/)
})
