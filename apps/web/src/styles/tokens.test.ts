import { describe, expect, it } from 'vitest'
import { readStylesheet, ruleBody } from '../ui/components/stylesheet'
import { contrast, over } from './contrastMath'
import { colour, declarations, declared, resolved } from './tokenSheet'
import { LABEL_REM } from '../ui/charts/rootFont'

const tokensCss = await readStylesheet(import.meta.url, './tokens.css')
const systemMd = await readStylesheet(import.meta.url, '../../../../docs/design/system.md')
const designMd = await readStylesheet(import.meta.url, '../../../../docs/DESIGN.md')
const privacyCss = await readStylesheet(import.meta.url, './privacy.css')
const ladderCss = await readStylesheet(import.meta.url, '../ui/components/LevelLadder.css')

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

describe('the old names', () => {
  const start = tokensCss.indexOf('Old names:')
  const block = tokensCss.slice(tokensCss.indexOf(':root {', start))
  const old = declared(`\n${block}`, ':root')

  it('are a block at the foot of tokens.css, and every one is a var() of a new token, or none', () => {
    expect(old.size).toBeGreaterThan(30)
    const own = [...old].filter(([, value]) => !/^(var\(--[a-z0-9-]+\)|none)$/.test(value))
    expect(own).toEqual([])
  })

  it('point at a token declared above the block, never at another old name', () => {
    const above = declared(tokensCss.slice(0, start), ':root')
    const dangling = [...old]
      .map(([name, value]) => [name, /var\(--([a-z0-9-]+)\)/.exec(value)?.[1]] as const)
      .filter(([, target]) => target !== undefined && !above.has(target))
    expect(dangling).toEqual([])
  })

  it('resolve every one to a colour or to none, so a page reading one gets paper and ink', () => {
    for (const name of old.keys())
      expect(paper.get(name), name).toMatch(/^(#[0-9a-f]{6,8}|none|\d+px|.+rem|.+em|.+, .+)$/)
  })
})

/** The privacy page's properties, mapped to the tokens they copy. */
const PRIVACY_TOKENS: Record<string, string> = {
  page: 'paper',
  ink: 'ink',
  muted: 'ink-secondary',
  link: 'ink',
  hairline: 'hairline',
  rule: 'rule',
  title: 'title',
  'mark-tile': 'ink',
  'mark-ring': 'ink',
  'series-run': 'run-ink',
  'series-ride': 'ride-ink',
  'control-height': 'control-height',
  'text-sm': 'text-sm',
  'text-md': 'text-md',
  'text-lead': 'text-lead',
  'text-meta': 'text-meta',
  'radius-sm': 'radius',
  measure: 'measure',
}

describe('privacy page', () => {
  const copies = declared(privacyCss, ':root')

  it('declares exactly the properties it copies', () => {
    expect([...copies.keys()].sort()).toEqual(Object.keys(PRIVACY_TOKENS).sort())
  })

  it.each(Object.entries(PRIVACY_TOKENS))('--%s matches --%s in tokens.css', (name, token) => {
    expect(copies.get(name)).toBe(paper.get(token))
  })
})

/** The marks that sit on a running or cycling tint in the ratio chart, and the least ratio each reaches. */
const ON_TINT: [string, string, number][] = [
  ['neutral-mark', 'series-run-soft', GRAPHIC],
  ['neutral-mark', 'series-ride-soft', GRAPHIC],
  ['text-secondary', 'series-run-soft', TEXT],
  ['text-secondary', 'series-ride-soft', TEXT],
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
      const tint = over(String(paper.get(`series-${side}-soft`)), colour(paper, 'paper'))
      const band = over(String(paper.get('neutral-band')), tint)
      expect(contrast(band, tint)).toBeGreaterThanOrEqual(1.02)
    }
  })
})

describe('chart gridlines and axis text', () => {
  it('draws --grid visible on the paper and well under the 3:1 of a mark that carries data', () => {
    const ratio = contrast(colour(paper, 'grid'), colour(paper, 'paper'))
    expect(ratio).toBeGreaterThanOrEqual(1.1)
    expect(ratio).toBeLessThanOrEqual(2)
  })

  it('sets axis text at 12 px or more, in the secondary ink that reads 4.5:1 on the paper', () => {
    expect(LABEL_REM * 16).toBeGreaterThanOrEqual(12)
    expect(contrast(colour(paper, 'text-muted'), colour(paper, 'paper'))).toBeGreaterThanOrEqual(
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

describe('level ladder', () => {
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

  it('fills its column, draws no wash for a range, and paints its marks in ink', () => {
    expect(ruleBody(ladderCss, '.level-ladder')).not.toMatch(/max-width/)
    expect(ladderCss).not.toMatch(/level-ladder__range/)
    expect(declarations(ladderCss, '.level-ladder__dot').get('background')).toBe('var(--ink)')
    expect(declarations(ladderCss, '.level-ladder__edge').get('background')).toBe(
      'var(--ink-secondary)',
    )
  })
})

describe('chart label size', () => {
  it('is the --text-xs token, so a chart label and the type scale stay one size', () => {
    expect(paper.get('text-xs')).toBe(`${LABEL_REM}rem`)
  })
})
