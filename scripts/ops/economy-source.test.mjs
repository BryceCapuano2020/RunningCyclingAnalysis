import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'

/*
 * One running economy (docs/ENGINEERING.md, "One figure, one function"): a run's cost is read at `DISPLAY_ECONOMY` (display/economy.ts),
 * the scale the display conversions, the duration tables, the digest and the ride anchor share. `PRIORS.runEconomyScale` describes the
 * spread of athletes the analysis samples and is read only where it is sampled, so a second reader of its mean is a second scale
 * for the same figure.
 */

const CORE = new URL('../../packages/core/src', import.meta.url).pathname

/** The files that may name the prior's mean, each with the reason. */
const ALLOWED = new Map([
  ['constants.ts', 'defines the prior'],
  ['display/methodFigures.ts', 'quotes the prior’s spread (sd) for the Method page'],
  ['compare/sampling.ts', 'samples the spread of athletes the prior describes'],
  ['compare/compareSports.ts', 'samples the spread of athletes the prior describes'],
])

async function* sourceFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!['node_modules', 'test', 'synthetic'].includes(entry.name)) yield* sourceFiles(path)
    } else if (/\.ts$/.test(entry.name) && !/\.(test|sim\.test|perf\.test)\.ts$/.test(entry.name)) {
      yield path
    }
  }
}

test('no core module reads the economy prior’s mean outside the files that sample it', async () => {
  const offenders = []
  const used = new Set()
  for await (const path of sourceFiles(CORE)) {
    const key = relative(CORE, path)
    const text = await readFile(path, 'utf8')
    if (!/runEconomyScale\b/.test(text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''))) continue
    if (ALLOWED.has(key)) used.add(key)
    else offenders.push(key)
  }
  assert.deepEqual(offenders, [], 'Read DISPLAY_ECONOMY from display/economy.ts for a run’s cost')
  assert.deepEqual(
    [...ALLOWED.keys()].filter((key) => !used.has(key)),
    [],
    'An allow-list entry that no longer names the prior is dead: remove it',
  )
})
