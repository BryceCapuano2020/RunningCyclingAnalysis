import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { heldOutOffenders } from './heldOutGuard'

const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url))
const CODE = /\.(?:[cm]?[jt]sx?)$/
const SKIP = new Set(['node_modules', 'dist', 'coverage', 'playwright-report', 'test-results'])
/** Where source lives. Hidden folders (worktrees, agent notes) are never read. */
const ROOTS = ['packages', 'apps', 'scripts']

function walk(dir: string, out: { path: string; text: string }[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP.has(entry.name)) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path, out)
    else if (CODE.test(entry.name)) out.push({ path, text: readFileSync(path, 'utf8') })
  }
}

describe('held-out configurations', () => {
  it('are read only by held-out tests', () => {
    const files: { path: string; text: string }[] = []
    for (const root of ROOTS) walk(join(ROOT, root), files)
    expect(files.length).toBeGreaterThan(200)
    expect(heldOutOffenders(files)).toEqual([])
  })

  const ok = "import { HELD_OUT_CONFIGS } from './heldOut'"
  it.each([
    ['a tuning sweep', 'src/fitness/test/tuneSweep.ts', ok],
    ['an ordinary test', 'src/fitness/x.sim.test.ts', ok],
    ['a re-export', 'src/synthetic/noise/index.ts', "export * from './heldOut'"],
    ['a dynamic import', 'src/a.ts', "const m = await import('./noise/heldOut.ts')"],
    ['a copy of the table', 'src/a.ts', 'const x = HELD_OUT_CONFIGS'],
  ])('the guard catches %s', (_, path, text) => {
    expect(heldOutOffenders([{ path, text }])).toEqual([path])
  })

  it.each([
    ['a held-out test', 'src/x/spread.heldout.test.ts', ok],
    ['a held-out sim', 'src/x/spread.heldout.sim.test.ts', ok],
    ['the table itself', 'src/synthetic/noise/heldOut.ts', 'export const HELD_OUT_CONFIGS = {}'],
    ['a comment that names the file', 'src/a.ts', '// see heldOut.ts for D to F'],
  ])('the guard lets through %s', (_, path, text) => {
    expect(heldOutOffenders([{ path, text }])).toEqual([])
  })
})
