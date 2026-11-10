import { describe, expect, it } from 'vitest'
import { readFilesUnder, readStylesheet, readStylesheetsUnder } from '../ui/test/stylesheet'
import { contrast, over } from './contrastMath'
import { colour, declared, resolved } from './tokenSheet'
import { LABEL_REM } from '../ui/charts/rootFont'

const tokensCss = await readStylesheet(import.meta.url, './tokens.css')
const systemMd = await readStylesheet(import.meta.url, '../../../../docs/design/system.md')
const designMd = await readStylesheet(import.meta.url, '../../../../docs/DESIGN.md')
const privacyCss = await readStylesheet(import.meta.url, './privacy.css')

/** The Colour section of docs/design/system.md, up to its Type section. */
function colourSection(markdown: string): string {
  const start = markdown.indexOf('## Colour')
  const end = markdown.indexOf('## Type')
  if (start < 0 || end < start) throw new Error('no Colour section in docs/design/system.md')
  return markdown.slice(start, end)
}

const TABLE_ROW = '| `--'

/** The colour rows of the system.md table (Token | Value | Use), as token to value. */
function colourTable(section: string): Map<string, string> {
  const rows = new Map<string, string>()
  for (const line of section.split('\n')) {
    const [, name, value] = /^\|\s*`--([a-z0-9-]+)`\s*\|\s*`(#[0-9a-f]{6,8})`\s*\|/.exec(line) ?? []
    if (name !== undefined && value !== undefined) rows.set(name, value)
  }
  return rows
}

const raw = declared(tokensCss, ':root')
const paper = resolved(raw)
const section = colourSection(systemMd)
const table = colourTable(section)
const rowCount = section.split('\n').filter((line) => line.startsWith(TABLE_ROW)).length

/** The zone ramps, the level bands and the activity channels are data, with tests of their own. */
const DATA_COLOUR = /^(zone-|level-|ch-)/

const TEXT = 4.5
const GRAPHIC = 3

/** Each pair docs/design/system.md promises, as foreground, background and the least ratio it reaches. */
const PAIRS: [string, string, number][] = [
  ['ink', 'paper', TEXT],
  ['ink', 'paper-hover', TEXT],
  ['ink-secondary', 'paper', TEXT],
  ['ink-secondary', 'paper-hover', TEXT],
  ['ink-secondary', 'paper-pressed', TEXT],
  ['paper', 'ink', TEXT],
  ['paper', 'ink-hover', TEXT],
  ['control-border', 'paper', GRAPHIC],
  ['control-border', 'paper-hover', GRAPHIC],
  ['previous-mark', 'paper', GRAPHIC],
  ['run-ink', 'paper', TEXT],
  ['ride-ink', 'paper', TEXT],
  ['swim-ink', 'paper', TEXT],
  ['lift-ink', 'paper', TEXT],
  ['status-critical', 'paper', TEXT],
  ['status-warning', 'paper', TEXT],
  ['status-good', 'paper', TEXT],
]

describe('colour tokens', () => {
  it('parses one entry for every colour row in the system.md table', () => {
    expect(rowCount).toBeGreaterThan(0)
    expect(table.size).toBe(rowCount)
  })

  it('keeps the table in one place: DESIGN.md points to system.md and holds no colour row', () => {
    expect(designMd).toContain('(design/system.md)')
    // The level bands table is DESIGN.md's own (levelTokens.test.ts); every other colour row is system.md's.
    const rows = designMd.split('\n').filter((line) => line.startsWith(TABLE_ROW))
    expect(rows.filter((line) => !line.startsWith('| `--level-'))).toEqual([])
  })

  it('has a table row for every colour token in tokens.css that holds a colour of its own', () => {
    const own = [...raw].filter(
      ([name, value]) => /^#[0-9a-f]{6,8}$/.test(value) && !DATA_COLOUR.test(name),
    )
    expect(own.map(([name]) => name).filter((name) => !table.has(name))).toEqual([])
  })

  it.each([...table])('--%s is %s in tokens.css, as in docs/design/system.md', (name, value) => {
    expect(raw.get(name)).toBe(value.toLowerCase())
  })

  it.each(PAIRS)('--%s on --%s reaches %d:1', (fg, bg, min) => {
    expect(contrast(colour(paper, fg), colour(paper, bg))).toBeGreaterThanOrEqual(min)
  })
})

/**
 * The names the paper system retired (Stage V, November 2026). Each was a var() of a paper token while the pages
 * moved; none may come back, as a declaration or a read, in a sheet, a source or the privacy page.
 */
const RETIRED = [
  'surface-0',
  'surface-1',
  'surface-2',
  'surface-pressed',
  'border',
  'grid',
  'divider',
  'text-primary',
  'text-secondary',
  'text-muted',
  'brand',
  'accent',
  'selected',
  'highlight',
  'focus',
  'link',
  'accent-contrast',
  'highlight-ink',
  'selected-contrast',
  'accent-hover',
  'accent-pressed',
  'mark-tile',
  'mark-ring',
  'series-run',
  'series-ride',
  'series-swim',
  'series-run-soft',
  'series-ride-soft',
  'series-swim-soft',
  'ladder-run-band',
  'ladder-ride-band',
  'neutral-mark',
  'neutral-band',
  'status-good-bg',
  'status-warning-bg',
  'status-critical-bg',
  'radius-sm',
  'radius-pill',
  'text-label',
  'display-3',
  'tracking-caps',
  'tracking-tab',
  'font-display',
  'shadow-pop',
  'shadow',
  'sport-colour',
  'sport-colour-soft',
  'muted',
  'page',
]
/**
 * A retired name declared (`--name:`), read (`var(--name`) or quoted as a string (`'--name'`, as a script setting a
 * property would), never a longer name that starts with it.
 */
const RETIRED_USE = new RegExp(
  `(?:var\\(\\s*|^\\s*|['"\`])--(?:${RETIRED.join('|')})(?![a-z0-9-])`,
  'm',
)

const sheets = await readStylesheetsUnder(import.meta.url, '../')
const sources = (await readFilesUnder(import.meta.url, '../', '.ts'))
  .concat(await readFilesUnder(import.meta.url, '../', '.tsx'))
  .filter(({ path }) => !/\.test\.tsx?$/.test(path))
/** What the app ships beside its sources, and the scripts that draw from the tokens (the social card). */
const shipped = [
  ...(await readFilesUnder(import.meta.url, '../../public/', '.html')),
  ...(await readFilesUnder(import.meta.url, '../../public/', '.svg')),
  ...(await readFilesUnder(import.meta.url, '../../public/', '.webmanifest')),
  { path: 'index.html', text: await readStylesheet(import.meta.url, '../../index.html') },
  { path: 'privacy.html', text: await readStylesheet(import.meta.url, '../../privacy.html') },
  ...(await readFilesUnder(import.meta.url, '../../../../scripts/', '.ts')),
  ...(await readFilesUnder(import.meta.url, '../../../../scripts/', '.mjs')),
].filter(({ path }) => !/\.test\.m?ts$/.test(path))

describe('the retired names', () => {
  it('are declared nowhere: tokens.css holds only the paper tokens', () => {
    expect(
      [...declared(tokensCss, ':root').keys()].filter((name) => RETIRED.includes(name)),
    ).toEqual([])
    expect(tokensCss).not.toMatch(/Old names/)
  })

  it('are read by no stylesheet, source, public file or script, the privacy page included', () => {
    expect(shipped.length).toBeGreaterThan(5)
    const offenders = [
      ...sheets.map(({ path, css }) => ({ path, text: css })),
      ...sources,
      ...shipped,
    ]
      .filter(({ text }) => RETIRED_USE.test(text))
      .map(({ path }) => path)
    expect(offenders).toEqual([])
  })

  it('catch a declaration and a read, and leave a longer name and a class modifier alone', () => {
    expect(RETIRED_USE.test('  color: var(--text-secondary);')).toBe(true)
    expect(RETIRED_USE.test('  stroke: var(--sport-colour, red);')).toBe(true)
    expect(RETIRED_USE.test('  --series-run: #c2410c;')).toBe(true)
    expect(RETIRED_USE.test("style.setProperty('--surface-1', paper)")).toBe(true)
    expect(RETIRED_USE.test('  max-width: var(--page-width);')).toBe(false)
    expect(RETIRED_USE.test('.pager__page--selected { color: var(--ink); }')).toBe(false)
  })
})

/** The privacy page's properties: each a copy of the app token of the same name. */
const PRIVACY_TOKENS = [
  'paper',
  'ink',
  'ink-secondary',
  'hairline',
  'rule',
  'title',
  'run-ink',
  'ride-ink',
  'control-height',
  'text-sm',
  'text-md',
  'text-lead',
  'text-meta',
  'radius',
  'measure',
]

describe('privacy page', () => {
  const copies = declared(privacyCss, ':root')

  it('declares exactly the properties it copies', () => {
    expect([...copies.keys()].sort()).toEqual([...PRIVACY_TOKENS].sort())
  })

  it.each(PRIVACY_TOKENS)('--%s matches the token of that name in tokens.css', (name) => {
    expect(copies.get(name)).toBe(paper.get(name))
  })
})

/** The marks that sit on a running or cycling tint in the ratio chart, and the least ratio each reaches. */
const ON_TINT: [string, string, number][] = [
  ['ink-secondary', 'run-wash', TEXT],
  ['ink-secondary', 'ride-wash', TEXT],
]

describe('contrast on the ratio chart’s tints', () => {
  it.each(ON_TINT)('--%s on the --%s tint, over the plot, reaches %d:1', (fg, tint, min) => {
    const painted = paper.get(tint)
    expect(painted).toMatch(/^#[0-9a-f]{8}$/)
    expect(
      contrast(colour(paper, fg), over(painted ?? '', colour(paper, 'paper'))),
    ).toBeGreaterThanOrEqual(min)
  })

  it('keeps the neutral band visible over either tint', () => {
    for (const side of ['run', 'ride']) {
      const tint = over(String(paper.get(`${side}-wash`)), colour(paper, 'paper'))
      const band = over(String(paper.get('rule')), tint)
      expect(contrast(band, tint)).toBeGreaterThanOrEqual(1.02)
    }
  })
})

describe('chart gridlines and axis text', () => {
  it('draws --hairline visible on the paper and well under the 3:1 of a mark that carries data', () => {
    const ratio = contrast(colour(paper, 'hairline'), colour(paper, 'paper'))
    expect(ratio).toBeGreaterThanOrEqual(1.1)
    expect(ratio).toBeLessThanOrEqual(2)
  })

  it('sets axis text at 12 px or more, in the secondary ink that reads 4.5:1 on the paper', () => {
    expect(LABEL_REM * 16).toBeGreaterThanOrEqual(12)
    expect(contrast(colour(paper, 'ink-secondary'), colour(paper, 'paper'))).toBeGreaterThanOrEqual(
      TEXT,
    )
  })
})

describe('contrast', () => {
  it('computes the WCAG ratio, from 1:1 to 21:1', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrast('#777777', '#777777')).toBeCloseTo(1, 5)
  })
})

describe('marks and sport fills on the page', () => {
  it('reaches 3:1 for every mark against what it sits on', () => {
    const page = colour(paper, 'paper')
    const pairs: [string, string, string][] = [
      ['ink ring on the page', colour(paper, 'ink'), page],
      ['band edge on the page', colour(paper, 'ink-secondary'), page],
      ['ink dot on the page', colour(paper, 'ink'), page],
    ]
    for (const [label, fg, bg] of pairs)
      expect(contrast(fg, bg), label).toBeGreaterThanOrEqual(GRAPHIC)
  })

  it('reads 4.5:1 for ink on each sport fill over the paper', () => {
    for (const sport of ['run', 'ride']) {
      const painted = over(String(paper.get(`${sport}-wash`)), colour(paper, 'paper'))
      expect(contrast(colour(paper, 'ink'), painted), sport).toBeGreaterThanOrEqual(TEXT)
    }
  })
})

describe('chart label size', () => {
  it('is the --text-xs token, so a chart label and the type scale stay one size', () => {
    expect(paper.get('text-xs')).toBe(`${LABEL_REM}rem`)
  })
})
