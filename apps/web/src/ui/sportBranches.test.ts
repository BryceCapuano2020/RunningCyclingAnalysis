import { describe, expect, it } from 'vitest'
import { SPORTS } from '@rca/core/types'
import { readFilesUnder } from './components/stylesheet'

const SPORT = `(?:${SPORTS.join('|')})`

/**
 * A comparison with a literal sport, whatever the other side is called: `view.sport === 'run'`,
 * `lean !== 'ride'`, `'run' === kind` or `case 'ride':`. Per-sport values (labels, units, colours,
 * formatters, glyphs) are read from SPORT_FORMAT and the other tables keyed by Sport, so a comparison
 * left is a logic branch that a table cannot hold.
 */
const SPORT_CHECK = new RegExp(
  [
    String.raw`(?:[!=]==?)\s*['"]${SPORT}['"]`,
    String.raw`['"]${SPORT}['"]\s*(?:[!=]==?)`,
    String.raw`\bcase\s+['"]${SPORT}['"]`,
  ].join('|'),
  'g',
)

/** The most sport comparisons the source may hold outside tests. A new one needs a table instead. */
const SPORT_CHECK_BUDGET = 60

/** The sport list written out in full, as `['run', 'ride']` with either quote. */
const SPORT_LIST = SPORTS.map((sport) => `['"]${sport}['"]`).join(String.raw`\s*,\s*`)

/**
 * Each place the source writes the sport list out again, or reads the first sport of SPORT_ORDER. The
 * list is SPORTS; a new copy imports it, and a new first-sport read names the sport it means.
 */
const SPORT_LIST_USE = new RegExp(
  [String.raw`\[\s*${SPORT_LIST}\s*\]`, String.raw`\bSPORT_ORDER\[0\]`].join('|'),
  'g',
)

/** The most sport-list copies and first-sport reads the source may hold outside tests. */
const SPORT_LIST_BUDGET = 10

/** The web app's, the two packages' and the API's source, without the tests, their fixtures or the benchmarks. */
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
  const api = await readFilesUnder(import.meta.url, '../../../../apps/api/src/', '.ts')
  const packages = [
    ...core.map(({ path, text }) => ({ path: `core/${path}`, text })),
    ...contract.map(({ path, text }) => ({ path: `contract/${path}`, text })),
    ...api.map(({ path, text }) => ({ path: `api/${path}`, text })),
  ]
  return [...web, ...packages].filter(
    ({ path }) => !/\.test\.tsx?$|(^|\/)test\/|test-corpus|benchmarks/.test(path),
  )
}

/** How many matches of a pattern the source holds, summed over its files. */
async function countIn(pattern: RegExp): Promise<number> {
  return (await sourceFiles()).reduce(
    (sum, { text }) => sum + [...text.matchAll(pattern)].length,
    0,
  )
}

describe('sport comparisons', () => {
  it('keeps a per-sport value in a table keyed by Sport, within the budget of comparisons left', async () => {
    expect(await countIn(SPORT_CHECK)).toBeLessThanOrEqual(SPORT_CHECK_BUDGET)
  })

  it('keeps the sport list in SPORTS, within the budget of copies left', async () => {
    expect(await countIn(SPORT_LIST_USE)).toBeLessThanOrEqual(SPORT_LIST_BUDGET)
  })
})
