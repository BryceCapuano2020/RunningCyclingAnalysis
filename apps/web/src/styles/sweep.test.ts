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

/**
 * Each rule as its selector list and its declarations, with comments and @import statements removed,
 * so an import above a rule is not read as part of its selector.
 */
function rulesOf(css: string): [selectors: string, body: string][] {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@import[^;]*;/g, '')
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

  it('gates each short-height query to a phone or a touch screen, so a short desktop window keeps its layout', () => {
    // A query is gated when it asks for a finger (pointer: coarse) or a phone-width window (max-width).
    const gated = (query: string): boolean => {
      const widths = [...query.matchAll(/max-width:\s*(\d+)px/g)].map(([, px = '']) => Number(px))
      return /pointer:\s*coarse/.test(query) || widths.some((px) => px <= 760)
    }
    const ungated = sheets.flatMap(({ path, css }) =>
      [...css.matchAll(/@media\s+([^{]*max-height:\s*700px[^{]*)\{/g)]
        .map(([, query = '']) => query.trim())
        .filter((query) => !gated(query))
        .map((query) => `${path}: @media ${query}`),
    )
    expect(ungated).toEqual([])
  })
})

/*
 * Sport colour. A surface of one sport reads --sport-colour and --sport-colour-soft, which tokens.css
 * sets once for each data-sport. A rule that draws both sports at once names the series tokens, and
 * only the selectors listed here do: each is drawn on a surface that shows both sports. A new rule
 * that names a series token for one sport fails, even in a file listed here, and so does a series
 * token in TypeScript, where a style prop could paint text. No sport hex is written outside tokens.css,
 * except in the copies that cannot read it: the share card (always dark, pinned by cardColors.test.ts),
 * the static privacy page (pinned by tokens.test.ts) and the favicon, an SVG file.
 */
const BOTH_SPORTS: Record<string, readonly string[]> = {
  // Both ends of one meter: its band and its dot take the colour of the sport the lean names.
  'ui/components/BalanceMeter.css': [
    '.balance-meter--run .balance-meter__band',
    '.balance-meter--ride .balance-meter__band',
    '.balance-meter--run .balance-meter__dot',
    '.balance-meter--ride .balance-meter__dot',
  ],
  // The brand mark draws both sport strokes.
  'ui/components/icons.css': ['.brand-mark__run', '.brand-mark__ride'],
  // Balance's shared trend and Method's curves draw both sports on one plot.
  'ui/charts/ChartSeries.css': [
    '.chart-series__line--run',
    '.chart-series__line--ride',
    '.chart-series__band--ride',
    '.chart-series__ring--ride',
    '.chart-series__marker--run',
    '.chart-series__marker--ride',
  ],
  // The shared legend and tooltip keys, which those charts and Method's heart-rate check draw for both.
  'ui/charts/ChartTooltip.css': [
    '.chart-tooltip__key--run',
    '.chart-tooltip__key--ride',
    '.chart-tooltip__key--dashed-run',
    '.chart-tooltip__key--dashed-ride',
  ],
  'ui/charts/ChartLegend.css': [
    '.swatch-run',
    '.swatch-ride',
    '.chart-legend__key--run',
    '.chart-legend__key--ride',
    '.chart-legend__key--dashed-run',
    '.chart-legend__key--dashed-ride',
  ],
  // Method's heart-rate check: a run fit and dots always, a ride fit and dots when the weight is known.
  'ui/charts/HrScatter.css': [
    '.hr-scatter__fit--run',
    '.hr-scatter__fit--ride',
    '.hr-scatter__dot--run',
    '.hr-scatter__dot--ride',
  ],
  // Method's ratio chart: the run and ride higher-share bands.
  'ui/charts/RatioChart.css': ['.ratio-chart__higher--run', '.ratio-chart__higher--ride'],
  // The static privacy page keeps its own copy of the two sport colours, in its root blocks, and draws
  // the brand mark's two strokes.
  'styles/privacy.css': [
    ':root',
    ":root:not([data-theme='light'])",
    '.brand-mark__run',
    '.brand-mark__ride',
  ],
}
/** The static privacy page's stylesheet copies the token values, and tokens.test.ts keeps them equal. */
const PRIVACY_PAGE = 'styles/privacy.css'
const HEX_COPIES = ['share/cardColors.ts', PRIVACY_PAGE, 'favicon.svg']
const SERIES_TOKEN = /--series-(?:run|ride|swim)(?:-soft)?\b/
/**
 * A series token in TypeScript: a literal name, a var() whose name is built at run time, or a token
 * name built from a sport. A class such as `chart-series__area--${sport}` is not a token, so it passes.
 */
const SERIES_SOURCE = /--series-(?:run|ride|swim)(?:-soft)?\b|var\(--\$\{|--series-\$\{/
const SPORT_HEX = /#(?:e5304f|f0435f|2f56e8|4d6ef5|0f9fb0|14a0b0)(?:[0-9a-f]{2})?\b/i

/** Each selector, from a stylesheet's rules, whose declarations name a series colour token. */
function seriesSelectorsOf(css: string): string[] {
  return rulesOf(css)
    .filter(([, body]) => SERIES_TOKEN.test(body))
    .flatMap(([selectors]) => selectors.split(',').map((selector) => selector.trim()))
}

describe('sport colour', () => {
  it('names a series colour token only in tokens.css and in the selectors that draw both sports', () => {
    const styleOffenders = sheets
      .filter(({ path }) => path !== 'styles/tokens.css')
      .flatMap(({ path, css }) => {
        const allowed = BOTH_SPORTS[path] ?? []
        return seriesSelectorsOf(css)
          .filter((selector) => !allowed.includes(selector))
          .map((selector) => `${path}: ${selector}`)
      })
    const sourceOffenders = sources
      .filter(({ text }) => SERIES_SOURCE.test(text))
      .map(({ path }) => path)
    expect([...styleOffenders, ...sourceOffenders]).toEqual([])
  })

  it('lists only selectors that still name a series colour token, so the list cannot outlive its rule', () => {
    const stale = Object.entries(BOTH_SPORTS).flatMap(([path, selectors]) => {
      const named = seriesSelectorsOf(sheets.find((sheet) => sheet.path === path)?.css ?? '')
      return selectors
        .filter((selector) => !named.includes(selector))
        .map((selector) => `${path}: ${selector}`)
    })
    expect(stale).toEqual([])
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

  it('sets --sport-colour and --sport-colour-soft once for each sport, in tokens.css, from its series token', () => {
    for (const sport of ['run', 'ride'] as const) {
      const tokens = declarations(tokensCss, `[data-sport='${sport}']`)
      expect(tokens.get('--sport-colour')).toBe(`var(--series-${sport})`)
      expect(tokens.get('--sport-colour-soft')).toBe(`var(--series-${sport}-soft)`)
    }
    const declaring = sheets
      .filter(({ css }) => /--sport-colour(?:-soft)?\s*:/.test(css))
      .map(({ path }) => path)
    expect(declaring).toEqual(['styles/tokens.css'])
  })

  it('fills the ride area with its sport colour, read from data-sport, not a series token', () => {
    const chartSeries = sheets.find(({ path }) => path === 'ui/charts/ChartSeries.css')?.css ?? ''
    expect(declarations(chartSeries, '.chart-series__area--ride').get('fill')).toBe(
      'var(--sport-colour-soft)',
    )
  })
})

/*
 * The planted cases: each pattern must catch what the sweep is meant to stop, and leave alone the
 * class names that only look like a token. Without them a loosened pattern would pass unnoticed.
 */
describe('the series token patterns', () => {
  it('catches the swim token in a stylesheet, as it catches run and ride', () => {
    expect(SERIES_TOKEN.test('color: var(--series-swim);')).toBe(true)
    expect(SERIES_TOKEN.test('background: var(--series-swim-soft);')).toBe(true)
  })

  it('catches a variable name built in a template literal, in a style or a token name', () => {
    expect(SERIES_SOURCE.test('style={{ color: `var(--${token})` }}')).toBe(true)
    expect(SERIES_SOURCE.test('const name = `--series-${sport}`')).toBe(true)
  })

  it('leaves a class name with a sport suffix alone', () => {
    expect(
      SERIES_SOURCE.test('className={`chart-series__area chart-series__area--${sport}`}'),
    ).toBe(false)
  })
})
