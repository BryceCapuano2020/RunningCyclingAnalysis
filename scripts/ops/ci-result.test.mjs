import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
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

test('CI result fails a draft and passes a skip only where a skip is expected', () => {
  const result = blocks.get('result').join('\n')
  assert.match(result, /if \[ "\$DRAFT" = true \]; then\n[^\n]*Draft pull request[^\n]*\n\s+exit 1/)
  assert.match(
    result,
    /select\(\.value\.result != "skipped" or \(\$code != "false" and \(\.key != "size" or \$event == "pull_request"\)\)\)/,
  )
  assert.doesNotMatch(result, /github\.event\.pull_request\.draft/)
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
