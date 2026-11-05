import { describe, expect, it } from 'vitest'
import { readStylesheet } from '../ui/components/stylesheet'
import { contrast, over } from './contrastMath'

const tokensCss = await readStylesheet(import.meta.url, './tokens.css')
const designMd = await readStylesheet(import.meta.url, '../../../../docs/DESIGN.md')
const systemMd = await readStylesheet(import.meta.url, '../../../../docs/design/system.md')

/** The level tokens in the block after the Level bands comment, as name to value, in the order written. */
function levels(): Map<string, string> {
  const start = tokensCss.indexOf(':root {', tokensCss.indexOf('Level bands'))
  const body = tokensCss.slice(tokensCss.indexOf('{', start) + 1, tokensCss.indexOf('}', start))
  return new Map(
    [...body.matchAll(/--(level-\d)\s*:\s*(#[0-9a-f]{8});/g)].map(([, name = '', value = '']) => [
      name,
      value,
    ]),
  )
}

const bands = levels()
const PAPER = '#fbfaf8'
const INK = '#0a0a0a'
const NAMES = ['level-1', 'level-2', 'level-3', 'level-4', 'level-5']

/** The designed table's rows under the Level bands heading, as name to value. */
function table(): Map<string, string> {
  const section = designMd.slice(designMd.indexOf('## Level bands'))
  return new Map(
    [...section.matchAll(/^\|\s*`--(level-\d)`\s*\|\s*`(#[0-9a-f]{8})`/gm)].map(
      ([, name = '', value = '']) => [name, value],
    ),
  )
}

describe('level band tokens', () => {
  it('has all five, in a block of their own', () => {
    expect([...bands.keys()]).toEqual(NAMES)
  })

  it('matches the table in docs/DESIGN.md, under its own heading and outside the colour table', () => {
    expect(table()).toEqual(bands)
    const colour = systemMd.slice(systemMd.indexOf('## Colour'), systemMd.indexOf('## Type'))
    expect(colour).not.toContain('--level-')
  })

  it('makes each band a deeper wash than the one below, and is the ink', () => {
    let last = 1
    for (const name of NAMES) {
      const value = bands.get(name) ?? ''
      expect(value.slice(1, 7), `${name} is the ink`).toBe(INK.slice(1))
      const ratio = contrast(over(value, PAPER), PAPER)
      expect(ratio, `${name} steps up`).toBeGreaterThan(last)
      last = ratio
    }
  })

  it('tells neighbouring bands apart, and World reads against the paper', () => {
    const painted = NAMES.map((name) => over(bands.get(name) ?? '', PAPER))
    for (let i = 1; i < painted.length; i += 1) {
      expect(contrast(painted[i]!, painted[i - 1]!)).toBeGreaterThanOrEqual(1.025)
    }
    expect(contrast(painted[4]!, PAPER)).toBeGreaterThanOrEqual(1.1)
  })

  it('reaches 4.5:1 for the secondary text on the darkest band, and the tick labels on the paper', () => {
    const world = over(bands.get('level-5') ?? '', PAPER)
    // Band names, grade lines, range ends and the gap's note are secondary text, drawn over the bands.
    expect(contrast('#6b6660', world)).toBeGreaterThanOrEqual(4.5)
    expect(contrast('#6b6660', PAPER)).toBeGreaterThanOrEqual(4.5)
  })
})
