import { describe, expect, it } from 'vitest'
import { readStylesheet } from '../ui/components/stylesheet'
import { contrast, over } from './contrastMath'

const tokensCss = await readStylesheet(import.meta.url, './tokens.css')
const designMd = await readStylesheet(import.meta.url, '../../../../docs/DESIGN.md')

/** The level tokens in the block after `marker`, as name to value, in the order written. */
function levels(marker: string): Map<string, string> {
  const start = tokensCss.indexOf(marker, tokensCss.indexOf('Level bands'))
  const body = tokensCss.slice(tokensCss.indexOf('{', start) + 1, tokensCss.indexOf('}', start))
  return new Map(
    [...body.matchAll(/--(level-\d)\s*:\s*(#[0-9a-f]{8});/g)].map(([, name = '', value = '']) => [
      name,
      value,
    ]),
  )
}

const light = levels(':root {')
const dark = levels(":root:not([data-theme='light']) {")
const CARD = { light: '#ffffff', dark: '#171a20' }
const INK = { light: '#0e1116', dark: '#eef0f3' }
const NAMES = ['level-1', 'level-2', 'level-3', 'level-4', 'level-5']

/** The designed table's rows under the Level bands heading, as name to light and dark. */
function table(): Map<string, [string, string]> {
  const section = designMd.slice(designMd.indexOf('## Level bands'))
  return new Map(
    [
      ...section.matchAll(/^\|\s*`--(level-\d)`\s*\|\s*`(#[0-9a-f]{8})`\s*\|\s*`(#[0-9a-f]{8})`/gm),
    ].map(([, name = '', a = '', b = '']) => [name, [a, b]]),
  )
}

describe('level band tokens', () => {
  it('has all five, in a block of their own, in both schemes', () => {
    expect([...light.keys()]).toEqual(NAMES)
    expect([...dark.keys()]).toEqual(NAMES)
  })

  it('matches the table in docs/DESIGN.md, under its own heading and outside the colour table', () => {
    const rows = table()
    expect([...rows.keys()]).toEqual(NAMES)
    for (const name of NAMES) expect(rows.get(name)).toEqual([light.get(name), dark.get(name)])
    const colour = designMd.slice(designMd.indexOf('## Colour'), designMd.indexOf('## Type'))
    expect(colour).not.toContain('--level-')
  })

  it.each([
    ['light', light, CARD.light, INK.light],
    ['dark', dark, CARD.dark, INK.dark],
  ] as const)(
    '%s: each band is a deeper wash than the one below, and is the ink',
    (_scheme, tokens, card, ink) => {
      let last = 1
      for (const name of NAMES) {
        const value = tokens.get(name) ?? ''
        expect(value.slice(1, 7), `${name} is the ink`).toBe(ink.slice(1))
        const ratio = contrast(over(value, card), card)
        expect(ratio, `${name} steps up`).toBeGreaterThan(last)
        last = ratio
      }
    },
  )

  it.each([
    ['light', light, CARD.light],
    ['dark', dark, CARD.dark],
  ] as const)(
    '%s: neighbouring bands differ enough to tell apart, and World reads against the card',
    (_scheme, tokens, card) => {
      const painted = NAMES.map((name) => over(tokens.get(name) ?? '', card))
      for (let i = 1; i < painted.length; i += 1) {
        expect(contrast(painted[i]!, painted[i - 1]!)).toBeGreaterThanOrEqual(1.03)
      }
      expect(contrast(painted[4]!, card)).toBeGreaterThanOrEqual(1.1)
    },
  )

  it.each([
    ['light', light, CARD.light, '#474f5c', '#5f6774'],
    ['dark', dark, CARD.dark, '#b6bcc6', '#8d95a2'],
  ] as const)(
    '%s: the text on the bands reaches 4.5:1 on the darkest one, and the tick labels on the card',
    (_scheme, tokens, card, secondary, muted) => {
      const world = over(tokens.get('level-5') ?? '', card)
      // Band names, grade lines, range ends and the gap's note are secondary text, drawn over the bands.
      expect(contrast(secondary, world)).toBeGreaterThanOrEqual(4.5)
      // The tick labels sit under the plot, on the card, in the muted colour.
      expect(contrast(muted, card)).toBeGreaterThanOrEqual(4.5)
    },
  )
})
