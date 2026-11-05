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

/** The card is drawn on its paper canvas, and its track, badge and dot sit on the surface. */
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
