import { describe, expect, it } from 'vitest'
import { readStylesheet } from '../ui/components/stylesheet'
import { readStylesheetsUnder } from '../ui/components/stylesheet'

const sheets = await readStylesheetsUnder(import.meta.url, '../')
const tokensCss = await readStylesheet(import.meta.url, './tokens.css')

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
