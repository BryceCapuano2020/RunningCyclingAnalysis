import { describe, expect, it } from 'vitest'
import { LANDING_MIN_LEAD_POINTS, computeLandingFigures } from '../../scripts/landingFigures'
import { LANDING_EXAMPLE } from './landingExample'
import { cardStamp, fillLandingOg, ogAlt, type CardInk } from './landingFigures'

const INK: CardInk = {
  paper: '#000001',
  hairline: '#000002',
  rule: '#000003',
  ink: '#000004',
  secondary: '#000005',
  run: '#000006',
  ride: '#000007',
  lift: '#000008',
  control: '#000009',
}

describe('the landing figures', () => {
  it('are what the build-time plugin made from the sample, the same as computing them again', () => {
    expect(LANDING_EXAMPLE).toEqual(computeLandingFigures())
  })

  it('say which sport leads and name a level for each', () => {
    expect(LANDING_EXAMPLE.gap.lean).toMatch(/^(run|ride)$/)
    // The centre leans clearly; the range beside it may cross zero, as any athlete's may.
    expect(Math.abs(LANDING_EXAMPLE.gap.centre)).toBeGreaterThanOrEqual(LANDING_MIN_LEAD_POINTS)
    expect(LANDING_EXAMPLE.grades.run.centre.level).not.toBe('')
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
  it('moves with a figure the card draws and with a colour', () => {
    const base = cardStamp(LANDING_EXAMPLE, INK)
    expect(base).toMatch(/^[0-9a-f]{14}$/)
    expect(cardStamp(LANDING_EXAMPLE, INK)).toBe(base)
    const gap = { ...LANDING_EXAMPLE.gap, centre: LANDING_EXAMPLE.gap.centre - 1 }
    expect(cardStamp({ ...LANDING_EXAMPLE, gap }, INK)).not.toBe(base)
    expect(cardStamp(LANDING_EXAMPLE, { ...INK, run: '#00000a' })).not.toBe(base)
  })
})
