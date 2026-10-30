import { describe, expect, it } from 'vitest'
import { readStylesheet, readStylesheetsUnder, ruleBody } from '../ui/components/stylesheet'
import { declared } from './tokenSheet'

const tokens = declared(await readStylesheet(import.meta.url, './tokens.css'), ':root')
const sheets = await readStylesheetsUnder(import.meta.url, '../')
const sheet = (name: string) => {
  const found = sheets.find(({ path }) => path.endsWith(name))
  if (found === undefined) throw new Error(`no ${name}`)
  return found.css
}

/** Rules in these sheets cap prose, so they read the one measure (D10 section 2). */
const PROSE_SHEETS = [
  'App.css',
  'ExportGuides.css',
  'FitnessCard.css',
  'CalculatedSection.css',
  'MethodPage.css',
  'Methodology.css',
  'ProfilePage.css',
  'privacy.css',
]

/** Sheets that still read --shadow: cards until the de-box PR, and Balance and chart sheets waiting on other work. */
const SHADOW_HOLDERS = [
  'BalanceChanges.css',
  'BalancePage.css',
  'ChartFrame.css',
  'ChartTooltip.css',
  'FitnessCard.css',
  'SportHero.css',
  'StatTile.css',
]

describe('the layout tokens', () => {
  it('give one shell width, one reading measure, two gaps and the radius and shadow names', () => {
    expect(tokens.get('page-width')).toBe('75rem')
    expect(tokens.get('measure')).toBe('28.5rem')
    expect(tokens.get('section-gap')).toBe('var(--space-7)')
    expect(tokens.get('stack-gap')).toBe('var(--space-5)')
    expect(tokens.get('radius-pill')).toBe('999px')
    expect(tokens.has('shadow-pop')).toBe(true)
  })

  it('size the header, the tabs and every page from the one shell width', () => {
    expect(ruleBody(sheet('components.css'), '.page')).toMatch(/max-width:\s*var\(--page-width\)/)
    for (const { path, css } of sheets) {
      expect(css, path).not.toMatch(/max-width:\s*(1080|1200)px/)
      expect(css, path).not.toMatch(/\.page:has\(\.sport-page\)/)
    }
  })

  it('cap prose at the measure, not at a character count', () => {
    for (const name of PROSE_SHEETS) {
      const css = sheet(name)
      expect(css, name).toMatch(/max-width:\s*var\(--measure\)/)
      expect(css, name).not.toMatch(/max-width:\s*(5[0-9]|6[0-9])ch/)
    }
  })

  it('keep the popover shadow for popovers, and the old name from spreading', () => {
    for (const name of [
      'Definition.css',
      'AccountMenu.css',
      'SetupDialog.css',
      'ConfirmDialog.css',
    ]) {
      expect(sheet(name), name).toMatch(/box-shadow:\s*var\(--shadow-pop\)/)
    }
    const holders = sheets
      .filter(({ css }) => css.includes('var(--shadow)'))
      .map(({ path }) => path.split('/').pop())
    // Cards still lift until the de-box PR, and the Balance and chart sheets wait on other work.
    expect(holders.sort()).toEqual([...SHADOW_HOLDERS].sort())
  })

  it('send the raw corner radii through the tokens, and let the count only fall', () => {
    const raw = sheets.flatMap(({ css }) =>
      [...css.matchAll(/border-radius:\s*([^;]+);/g)]
        .map((match) => match[1] ?? '')
        .filter((value) => /\d(px|rem|em)\b/.test(value) && !/var\(|calc\(/.test(value)),
    )
    // Small marks and chart bars (1 to 3 px) and the glyph's em radius keep their own values.
    expect(raw.length).toBeLessThanOrEqual(RAW_RADII_NOW)
  })
})

/** Raw radii left in the sheets: from 35, the rest are small marks, chart bars and sheets that wait on other work. */
const RAW_RADII_NOW = 19
