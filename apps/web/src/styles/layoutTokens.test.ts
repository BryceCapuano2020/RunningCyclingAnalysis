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
  'components.css',
  'GradeProfileSection.css',
  'ExportGuides.css',
  'FitnessCard.css',
  'HowThisWorks.css',
  'MethodPage.css',
  'TopicBody.css',
  'ProfilePage.css',
  'privacy.css',
]

/**
 * Sheets that still cap prose in ch, because another package holds them (Balance, SportHero, the chart
 * sheets). Move each to --measure when its owner merges, and delete it here; the list may only shrink.
 */
const PENDING_CH_CAPS = ['ChartAbout.css', 'ChartFrame.css', 'ChartHeadings.css']

describe('the layout tokens', () => {
  it('give one shell width, one rail, one reading measure, two gaps and one radius', () => {
    expect(tokens.get('page-width')).toBe('75rem')
    expect(tokens.get('rail-width')).toBe('12rem')
    expect(tokens.get('measure')).toBe('36rem')
    expect(tokens.get('radius')).toBe('8px')
    expect(tokens.get('section-gap')).toBe('var(--space-7)')
    expect(tokens.get('stack-gap')).toBe('var(--space-5)')
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

  it('leave no ch cap on a sheet that is not waiting on another package', () => {
    const capped = sheets
      .filter(({ css }) => /max-width:\s*\d+ch/.test(css))
      .map(({ path }) => path.split('/').pop())
    expect(capped.sort()).toEqual([...PENDING_CH_CAPS].sort())
  })

  it('have no shadow: no shadow token, and no sheet blurs one', () => {
    expect([...tokens.keys()].filter((name) => name.includes('shadow'))).toEqual([])
    for (const { path, css } of sheets) {
      // A ring is a shadow with no offset or blur; anything with a blur radius is a lift.
      expect(css, path).not.toMatch(/box-shadow:\s*(inset\s+)?-?\d+(px)?\s+-?\d+(px)?\s+[1-9]\d*px/)
    }
  })

  it('draw a band as a 1 px rule across the top, with no box, and let each section reuse it', () => {
    const band = ruleBody(sheet('components.css'), '.band')
    expect(band).toMatch(/border-top:\s*1px solid var\(--rule\)/)
    expect(band).not.toMatch(/box-shadow|border-radius|background/)
    // The hero and the fitness card carry the band's class, so their own rules add no edge.
    for (const [name, selector] of [
      ['SportHero.css', '.sport-hero'],
      ['FitnessCard.css', '.fitness-card'],
    ] as const) {
      expect(ruleBody(sheet(name), selector), name).not.toMatch(
        /box-shadow|border-radius|background|border-top/,
      )
    }
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
const RAW_RADII_NOW = 16

/** Pages that link one stylesheet and not tokens.css, so every custom property they read is their own. */
const STANDALONE = [{ page: '../../privacy.html', sheet: 'privacy.css' }]

describe('a standalone stylesheet', () => {
  it.each(STANDALONE)(
    '$sheet defines every custom property it reads',
    async ({ page, sheet: name }) => {
      expect(await readStylesheet(import.meta.url, page)).toContain(`/${name}"`)
      const css = sheet(name)
      const read = [...css.matchAll(/var\(--([a-z0-9-]+)\s*[,)]/g)].map((match) => match[1])
      const defined = new Set([...css.matchAll(/--([a-z0-9-]+)\s*:/g)].map((match) => match[1]))
      expect(read.filter((token) => !defined.has(token ?? ''))).toEqual([])
    },
  )
})
