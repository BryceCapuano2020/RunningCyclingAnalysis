import { describe, expect, it } from 'vitest'
import { readStylesheet } from '../ui/components/stylesheet'
import { CARD_COLORS, CARD_TOKEN, type CardColor } from './cardColors'
import { contrast } from '../styles/contrastMath'
import { declared, resolved } from '../styles/tokenSheet'

const tokensCss = await readStylesheet(import.meta.url, '../styles/tokens.css')

describe('share card colours', () => {
  const paper = resolved(declared(tokensCss, ':root'))

  it('names a token for every colour', () => {
    expect(Object.keys(CARD_TOKEN).sort()).toEqual(Object.keys(CARD_COLORS).sort())
  })

  it.each(Object.keys(CARD_TOKEN) as CardColor[])(
    '%s is the value of its token in tokens.css',
    (name) => {
      const token = CARD_TOKEN[name]
      expect(paper.has(token)).toBe(true)
      expect(CARD_COLORS[name]).toBe(paper.get(token))
    },
  )
})

/** Every word and figure is drawn on the paper canvas. */
const TEXT_MIN = 4.5

describe('share card contrast', () => {
  it.each(['ink', 'secondary', 'run', 'ride', 'lift'] as const)(
    'draws %s text at 4.5:1 or better on the paper',
    (name) => {
      expect(contrast(CARD_COLORS[name], CARD_COLORS.paper)).toBeGreaterThanOrEqual(TEXT_MIN)
    },
  )
})
