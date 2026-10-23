import { describe, expect, it } from 'vitest'
import { readStylesheet } from '../ui/components/stylesheet'
import { CARD_COLORS, CARD_TOKEN, type CardColor } from './cardColors'

const tokensCss = await readStylesheet(import.meta.url, '../styles/tokens.css')

/** The custom properties of the dark theme in tokens.css, by name, in lower case. */
function darkTokens(): Map<string, string> {
  const start = tokensCss.indexOf(":root:not([data-theme='light']) {")
  if (start < 0) throw new Error('no dark theme block in tokens.css')
  const body = tokensCss.slice(tokensCss.indexOf('{', start) + 1, tokensCss.indexOf('}', start))
  const tokens = new Map<string, string>()
  for (const match of body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    const [, name, value] = match
    if (name !== undefined && value !== undefined) tokens.set(name, value.trim().toLowerCase())
  }
  return tokens
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
