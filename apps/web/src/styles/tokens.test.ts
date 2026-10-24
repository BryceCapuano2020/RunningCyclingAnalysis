import { describe, expect, it } from 'vitest'
import { readStylesheet } from '../ui/components/stylesheet'

const tokensCss = await readStylesheet(import.meta.url, './tokens.css')
const designMd = await readStylesheet(import.meta.url, '../../../../docs/DESIGN.md')
const privacyCss = await readStylesheet(import.meta.url, '../../public/privacy.css')
const ladderCss = await readStylesheet(import.meta.url, '../ui/components/LevelLadder.css')

type Tokens = Map<string, string>

/** The custom properties declared in the first block that opens with `selector`. */
function declared(css: string, selector: string): Tokens {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`no ${selector} block in tokens.css`)
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start))
  const tokens: Tokens = new Map()
  for (const match of body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    const [, name, value] = match
    if (name !== undefined && value !== undefined) tokens.set(name, value.trim().toLowerCase())
  }
  return tokens
}

/** The same tokens with each var(--name) replaced by the value that name resolves to. */
function resolved(tokens: Tokens): Tokens {
  const expand = (value: string, seen: string[]): string =>
    value.replace(/var\(--([a-z0-9-]+)\)/g, (_match: string, name: string) => {
      const next = tokens.get(name)
      if (next === undefined || seen.includes(name)) throw new Error(`--${name} does not resolve`)
      return expand(next, [...seen, name])
    })
  return new Map(
    [...tokens].map(([name, value]): [string, string] => [name, expand(value, [name])]),
  )
}

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

/** WCAG relative luminance of an opaque #rrggbb colour. */
function luminance(hex: string): number {
  const linear = (start: number) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(1) + 0.7152 * linear(3) + 0.0722 * linear(5)
}

/** WCAG contrast ratio between two opaque colours, from 1 to 21. */
function contrast(a: string, b: string): number {
  const x = luminance(a)
  const y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

function colour(tokens: Tokens, name: string): string {
  const value = tokens.get(name)
  if (value === undefined || !/^#[0-9a-f]{6}$/.test(value)) {
    throw new Error(`--${name} is not an opaque hex colour`)
  }
  return value
}

/** Spacing, radius, type and shadow tokens are not colours, so they need no table row. */
const NOT_COLOUR = /^(space-\d|radius(-sm)?$|font-|shadow$)/

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
  ['control-border', 'surface-0', GRAPHIC],
  ['control-border', 'surface-1', GRAPHIC],
  ['control-border', 'surface-2', GRAPHIC],
  ['accent-contrast', 'accent', TEXT],
  ['selected-contrast', 'selected', TEXT],
  ['focus', 'surface-0', GRAPHIC],
  ['focus', 'surface-1', GRAPHIC],
  ['series-run', 'surface-1', GRAPHIC],
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

/** The privacy page's custom properties, mapped to the tokens they copy. */
const PRIVACY_TOKENS: Record<string, string> = {
  page: 'surface-0',
  ink: 'text-primary',
  muted: 'text-muted',
  link: 'link',
  rule: 'border',
}

describe('privacy page', () => {
  const privacyLight = declared(privacyCss, ':root')
  const privacyDark = declared(privacyCss, ":root:not([data-theme='light'])")

  it('declares exactly the mapped properties in each theme', () => {
    const names = Object.keys(PRIVACY_TOKENS).sort()
    expect([...privacyLight.keys()].sort()).toEqual(names)
    expect([...privacyDark.keys()].sort()).toEqual(names)
  })

  it.each(Object.entries(PRIVACY_TOKENS))(
    '--%s matches --%s in tokens.css in both themes',
    (name, token) => {
      expect(privacyLight.get(name)).toBe(light.get(token))
      expect(privacyDark.get(name)).toBe(dark.get(token))
    },
  )
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

describe('contrast', () => {
  it('computes the WCAG ratio, from 1:1 to 21:1', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrast('#777777', '#777777')).toBeCloseTo(1, 5)
  })

  it.each(CASES)('$theme: --$fg on --$bg reaches $min:1', ({ tokens, fg, bg, min }) => {
    expect(contrast(colour(tokens, fg), colour(tokens, bg))).toBeGreaterThanOrEqual(min)
  })
})

/** A colour as #rrggbb or #rrggbbaa, laid over an opaque background, as the browser paints it. */
function over(foreground: string, background: string): string {
  const alpha = foreground.length === 9 ? parseInt(foreground.slice(7, 9), 16) / 255 : 1
  const channels = [1, 3, 5].map((start) => {
    const top = parseInt(foreground.slice(start, start + 2), 16)
    const below = parseInt(background.slice(start, start + 2), 16)
    return Math.round(top * alpha + below * (1 - alpha))
      .toString(16)
      .padStart(2, '0')
  })
  return `#${channels.join('')}`
}

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

/** The declarations of the rule whose selector is exactly this, as property to value. */
function declarations(css: string, selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`no ${selector} rule in the stylesheet`)
  if (css.indexOf(`${selector} {`, start + 1) >= 0) throw new Error(`${selector} is declared twice`)
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start))
  const found = new Map<string, string>()
  for (const match of body.matchAll(/([a-z-]+)\s*:\s*([^;]+);/g)) {
    const [, property, value] = match
    if (property !== undefined && value !== undefined) {
      found.set(property, value.trim().toLowerCase())
    }
  }
  return found
}

describe('level ladder stylesheet', () => {
  it('paints each sport’s band with that sport’s ladder band token', () => {
    expect(declarations(ladderCss, '.level-ladder--run').get('--ladder-band')).toBe(
      'var(--ladder-run-band)',
    )
    expect(declarations(ladderCss, '.level-ladder--ride').get('--ladder-band')).toBe(
      'var(--ladder-ride-band)',
    )
  })

  it('draws each sport’s marker in the sport colour', () => {
    expect(declarations(ladderCss, '.level-ladder--run').get('--ladder-colour')).toBe(
      'var(--series-run)',
    )
    expect(declarations(ladderCss, '.level-ladder--ride').get('--ladder-colour')).toBe(
      'var(--series-ride)',
    )
  })

  it('strokes the band edges in neutral-mark', () => {
    expect(declarations(ladderCss, '.level-ladder__edge').get('stroke')).toBe('var(--neutral-mark)')
  })

  it('fills the range with the sport’s band token', () => {
    expect(declarations(ladderCss, '.level-ladder__range').get('fill')).toBe('var(--ladder-band)')
  })
})
