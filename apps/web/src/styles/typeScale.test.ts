import { describe, expect, it } from 'vitest'
import { readStylesheet, readStylesheetsUnder, ruleBody } from '../ui/components/stylesheet'
import { declared } from './tokenSheet'

const tokens = declared(await readStylesheet(import.meta.url, './tokens.css'), ':root')
const sheets = await readStylesheetsUnder(import.meta.url, '../')
const components = await readStylesheet(import.meta.url, './components.css')
const base = await readStylesheet(import.meta.url, './base.css')

interface Rule {
  sheet: string
  selectors: string[]
  body: string
}

/** Every rule of every sheet, comments removed, a nested @media rule counted as its own. */
const rules: Rule[] = sheets.flatMap(({ path, css }) =>
  [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    sheet: path.split('/').pop() ?? path,
    selectors: (match[1] ?? '')
      .replace(/@media[^{]*$/, '')
      .split(',')
      .map((selector) => selector.trim().replace(/\s+/g, ' '))
      .filter((selector) => selector !== ''),
    body: match[2] ?? '',
  })),
)

const HEAVY = /font-weight:\s*(?:[6-9]00|bold)\b/

/** The scale in docs/design/system.md: fixed sizes, no clamps. */
const SCALE: Record<string, string> = {
  'display-1': '2.5rem',
  'display-2': '2rem',
  title: '1.5rem',
  heading: '1.3125rem',
  'text-lead': '1.125rem',
  'text-md': '1.0625rem',
  'text-sm': '0.875rem',
  'text-xs': '0.75rem',
  'text-meta': '0.6875rem',
}

describe('the type scale', () => {
  it('is the spec’s table, in fixed sizes', () => {
    for (const [name, size] of Object.entries(SCALE)) expect(tokens.get(name), name).toBe(size)
    expect(tokens.get('tracking-meta')).toBe('0.12em')
  })

  it('keeps each step above the one below it', () => {
    const sizes = Object.values(SCALE).map((size) => Number.parseFloat(size))
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a))
  })

  it('sets the line height once, in .display, and gives forced colours a full line', () => {
    const display = ruleBody(components, '.display')
    expect(display).toMatch(/line-height:\s*var\(--lh-display\)/)
    expect(display).toMatch(/font-family:\s*var\(--font-mono\)/)
    expect(display).toMatch(/font-size:\s*var\(--display-1\)/)
    expect(display).toMatch(/font-weight:\s*500/)
    const forced = /@media \(forced-colors: active\) \{[^@]*?\.display \{([^}]*)\}/.exec(components)
    expect(forced?.[1]).toMatch(/line-height:\s*1;/)
  })

  it('leaves no fluid clamp in a font size outside the tokens', () => {
    const found = rules.filter(({ body }) => /font-size:\s*clamp\(/.test(body))
    expect(found.map(({ sheet, selectors }) => `${sheet} ${selectors.join(',')}`)).toEqual([])
  })

  it('keeps a size that bypasses the tokens from spreading', () => {
    // A font shorthand sets a size too; inherit and a var() set none. Inline sizes in TSX come from the
    // chart axis helpers (rem or measured), so they are out of scope here.
    const sizes = rules.flatMap(({ body }) => [
      ...[...body.matchAll(/font-size:\s*([^;]+);/g)].map((match) => match[1] ?? ''),
      ...[...body.matchAll(/(?:^|[;\s])font:\s*([^;]+);/g)]
        .map((match) => match[1] ?? '')
        .filter((value) => !/^inherit$/.test(value)),
    ])
    const raw = sizes.filter((value) => !/^(var\(--|inherit|0$)/.test(value))
    // The rest are chart marks, the figures that wait on the page PRs, and standalone pages.
    expect(raw.length).toBeLessThanOrEqual(RAW_SIZES_NOW)
  })
})

/** Font sizes that bypass the type tokens. The count may only fall; a page PR that moves a sheet lowers it. */
const RAW_SIZES_NOW = 16

describe('the three faces', () => {
  it('are a serif, a mono and a sans, each with its own token', () => {
    expect(tokens.get('font-serif')).toMatch(/^'newsreader', georgia, serif$/)
    expect(tokens.get('font-mono')).toMatch(/^'ibm plex mono', ui-monospace, monospace$/)
    expect(tokens.get('font-sans')).toMatch(/^system-ui,/)
  })

  it('set the body in the serif at the prose size, and controls in the sans', () => {
    expect(ruleBody(base, ':root')).toMatch(/font-family:\s*var\(--font-serif\)/)
    expect(ruleBody(base, 'body')).toMatch(/font-size:\s*var\(--text-md\)/)
    expect(ruleBody(base, 'button,\ninput,\nselect')).toMatch(/font-family:\s*var\(--font-sans\)/)
  })

  it('give .num and .meta the mono, and .meta the metadata size, upper case and tracking', () => {
    expect(ruleBody(base, '.num')).toMatch(/font-family:\s*var\(--font-mono\)/)
    expect(ruleBody(base, '.num')).toMatch(/tabular-nums/)
    const meta = ruleBody(base, '.meta')
    expect(meta).toMatch(/font-family:\s*var\(--font-mono\)/)
    expect(meta).toMatch(/font-size:\s*var\(--text-meta\)/)
    expect(meta).toMatch(/letter-spacing:\s*var\(--tracking-meta\)/)
    expect(meta).toMatch(/text-transform:\s*uppercase/)
    expect(meta).toMatch(/color:\s*var\(--ink-secondary\)/)
  })

  it('name no other family than the three tokens, but the Google button’s own', () => {
    const own = new Set(['GoogleSignInButton.css', 'privacy.css'])
    const other = rules
      .filter(({ sheet }) => !own.has(sheet))
      .flatMap(({ sheet, body }) =>
        [...body.matchAll(/font-family:\s*([^;]+);/g)]
          .map((match) => (match[1] ?? '').trim())
          .filter((family) => !/^var\(--font-(serif|mono|sans|display)\)$/.test(family))
          .map((family) => `${sheet}: ${family}`),
      )
    expect(other).toEqual([])
  })
})

describe('the font weights', () => {
  it('stop at 500 in the base sheets, the display figure and the headings', () => {
    expect(base).not.toMatch(HEAVY)
    expect(ruleBody(base, 'h1,\nh2,\nh3')).toMatch(/font-weight:\s*500/)
    expect(ruleBody(components, '.display')).not.toMatch(HEAVY)
  })

  it('ratchets the page sheets that still ask for more, since the faces load 400 and 500', () => {
    const heavy = rules.filter(({ body }) => HEAVY.test(body))
    expect(heavy.length).toBeLessThanOrEqual(HEAVY_WEIGHTS_NOW)
  })
})

/** Rules that still ask for a weight above 500, in sheets that wait on their page PR. The count may only fall. */
const HEAVY_WEIGHTS_NOW = 33
