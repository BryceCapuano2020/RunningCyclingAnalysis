import { describe, expect, it } from 'vitest'
import { readFilesUnder, readStylesheet, readStylesheetsUnder } from '../ui/components/stylesheet'
import { declarations } from './tokenSheet'

const sheets = await readStylesheetsUnder(import.meta.url, '../')
const tokensCss = await readStylesheet(import.meta.url, './tokens.css')
const sources = (await readFilesUnder(import.meta.url, '../', '.ts'))
  .concat(await readFilesUnder(import.meta.url, '../', '.tsx'))
  .filter(({ path }) => !/\.test\.tsx?$/.test(path))
const publicFiles = [
  { path: 'favicon.svg', text: await readStylesheet(import.meta.url, '../../public/favicon.svg') },
]

/** Each rule as its selector list and its declarations, with comments removed. */
function rulesOf(css: string): [selectors: string, body: string][] {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
  return [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, list = '', body = '']) => [list, body])
}

/** A length as rem, so 16px and 1rem are the same size. Null for anything else, such as an em. */
function remOf(value: string): number | null {
  const match = /^([\d.]+)(rem|px)$/.exec(value.trim())
  if (match === null) return null
  const [, amount = '', unit = ''] = match
  return unit === 'px' ? Number(amount) / 16 : Number(amount)
}

/** The sizes the type tokens define, as rem. */
const TYPE_TOKEN_SIZES = [...tokensCss.matchAll(/--text-[a-z]+:\s*([^;]+);/g)]
  .map(([, value = '']) => remOf(value))
  .filter((size): size is number => size !== null)

/** The font sizes that near-duplicate the type scale: 12.8 to 13.6 px, which read as one size. */
const NEAR_DUPLICATE_SIZE = /font-size:\s*(0\.8rem|0\.8125rem|0\.85rem|13px)\b/

/** The 17 px size the 18 px lead size replaced. It is no token, so the token sweep cannot see it. */
const RETIRED_SIZE_REM = 1.0625

/** Each literal font size in a stylesheet, as its declared value. */
function literalSizesOf(css: string): string[] {
  return rulesOf(css).flatMap(([, body]) =>
    [...body.matchAll(/font-size:\s*([^;]+);/g)].map(([, value = '']) => value.trim()),
  )
}

describe('every stylesheet in the app', () => {
  it('sets sport colour on glyphs and bars only, never on text', () => {
    const offenders = sheets.flatMap(({ path, css }) =>
      rulesOf(css)
        .filter(
          ([selectors, body]) =>
            /(?:^|[\s;])color:\s*var\(--series-(run|ride)\)/.test(body) &&
            !/icon|glyph/.test(selectors),
        )
        .map(([selectors]) => `${path}: ${selectors.trim()}`),
    )
    expect(offenders).toEqual([])
  })

  it('sets no small size outside the type scale', () => {
    const offenders = sheets
      .filter(({ css }) => NEAR_DUPLICATE_SIZE.test(css))
      .map(({ path }) => path)
    expect(offenders).toEqual([])
  })

  it('writes no literal font size that a type token already names', () => {
    const offenders = sheets
      .filter(({ path }) => path !== 'styles/tokens.css')
      .flatMap(({ path, css }) =>
        literalSizesOf(css)
          .filter((value) => {
            const size = remOf(value)
            return size !== null && TYPE_TOKEN_SIZES.some((token) => Math.abs(token - size) < 1e-9)
          })
          .map((value) => `${path}: font-size: ${value}`),
      )
    expect(offenders).toEqual([])
  })

  it('reads the 18 px lead token into the type scale, so its literal is swept', () => {
    expect(TYPE_TOKEN_SIZES).toContain(1.125)
  })

  it('writes no 17 px font size, which the 18 px lead size replaced', () => {
    const offenders = sheets.flatMap(({ path, css }) =>
      literalSizesOf(css)
        .filter((value) => remOf(value) === RETIRED_SIZE_REM)
        .map((value) => `${path}: font-size: ${value}`),
    )
    expect(offenders).toEqual([])
  })
})

/*
 * Sport colour. A surface of one sport reads --sport-colour, which tokens.css sets once for each
 * data-sport. A surface that draws both sports at once names the per-sport tokens, and nothing else
 * names them. No sport hex is written outside tokens.css, except in the copies that cannot read it:
 * the share card (always dark, pinned by cardColors.test.ts), the static privacy page (pinned by
 * tokens.test.ts) and the favicon, an SVG file.
 */
const BOTH_SPORTS = [
  'ui/components/BalanceMeter.css',
  'ui/components/icons.css',
  'ui/charts/ChartSeries.css',
  'ui/charts/ChartTooltip.css',
  'ui/charts/ChartLegend.css',
  'ui/charts/HrScatter.css',
  'ui/charts/RatioChart.css',
]
/** The static privacy page's stylesheet copies the token values, and tokens.test.ts keeps them equal. */
const PRIVACY_PAGE = 'styles/privacy.css'
const HEX_COPIES = ['share/cardColors.ts', PRIVACY_PAGE, 'favicon.svg']
const SERIES_TOKEN = /--series-(?:run|ride)(?:-soft)?\b/
const SPORT_HEX = /#(?:e5304f|f0435f|2f56e8|4d6ef5|0f9fb0|14a0b0)(?:[0-9a-f]{2})?\b/i

describe('sport colour', () => {
  it('names a series colour token only in tokens.css and the surfaces that draw both sports', () => {
    const offenders = sheets
      .filter(
        ({ path, css }) =>
          !['styles/tokens.css', PRIVACY_PAGE, ...BOTH_SPORTS].includes(path) &&
          SERIES_TOKEN.test(css),
      )
      .map(({ path }) => path)
    expect(offenders).toEqual([])
  })

  it('writes no sport hex outside tokens.css and the copies that cannot read it', () => {
    const files = [
      ...sheets.map(({ path, css }) => ({ path, text: css })),
      ...sources.map(({ path, text }) => ({ path, text })),
      ...publicFiles,
    ]
    const offenders = files
      .filter(
        ({ path, text }) =>
          path !== 'styles/tokens.css' && !HEX_COPIES.includes(path) && SPORT_HEX.test(text),
      )
      .map(({ path }) => path)
    expect(offenders).toEqual([])
  })

  it('sets --sport-colour once for each sport, in tokens.css, from that sport’s series token', () => {
    expect(declarations(tokensCss, "[data-sport='run']").get('--sport-colour')).toBe(
      'var(--series-run)',
    )
    expect(declarations(tokensCss, "[data-sport='ride']").get('--sport-colour')).toBe(
      'var(--series-ride)',
    )
    const declaring = sheets
      .filter(({ css }) => /--sport-colour\s*:/.test(css))
      .map(({ path }) => path)
    expect(declaring).toEqual(['styles/tokens.css'])
  })
})
