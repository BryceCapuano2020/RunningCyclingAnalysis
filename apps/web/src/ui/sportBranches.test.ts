import { describe, expect, it } from 'vitest'
import { readFilesUnder } from './components/stylesheet'

/**
 * A comparison with a literal sport, whatever the other side is called: `view.sport === 'run'`,
 * `lean !== 'ride'`, `'run' === kind` or `case 'ride':`. Per-sport values (labels, units, colours,
 * formatters, glyphs) are read from SPORT_FORMAT and the other tables keyed by Sport, so a comparison
 * left is a logic branch that a table cannot hold.
 */
const SPORT_CHECK =
  /(?:[!=]==?)\s*['"](?:run|ride)['"]|['"](?:run|ride)['"]\s*(?:[!=]==?)|\bcase\s+['"](?:run|ride)['"]/g

/** The most sport comparisons the source may hold outside tests. A new one needs a table instead. */
const SPORT_CHECK_BUDGET = 60

/** The web app's and the two packages' source, without the tests, their fixtures or the benchmarks. */
async function sourceFiles(): Promise<{ path: string; text: string }[]> {
  const web = [
    ...(await readFilesUnder(import.meta.url, '../', '.ts')),
    ...(await readFilesUnder(import.meta.url, '../', '.tsx')),
  ]
  const core = await readFilesUnder(import.meta.url, '../../../../packages/core/src/', '.ts')
  const contract = await readFilesUnder(
    import.meta.url,
    '../../../../packages/contract/src/',
    '.ts',
  )
  const packages = [
    ...core.map(({ path, text }) => ({ path: `core/${path}`, text })),
    ...contract.map(({ path, text }) => ({ path: `contract/${path}`, text })),
  ]
  return [...web, ...packages].filter(
    ({ path }) => !/\.test\.tsx?$|(^|\/)test\/|test-corpus|benchmarks/.test(path),
  )
}

describe('sport comparisons', () => {
  it('keeps a per-sport value in a table keyed by Sport, within the budget of comparisons left', async () => {
    const total = (await sourceFiles()).reduce(
      (sum, { text }) => sum + [...text.matchAll(SPORT_CHECK)].length,
      0,
    )
    expect(total).toBeLessThanOrEqual(SPORT_CHECK_BUDGET)
  })
})
