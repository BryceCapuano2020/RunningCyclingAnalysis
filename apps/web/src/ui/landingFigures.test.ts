import { describe, expect, it } from 'vitest'
import { computeLandingFigures } from '../../scripts/landingFigures'
import { LANDING_EXAMPLE } from './landingExample'
import { cardStamp, fillLandingOg, ogAlt, type CardInk } from './landingFigures'

const INK: CardInk = {
  surface0: '#000001',
  surface1: '#000002',
  border: '#000003',
  text: '#000004',
  secondary: '#000005',
  muted: '#000006',
  run: '#000007',
  ride: '#000008',
  brand: '#000009',
}

describe('the landing figures', () => {
  it('are what the build-time plugin made from the sample, the same as computing them again', () => {
    expect(LANDING_EXAMPLE).toEqual(computeLandingFigures())
  })

  it('say which sport leads and name a level for each, with the slip the example describes', () => {
    expect(LANDING_EXAMPLE.gap.lean).toMatch(/^(run|ride)$/)
    expect(LANDING_EXAMPLE.gap.low > 0 || LANDING_EXAMPLE.gap.high < 0).toBe(true)
    expect(LANDING_EXAMPLE.grades.run.centre.level).not.toBe('')
    expect(LANDING_EXAMPLE.fitness.change.high).toBeLessThan(0)
    expect(LANDING_EXAMPLE.fitness.shown.size).toMatch(/^\d+%$/)
  })
})

describe('the share image’s text', () => {
  it('fills each placeholder from the figures and leaves the rest of the page alone', () => {
    const html = '<meta content="%LANDING_OG_ALT%" /><meta content="x" />'
    const filled = fillLandingOg(html, LANDING_EXAMPLE)
    expect(filled).toBe(`<meta content="${ogAlt(LANDING_EXAMPLE)}" /><meta content="x" />`)
  })

  it('names the lean in words and its size as a number of points', () => {
    const gap = { centre: 7, low: 2, high: 12, lean: 'run' as const }
    expect(ogAlt({ ...LANDING_EXAMPLE, gap })).toContain('balance leaning 7 points toward running.')
  })
})

describe('the card stamp', () => {
  it('moves with a figure the card draws and with a colour, and not with the fitness finding', () => {
    const base = cardStamp(LANDING_EXAMPLE, INK)
    expect(base).toMatch(/^[0-9a-f]{14}$/)
    expect(cardStamp(LANDING_EXAMPLE, INK)).toBe(base)
    const gap = { ...LANDING_EXAMPLE.gap, centre: LANDING_EXAMPLE.gap.centre - 1 }
    expect(cardStamp({ ...LANDING_EXAMPLE, gap }, INK)).not.toBe(base)
    expect(cardStamp(LANDING_EXAMPLE, { ...INK, run: '#00000a' })).not.toBe(base)
    const fitness = { ...LANDING_EXAMPLE.fitness, referenceHr: 99 }
    expect(cardStamp({ ...LANDING_EXAMPLE, fitness }, INK)).toBe(base)
  })
})
