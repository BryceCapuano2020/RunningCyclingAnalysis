import { describe, expect, it } from 'vitest'
import { readStylesheet } from '../ui/components/stylesheet'
import { CARD_COLORS, CARD_TOKEN, type CardColor } from './cardColors'
import { contrast } from '../styles/contrastMath'

const tokensCss = await readStylesheet(import.meta.url, '../styles/tokens.css')

/** The custom properties declared in the block that opens with the given selector, by name. */
function blockTokens(selector: string): Map<string, string> {
  const start = tokensCss.indexOf(selector)
  if (start < 0) throw new Error(`no ${selector} block in tokens.css`)
  const body = tokensCss.slice(tokensCss.indexOf('{', start) + 1, tokensCss.indexOf('}', start))
  const tokens = new Map<string, string>()
  for (const match of body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    const [, name, value] = match
    if (name !== undefined && value !== undefined) tokens.set(name, value.trim().toLowerCase())
  }
  return tokens
}

/**
 * The custom properties in effect in the dark theme, by name, in lower case. The dark block
 * overrides the light root, and a value that names another token, such as var(--brand), takes that
 * token's value, as the browser does.
 */
function darkTokens(): Map<string, string> {
  const merged = new Map([
    ...blockTokens(':root {'),
    ...blockTokens(":root:not([data-theme='light']) {"),
  ])
  for (const [name, value] of merged) {
    const reference = /^var\(--([a-z0-9-]+)\)$/.exec(value)
    const resolved = reference?.[1] === undefined ? undefined : merged.get(reference[1])
    if (resolved !== undefined) merged.set(name, resolved)
  }
  return merged
}

describe('share card colours', () => {
  const dark = darkTokens()

  it('names a token for every colour', () => {
    expect(Object.keys(CARD_TOKEN).sort()).toEqual(Object.keys(CARD_COLORS).sort())
  })

  it.each(Object.keys(CARD_TOKEN) as CardColor[])(
    '%s is the dark value of its token in tokens.css',
    (name) => {
      const token = CARD_TOKEN[name]
      expect(dark.has(token)).toBe(true)
      expect(CARD_COLORS[name]).toBe(dark.get(token))
    },
  )
})

/** The card is drawn on its ink canvas, and its track, badge and dot sit on the surface. */
const CANVAS = CARD_COLORS.ink
const TEXT_MIN = 4.5
const MARK_MIN = 3

describe('share card contrast', () => {
  it.each(['text', 'secondary', 'muted', 'brand'] as const)(
    'draws %s text at 4.5:1 or better on the canvas',
    (name) => {
      expect(contrast(CARD_COLORS[name], CANVAS)).toBeGreaterThanOrEqual(TEXT_MIN)
    },
  )

  it.each(['run', 'ride', 'neutralMark'] as const)(
    'draws the %s meter mark at 3:1 or better on the track it sits on',
    (name) => {
      expect(contrast(CARD_COLORS[name], CARD_COLORS.surface)).toBeGreaterThanOrEqual(MARK_MIN)
    },
  )

  it('outlines the track in muted ink at 3:1 or better on the canvas', () => {
    expect(contrast(CARD_COLORS.muted, CANVAS)).toBeGreaterThanOrEqual(MARK_MIN)
  })
})
