import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { heldOutOffenders } from './heldOutGuard'

const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url))
const CODE = /\.(?:[cm]?[jt]sx?)$/
const SKIP = new Set(['node_modules', 'dist', 'coverage', 'playwright-report', 'test-results'])
/** Where source lives, including scripts/ops. Hidden folders (worktrees, agent notes) are never read. */
const ROOTS = ['packages', 'apps', 'scripts']

function walk(dir: string, out: { path: string; text: string }[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP.has(entry.name)) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path, out)
    else if (CODE.test(entry.name)) out.push({ path, text: readFileSync(path, 'utf8') })
  }
}

/** The tree as the guard reads it: the three source folders and the config files at the root. */
function sourceTree(): { path: string; text: string }[] {
  const files: { path: string; text: string }[] = []
  for (const root of ROOTS) walk(join(ROOT, root), files)
  for (const entry of readdirSync(ROOT, { withFileTypes: true })) {
    const path = join(ROOT, entry.name)
    if (entry.isFile() && CODE.test(entry.name))
      files.push({ path, text: readFileSync(path, 'utf8') })
  }
  return files
}

describe('held-out configurations', () => {
  it('are read only by held-out tests', () => {
    const files = sourceTree()
    expect(files.length).toBeGreaterThan(200)
    const seen = files.map((f) => relative(ROOT, f.path))
    expect(seen).toContain('vitest.config.ts')
    expect(seen.some((p) => p.startsWith('scripts/ops/'))).toBe(true)
    expect(heldOutOffenders(files)).toEqual([])
  })

  const table = "import { HELD_OUT_CONFIGS } from './heldOut'"
  it.each([
    ['a tuning sweep', 'src/fitness/test/tuneSweep.ts', table],
    ['an ordinary test', 'src/fitness/x.sim.test.ts', table],
    ['a re-export', 'src/synthetic/noise/index.ts', "export * from './heldOut'"],
    ['another case', 'src/a.ts', "import { x } from './noise/HELDOUT'"],
    ['a side-effect import', 'src/a.ts', "import './noise/heldOut.bands'"],
    ['a dynamic import', 'src/a.ts', "const m = await import('./noise/heldOut.ts')"],
    ['a comment inside the call', 'src/a.ts', "await import(/* x */ './noise/heldOut')"],
    ['a require', 'scripts/ops/a.mjs', "const m = require('../../x/heldOut.ts')"],
    [
      'a held-out test imported by an ordinary file',
      'src/a.test.ts',
      "import { t } from './x.heldout.test'",
    ],
    [
      'a destructured name bound to something else',
      'src/a.ts',
      "const [a, b] = ['node:fs', './noise/heldOut']\nawait import(b)",
    ],
    ['a string-built import', 'src/a.ts', "await import('./noise/' + name)"],
    ['a template import', 'src/a.ts', 'await import(`./noise/${name}.ts`)'],
    ['a glob over the folder', 'src/a.ts', "import.meta.glob('./noise/*.ts')"],
    ['a glob over the tree', 'src/a.ts', "import.meta.glob(['/packages/**/*.ts'])"],
    ['a glob that names it', 'src/a.ts', "import.meta.glob('./*.heldout.test.ts')"],
    ['a glob built at run time', 'src/a.ts', 'import.meta.glob(pattern)'],
    ['a copy of the table', 'src/a.ts', 'const x = HELD_OUT_CONFIGS'],
    [
      'a root config',
      'vitest.config.ts',
      "import c from './packages/core/src/synthetic/noise/heldOut'",
    ],
  ])('the guard catches %s', (_, path, text) => {
    expect(heldOutOffenders([{ path, text }])).toEqual([path])
  })

  it.each([
    ['a held-out test', 'src/x/spread.heldout.test.ts', table],
    ['a held-out sim', 'src/x/spread.heldout.sim.test.ts', table],
    ['the table itself', 'src/synthetic/noise/heldOut.ts', 'export const HELD_OUT_CONFIGS = {}'],
    ['a comment that names the file', 'src/a.ts', '// see heldOut.ts for D to F'],
    ['a block comment around an import', 'src/a.ts', "/* import('./heldOut') */ const x = 1"],
    [
      'a node built-in read through a variable',
      'src/a.ts',
      "const specifier = 'node:fs'\nawait import(/* @vite-ignore */ specifier)",
    ],
    [
      'node built-ins bound by destructuring',
      'src/a.ts',
      "const [fsName, zlibName] = ['node:fs', 'node:zlib']\nawait import(/* @vite-ignore */ zlibName)",
    ],
    ['a glob of fixtures', 'src/a.ts', "import.meta.glob('./fixtures/*.json')"],
    ['an ordinary import', 'src/a.ts', "import { x } from './noise/presets'"],
  ])('the guard lets through %s', (_, path, text) => {
    expect(heldOutOffenders([{ path, text }])).toEqual([])
  })
})
