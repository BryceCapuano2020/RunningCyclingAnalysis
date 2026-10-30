import { describe, expect, it } from 'vitest'
import { readStylesheet, readStylesheetsUnder, ruleBody } from '../ui/components/stylesheet'
import { declared } from './tokenSheet'

const tokens = declared(await readStylesheet(import.meta.url, './tokens.css'), ':root')
const sheets = await readStylesheetsUnder(import.meta.url, '../')
const components = await readStylesheet(import.meta.url, './components.css')

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

const SANS_WEIGHT = /font-weight:\s*(700|800)\b/
const DISPLAY_FAMILY = /font-family:\s*(var\(--font-display\)|'Barlow Condensed')/

describe('the display scale', () => {
  it('has three fluid sizes that cap at 96, 48 and 36 px, and two fixed heading sizes', () => {
    expect(tokens.get('display-1')).toBe('clamp(3.5rem, 2rem + 6vw, 6rem)')
    expect(tokens.get('display-2')).toBe('clamp(2.25rem, 1.5rem + 3vw, 3rem)')
    expect(tokens.get('display-3')).toBe('clamp(1.75rem, 1.4rem + 1.5vw, 2.25rem)')
    expect(tokens.get('title')).toBe('1.5rem')
    expect(tokens.get('heading')).toBe('1.25rem')
    expect(tokens.get('lh-display')).toBe('0.95')
  })

  it('keeps every size above the body size, so no heading is smaller than the text under it', () => {
    for (const name of ['display-1', 'display-2', 'display-3']) {
      const floor = /clamp\((\d+(?:\.\d+)?)rem/.exec(tokens.get(name) ?? '')?.[1]
      expect(Number(floor), name).toBeGreaterThanOrEqual(1.75)
    }
  })

  it('sets the line height once, in .display, and gives forced colours a full line', () => {
    const display = ruleBody(components, '.display')
    expect(display).toMatch(/line-height:\s*var\(--lh-display\)/)
    expect(display).toMatch(/font-family:\s*var\(--font-display\)/)
    expect(display).toMatch(/font-weight:\s*800/)
    const forced = /@media \(forced-colors: active\) \{[^@]*?\.display \{([^}]*)\}/.exec(components)
    expect(forced?.[1]).toMatch(/line-height:\s*1;/)
  })

  it('leaves no fluid clamp in a font size outside the tokens', () => {
    const found = rules.filter(({ body }) => /font-size:\s*clamp\(/.test(body))
    expect(found.map(({ sheet, selectors }) => `${sheet} ${selectors.join(',')}`)).toEqual([])
  })

  it('keeps a size that bypasses the tokens from spreading', () => {
    const raw = rules.flatMap(({ body }) =>
      [...body.matchAll(/font-size:\s*([^;]+);/g)]
        .map((match) => match[1] ?? '')
        .filter((value) => !/^(var\(--|inherit|0$)/.test(value)),
    )
    // The rest are chart marks, the figures that wait on the de-box and Balance PRs, and standalone pages.
    expect(raw.length).toBeLessThanOrEqual(RAW_SIZES_NOW)
  })
})

/** Font sizes that bypass the type tokens: from 53 before the display scale. The count may only fall. */
const RAW_SIZES_NOW = 28

describe('the font weights', () => {
  it('request 700 or 800 only where the condensed face is set, since the sans face loads 400 to 600', () => {
    const display = new Map<string, Set<string>>()
    for (const { sheet, selectors, body } of rules) {
      if (!DISPLAY_FAMILY.test(body)) continue
      const known = display.get(sheet) ?? new Set<string>()
      for (const selector of selectors) known.add(selector)
      display.set(sheet, known)
    }
    const heavy = rules
      .filter(({ body }) => SANS_WEIGHT.test(body))
      .filter(
        ({ sheet, selectors, body }) =>
          !DISPLAY_FAMILY.test(body) &&
          !selectors.every((selector) => display.get(sheet)?.has(selector) === true),
      )
    expect(heavy.map(({ sheet, selectors }) => `${sheet} ${selectors.join(',')}`)).toEqual([])
  })
})
