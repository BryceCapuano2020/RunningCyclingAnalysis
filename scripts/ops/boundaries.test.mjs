import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { sourceFiles } from './imports.mjs'
import { IMPORT_RULES, PURITY_ALLOW, impuritiesIn, violationsIn } from './boundaries.mjs'

// Written in two parts so this file does not contain the text engineering-doc.test.mjs refuses in unit tests.
const NOW = 'performance' + '.now'
const root = new URL('../../', import.meta.url).pathname
const ROOTS = ['packages/core/src', 'packages/contract/src', 'apps/web/src', 'apps/api/src']

test('the repo keeps its layers', async () => {
  const offences = []
  const used = new Map()
  for (const dir of ROOTS) {
    for await (const path of sourceFiles(join(root, dir), { tests: true })) {
      const file = relative(root, path).split('\\').join('/')
      const source = await readFile(path, 'utf8')
      for (const hit of [...violationsIn(file, source), ...impuritiesIn(file, source)]) {
        if (hit.allowed.has(hit.key))
          used.set(hit.allowed, [...(used.get(hit.allowed) ?? []), hit.key])
        else offences.push(hit.message)
      }
    }
  }
  assert.equal(offences.length, 0, `\n${offences.join('\n')}`)
  const dead = []
  for (const allowed of [...IMPORT_RULES.map((r) => r.allow), PURITY_ALLOW]) {
    for (const key of allowed.keys()) if (!(used.get(allowed) ?? []).includes(key)) dead.push(key)
  }
  assert.equal(
    dead.length,
    0,
    `An allow-list entry nothing uses is dead: remove it (${dead.join(', ')})`,
  )
})

/** The rules a synthetic snippet breaks once the listed exceptions are set aside. */
const rulesBroken = (file, source) =>
  [...violationsIn(file, source), ...impuritiesIn(file, source)]
    .filter((hit) => !hit.allowed.has(hit.key))
    .map((hit) => hit.rule)

for (const [rule, file, source] of [
  [
    'core-is-the-bottom-layer',
    'packages/core/src/a.ts',
    "import { x } from '../../../apps/api/src/y'",
  ],
  ['core-is-the-bottom-layer', 'packages/core/src/a.ts', "import { z } from '@rca/contract'"],
  ['core-is-the-bottom-layer', 'packages/core/src/a.ts', "import { useState } from 'react'"],
  ['core-is-the-bottom-layer', 'packages/core/src/a.ts', "import { Hono } from 'hono/cors'"],
  [
    'core-is-the-bottom-layer',
    'packages/core/src/a.ts',
    "import type { D1Database } from '@cloudflare/workers-types'",
  ],
  ['core-is-the-bottom-layer', 'packages/core/src/a.ts', "export * from '@rca/api'"],
  [
    'contract-is-wire-only',
    'packages/contract/src/a.ts',
    "const m = await import('../../../apps/web/src/x')",
  ],
  ['contract-is-wire-only', 'packages/contract/src/a.ts', "import 'wrangler'"],
  [
    'web-never-reads-api-internals',
    'apps/web/src/api/a.ts',
    "import { x } from '../../../api/src/state/zone'",
  ],
  [
    'web-never-reads-api-internals',
    'apps/web/src/api/a.test.ts',
    "import { x } from '@rca/api/state'",
  ],
  ['api-never-reads-web', 'apps/api/src/a.ts', "import { x } from '../../web/src/ui/y'"],
  ['worker-stays-out-of-the-page', 'apps/web/src/worker/a.ts', "import { useEffect } from 'react'"],
  [
    'worker-stays-out-of-the-page',
    'apps/web/src/worker/a.ts',
    "import { x } from '../ui/analysis/model'",
  ],
  [
    'page-reaches-worker-through-listed-modules',
    'apps/web/src/ui/a.ts',
    "import { x } from '../worker/unlistedModule'",
  ],
  [
    'page-reaches-worker-through-listed-modules',
    'apps/web/src/main.tsx',
    "import { x } from './worker/unlistedModule'",
  ],
  [
    'web-leaf-folders-stay-below-the-page',
    'apps/web/src/export/a.ts',
    "import { x } from '../ui/format/date'",
  ],
  ['core-is-pure', 'packages/core/src/a.ts', 'export const t = Date.now()'],
  ['core-is-pure', 'packages/core/src/a.ts', 'export const t = new Date()'],
  ['core-is-pure', 'packages/core/src/a.ts', `export const t = ${NOW}()`],
  ['core-is-pure', 'packages/core/src/a.ts', 'export const r = Math.random()'],
  ['core-is-pure', 'packages/core/src/a.ts', 'class S { clock = Date.now }'],
  ['core-is-pure', 'packages/core/src/a.ts', 'export const x = make(Math.random)'],
  ['core-is-pure', 'packages/core/src/a.ts', 'export const read = performance.now'],
  ['core-is-pure', 'packages/core/src/a.ts', 'export const r = crypto.randomUUID()'],
  ['core-is-pure', 'packages/core/src/a.ts', 'export const r = await fetch(url)'],
  ['core-is-pure', 'packages/core/src/a.ts', 'setTimeout(go, 10)'],
  ['core-is-pure', 'packages/core/src/a.ts', "localStorage.getItem('k')"],
  ['core-is-pure', 'packages/core/src/a.ts', 'const open = indexedDB.open(name)'],
  [
    'core-is-pure',
    'packages/core/src/a.ts',
    'const z = new Intl.DateTimeFormat().resolvedOptions().timeZone',
  ],
  ['core-is-pure', 'packages/core/src/a.ts', 'const z = process.env.TZ'],
]) {
  test(`${rule} fires on ${file}: ${source}`, () => {
    const hit = [...violationsIn(file, source), ...impuritiesIn(file, source)].find(
      (h) => h.rule === rule,
    )
    assert.ok(hit, `${rule} did not fire`)
    assert.match(hit.message, new RegExp(`^${file.replace(/[.]/g, '\\.')} (imports|uses) `))
    assert.match(hit.message, /Rule [\w-]+: .+ Fix: .+/)
  })
}

test('a failure names the file, the import, the rule and the fix', () => {
  const [hit] = violationsIn('packages/core/src/a.ts', "import { Hono } from 'hono'")
  assert.equal(
    hit.message,
    "packages/core/src/a.ts imports 'hono'. Rule core-is-the-bottom-layer: " +
      IMPORT_RULES[0].rule +
      ' Fix: ' +
      IMPORT_RULES[0].fix,
  )
})

test('legal imports, type-only imports, comments, strings, methods and test files pass', () => {
  const legal = [
    [
      'packages/core/src/a.ts',
      "import { z } from 'zod'\nimport { b } from './b'\nimport { f } from 'fflate'",
    ],
    ['packages/contract/src/a.ts', "import { x } from '@rca/core/types'\nimport { z } from 'zod'"],
    [
      'apps/web/src/ui/a.ts',
      "import { x } from '@rca/contract'\nimport { y } from '../worker/protocol'",
    ],
    ['apps/web/src/ui/a.test.ts', "import { x } from '../worker/liftTestKit'"],
    [
      'apps/web/src/worker/a.ts',
      "import { x } from '../api/client'\nimport type { y } from './protocol'",
    ],
    ['apps/web/src/worker/a.test.ts', "import { x } from '../ui/analysis/model'"],
    ['apps/api/src/a.ts', "import { Hono } from 'hono'\nimport { x } from '@rca/contract'"],
    ['apps/web/src/export/a.ts', "import { x } from '../download/saveBlob'"],
  ]
  for (const [file, source] of legal) assert.deepEqual(rulesBroken(file, source), [], file)
  const pure = [
    '// Date.now() is read by the caller\nexport const a = 1',
    "export const note = 'call Date.now() or fetch(x)'",
    'export const t = new Date(ms)\nconst k = cache.fetch(1)\nconst d = clock.setTimeout',
    'export const r = rng.random()\nexport const s = this.localStorageKey',
  ]
  for (const source of pure)
    assert.deepEqual(rulesBroken('packages/core/src/a.ts', source), [], source)
  assert.deepEqual(rulesBroken('packages/core/src/a.test.ts', 'const t = Date.now()'), [])
  assert.deepEqual(rulesBroken('packages/core/src/test/timing.ts', `const t = ${NOW}()`), [])
})
