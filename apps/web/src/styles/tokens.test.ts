import { describe, expect, it } from 'vitest'
import { readStylesheet, ruleBody } from '../ui/components/stylesheet'
import { contrast, over } from './contrastMath'
import { colour, declarations, declared, resolved, type Tokens } from './tokenSheet'
import { LABEL_REM } from '../ui/charts/rootFont'

const tokensCss = await readStylesheet(import.meta.url, './tokens.css')
const designMd = await readStylesheet(import.meta.url, '../../../../docs/DESIGN.md')
const privacyCss = await readStylesheet(import.meta.url, './privacy.css')
const ladderCss = await readStylesheet(import.meta.url, '../ui/components/LevelLadder.css')

/** The Colour section of docs/DESIGN.md, up to the Type section. */
function colourSection(markdown: string): string {
  const start = markdown.indexOf('## Colour')
  const end = markdown.indexOf('## Type')
  if (start < 0 || end < start) throw new Error('no Colour section in docs/DESIGN.md')
  return markdown.slice(start, end)
}

const TABLE_ROW = '| `--'

/** The colour rows of the DESIGN.md table: each token with its light and dark value. */
function colourTable(section: string): Map<string, { light: string; dark: string }> {
  const rows = new Map<string, { light: string; dark: string }>()
  const row = /^\|\s*`--([a-z0-9-]+)`\s*\|\s*`(#[0-9a-f]{6,8})`\s*\|\s*`(#[0-9a-f]{6,8})`/
  for (const line of section.split('\n')) {
    const match = row.exec(line)
    const [, name, light, dark] = match ?? []
    if (name !== undefined && light !== undefined && dark !== undefined) {
      rows.set(name, { light, dark })
    }
  }
  return rows
}

/** Spacing, radius, type and shadow tokens are not colours, so they need no table row. */
const NOT_COLOUR =
  /^(space-\d|radius(-sm|-pill)?$|control-height$|header-height$|tab-bar-height$|sticky-extra$|font-|shadow(-pop)?$|text-(xs|sm|md|label|lead)$|tracking-(caps|tab)$|column-[a-z-]+$|page-width$|measure$|(section|stack)-gap$|display-\d$|title$|heading$|lh-display$)/

const lightRaw = declared(tokensCss, ':root')
const darkRaw = declared(tokensCss, ":root:not([data-theme='light'])")
const light = resolved(lightRaw)
const dark = resolved(new Map([...lightRaw, ...darkRaw]))

const section = colourSection(designMd)
const table = colourTable(section)
const rowCount = section.split('\n').filter((line) => line.startsWith(TABLE_ROW)).length

const TEXT = 4.5
const GRAPHIC = 3

/** Each pair docs/DESIGN.md promises, as foreground, background and the least ratio it reaches. */
const PAIRS: [string, string, number][] = [
  ['text-primary', 'surface-0', TEXT],
  ['text-primary', 'surface-1', TEXT],
  ['text-secondary', 'surface-0', TEXT],
  ['text-secondary', 'surface-1', TEXT],
  ['text-muted', 'surface-0', TEXT],
  ['text-muted', 'surface-1', TEXT],
  ['previous-mark', 'surface-0', GRAPHIC],
  ['previous-mark', 'surface-1', GRAPHIC],
  ['control-border', 'surface-0', GRAPHIC],
  ['control-border', 'surface-1', GRAPHIC],
  ['control-border', 'surface-2', GRAPHIC],
  ['accent-contrast', 'accent', TEXT],
  ['selected-contrast', 'selected', TEXT],
  ['highlight-ink', 'highlight', TEXT],
  ['focus', 'surface-0', GRAPHIC],
  ['focus', 'surface-1', GRAPHIC],
  ['series-run', 'surface-1', GRAPHIC],
  ['run-ink', 'surface-0', TEXT],
  ['run-ink', 'surface-1', TEXT],
  ['ride-ink', 'surface-0', TEXT],
  ['ride-ink', 'surface-1', TEXT],
  ['series-ride', 'surface-1', GRAPHIC],
  ['series-swim', 'surface-1', GRAPHIC],
  ['status-warning', 'surface-1', TEXT],
  ['status-warning', 'status-warning-bg', TEXT],
  ['status-critical', 'surface-1', TEXT],
  ['status-critical', 'status-critical-bg', TEXT],
  ['status-good', 'surface-1', TEXT],
  ['status-good', 'status-good-bg', TEXT],
]

const CASES = [
  ...PAIRS.map(([fg, bg, min]) => ({ theme: 'light', tokens: light, fg, bg, min })),
  ...PAIRS.map(([fg, bg, min]) => ({ theme: 'dark', tokens: dark, fg, bg, min })),
]

describe('colour tokens', () => {
  it('parses one entry for every colour row in the DESIGN.md table', () => {
    expect(rowCount).toBeGreaterThan(0)
    expect(table.size).toBe(rowCount)
  })

  it('has a table row for every colour token in tokens.css', () => {
    const names = new Set([...lightRaw.keys(), ...darkRaw.keys()])
    const missing = [...names].filter((name) => !NOT_COLOUR.test(name) && !table.has(name))
    expect(missing).toEqual([])
  })

  it.each([...table])('--%s has the light and dark values in docs/DESIGN.md', (name, values) => {
    expect(light.get(name)).toBe(values.light.toLowerCase())
    expect(dark.get(name)).toBe(values.dark.toLowerCase())
  })
})

/** The privacy page's colour properties, mapped to the tokens they copy in each theme. */
const PRIVACY_TOKENS: Record<string, string> = {
  page: 'surface-0',
  ink: 'text-primary',
  muted: 'text-muted',
  link: 'link',
  rule: 'border',
  'mark-tile': 'mark-tile',
  'mark-ring': 'mark-ring',
  'series-run': 'series-run',
  'series-ride': 'series-ride',
}

/** The privacy page's sizes, which no theme changes, mapped to the tokens they copy. */
const PRIVACY_SIZES: Record<string, string> = {
  'control-height': 'control-height',
  'text-sm': 'text-sm',
  'text-md': 'text-md',
  'text-lead': 'text-lead',
  'radius-sm': 'radius-sm',
  measure: 'measure',
}

describe('privacy page', () => {
  const privacyLight = declared(privacyCss, ':root')
  const privacyDark = declared(privacyCss, ":root:not([data-theme='light'])")

  it('declares the colours and sizes in light, and only the colours in dark', () => {
    const colours = Object.keys(PRIVACY_TOKENS)
    expect([...privacyLight.keys()].sort()).toEqual(
      [...colours, ...Object.keys(PRIVACY_SIZES)].sort(),
    )
    expect([...privacyDark.keys()].sort()).toEqual(colours.sort())
  })

  it.each(Object.entries(PRIVACY_TOKENS))(
    '--%s matches --%s in tokens.css in both themes',
    (name, token) => {
      expect(privacyLight.get(name)).toBe(light.get(token))
      expect(privacyDark.get(name)).toBe(dark.get(token))
    },
  )

  it.each(Object.entries(PRIVACY_SIZES))('--%s matches --%s in tokens.css', (name, token) => {
    expect(privacyLight.get(name)).toBe(light.get(token))
  })
})

/** The marks that sit on a running or cycling tint in the ratio chart, and the least ratio each reaches. */
const ON_TINT: [string, string, number][] = [
  ['neutral-mark', 'series-run-soft', GRAPHIC],
  ['neutral-mark', 'series-ride-soft', GRAPHIC],
  // The zero line is text-muted, and it runs across the boundary between the two tints.
  ['text-muted', 'series-run-soft', GRAPHIC],
  ['text-muted', 'series-ride-soft', GRAPHIC],
  ['text-secondary', 'series-run-soft', TEXT],
  ['text-secondary', 'series-ride-soft', TEXT],
]

const TINT_CASES = [
  ...ON_TINT.map(([fg, tint, min]) => ({ theme: 'light', tokens: light, fg, tint, min })),
  ...ON_TINT.map(([fg, tint, min]) => ({ theme: 'dark', tokens: dark, fg, tint, min })),
]

describe('contrast on the ratio chart’s tints', () => {
  it.each(TINT_CASES)(
    '$theme: --$fg on the --$tint tint, over the plot, reaches $min:1',
    ({ tokens, fg, tint, min }) => {
      const plot = colour(tokens, 'surface-1')
      const painted = tokens.get(tint)
      if (painted === undefined || !/^#[0-9a-f]{8}$/.test(painted)) {
        throw new Error(`--${tint} is not a translucent hex colour`)
      }
      expect(contrast(colour(tokens, fg), over(painted, plot))).toBeGreaterThanOrEqual(min)
    },
  )
})

/**
 * The band's fill is deliberately faint (DESIGN.md: about 1.2:1 against the card), so the fill alone
 * never carries it; the band's edge is the neutral-mark outline checked above. This pins the faint
 * fill so that it stays visible over either tint.
 */
const BAND_FILL_MIN = 1.2

const BAND_CASES = [
  ...(['run', 'ride'] as const).map((side) => ({ theme: 'light', tokens: light, side })),
  ...(['run', 'ride'] as const).map((side) => ({ theme: 'dark', tokens: dark, side })),
]

describe('the band fill on the ratio chart’s tints', () => {
  it.each(BAND_CASES)(
    '$theme: --neutral-band over the --series-$side-soft tint stays visible',
    ({ tokens, side }) => {
      const plot = colour(tokens, 'surface-1')
      const tint = over(String(tokens.get(`series-${side}-soft`)), plot)
      const band = over(String(tokens.get('neutral-band')), tint)
      expect(contrast(band, tint)).toBeGreaterThanOrEqual(BAND_FILL_MIN)
    },
  )
})

/**
 * Gridlines are visible but recessive: far enough from the card to see in either scheme (they were 1.2:1,
 * and gone in dark), and well under the 3:1 of a mark that carries data.
 */
const GRID_MIN = 1.4
const GRID_MAX = 2

describe('chart gridlines and axis text', () => {
  it.each([
    ['light', light],
    ['dark', dark],
  ] as const)(
    '%s: --grid is visible on the card and on the page, and stays recessive',
    (_theme, tokens) => {
      for (const surface of ['surface-0', 'surface-1'] as const) {
        const ratio = contrast(colour(tokens, 'grid'), colour(tokens, surface))
        expect(ratio, surface).toBeGreaterThanOrEqual(GRID_MIN - 0.05)
        expect(ratio, surface).toBeLessThanOrEqual(GRID_MAX)
      }
      expect(contrast(colour(tokens, 'grid'), colour(tokens, 'surface-1'))).toBeGreaterThanOrEqual(
        GRID_MIN,
      )
    },
  )

  it('sets axis text at 12 px or more, in the muted ink that reads 4.5:1 on the card', () => {
    expect(LABEL_REM * 16).toBeGreaterThanOrEqual(12)
    for (const tokens of [light, dark]) {
      expect(
        contrast(colour(tokens, 'text-muted'), colour(tokens, 'surface-1')),
      ).toBeGreaterThanOrEqual(TEXT)
    }
  })
})

describe('contrast', () => {
  it('computes the WCAG ratio, from 1:1 to 21:1', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrast('#777777', '#777777')).toBeCloseTo(1, 5)
  })

  it.each(CASES)('$theme: --$fg on --$bg reaches $min:1', ({ tokens, fg, bg, min }) => {
    expect(contrast(colour(tokens, fg), colour(tokens, bg))).toBeGreaterThanOrEqual(min)
  })
})

/** A token that is an opaque colour, or a translucent one, as the ladder's bands are. */
function paint(tokens: Tokens, name: string): string {
  const value = tokens.get(name)
  if (value === undefined || !/^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(value)) {
    throw new Error(`--${name} is not a hex colour`)
  }
  return value
}

/**
 * The level ladder's marks against the surfaces they are drawn on: the ring and the dot in the sport
 * colour, the band edges in neutral, each over the band or track beneath it.
 */
function ladderPairs(tokens: Tokens): [string, string, string][] {
  const track = colour(tokens, 'surface-2')
  const card = colour(tokens, 'surface-1')
  const runBand = over(paint(tokens, 'ladder-run-band'), track)
  const rideBand = over(paint(tokens, 'ladder-ride-band'), track)
  return [
    ['run ring on its range band', colour(tokens, 'series-run'), runBand],
    ['ride ring on its range band', colour(tokens, 'series-ride'), rideBand],
    ['band edge inside a ride range', colour(tokens, 'neutral-mark'), rideBand],
    ['band edge on the track', colour(tokens, 'neutral-mark'), track],
    ['band edge beyond the bar', colour(tokens, 'neutral-mark'), card],
    ['run dot on the track', colour(tokens, 'series-run'), track],
  ]
}

describe('level ladder contrast', () => {
  it.each([
    ['light', light],
    ['dark', dark],
  ] as const)('%s: every mark reaches 3:1 against what it sits on', (_theme, tokens) => {
    for (const [label, fg, bg] of ladderPairs(tokens)) {
      expect(contrast(fg, bg), label).toBeGreaterThanOrEqual(GRAPHIC)
    }
  })
})

describe('record chip contrast', () => {
  // A record chip is ink on its sport's soft fill, laid over the card or the page it sits on.
  it.each([
    ['light', light],
    ['dark', dark],
  ] as const)(
    '%s: ink reaches 4.5:1 on each sport fill over the card and the page',
    (_theme, tokens) => {
      for (const sport of ['run', 'ride'] as const) {
        const fill = paint(tokens, `series-${sport}-soft`)
        for (const surface of ['surface-0', 'surface-1'] as const) {
          const painted = over(fill, colour(tokens, surface))
          expect(
            contrast(colour(tokens, 'text-primary'), painted),
            `${sport} on ${surface}`,
          ).toBeGreaterThanOrEqual(TEXT)
        }
      }
    },
  )
})

describe('level ladder stylesheet', () => {
  it('lets the ladder fill its column rather than stop at a fixed width', () => {
    expect(ruleBody(ladderCss, '.level-ladder')).not.toMatch(/max-width/)
  })

  it('paints each sport’s band with that sport’s ladder band token', () => {
    expect(declarations(ladderCss, '.level-ladder--run').get('--ladder-band')).toBe(
      'var(--ladder-run-band)',
    )
    expect(declarations(ladderCss, '.level-ladder--ride').get('--ladder-band')).toBe(
      'var(--ladder-ride-band)',
    )
  })

  it('draws each sport’s marker in the sport colour its figure carries, not a colour of its own', () => {
    expect(declarations(ladderCss, '.level-ladder').get('--ladder-colour')).toBe(
      'var(--sport-colour)',
    )
  })

  it('draws the band edges in neutral-mark', () => {
    expect(declarations(ladderCss, '.level-ladder__edge').get('background')).toBe(
      'var(--neutral-mark)',
    )
  })

  it('fills the range with the sport’s band token', () => {
    expect(
      declarations(ladderCss.slice(0, ladderCss.indexOf('@media')), '.level-ladder__range').get(
        'background',
      ),
    ).toBe('var(--ladder-band)')
  })
})

describe('chart label size', () => {
  it('is the --text-xs token, so a chart label and the type scale stay one size', () => {
    expect(light.get('text-xs')).toBe(`${LABEL_REM}rem`)
  })
})
