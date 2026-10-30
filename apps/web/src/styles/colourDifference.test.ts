import { describe, expect, it } from 'vitest'
import { deltaE, deltaELab, oklch, simulate } from './colourDifference'

/**
 * Sharma, Wu and Dalal (2005), "The CIEDE2000 color-difference formula: implementation notes, supplementary test
 * data, and mathematical observations", Table 1: pairs of CIELAB colours and their published difference. The pairs
 * reach every branch of the formula (the hue wrap, the blue rotation term, the neutral axis).
 */
const SHARMA: [number[], number[], number][] = [
  [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
  [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
  [[50, 2.8361, -74.02], [50, 0, -82.7485], 3.4412],
  [[50, -1.3802, -84.2814], [50, 0, -82.7485], 1.0],
  [[50, -1.1848, -84.8006], [50, 0, -82.7485], 1.0],
  [[50, -0.9009, -85.5211], [50, 0, -82.7485], 1.0],
  [[50, 0, 0], [50, -1, 2], 2.3669],
  [[50, -1, 2], [50, 0, 0], 2.3669],
  [[50, 2.49, -0.001], [50, -2.49, 0.0009], 7.1792],
  [[50, 2.49, -0.001], [50, -2.49, 0.001], 7.1792],
  [[50, 2.49, -0.001], [50, -2.49, 0.0011], 7.2195],
  [[50, 2.49, -0.001], [50, -2.49, 0.0012], 7.2195],
  [[50, -0.001, 2.49], [50, 0.0009, -2.49], 4.8045],
  [[50, -0.001, 2.49], [50, 0.001, -2.49], 4.8045],
  [[50, -0.001, 2.49], [50, 0.0011, -2.49], 4.7461],
  [[50, 2.5, 0], [50, 0, -2.5], 4.3065],
  [[50, 2.5, 0], [73, 25, -18], 27.1492],
  [[50, 2.5, 0], [61, -5, 29], 22.8977],
  [[50, 2.5, 0], [56, -27, -3], 31.903],
  [[50, 2.5, 0], [58, 24, 15], 19.4535],
]

describe('deltaELab', () => {
  it.each(SHARMA)('matches the published CIEDE2000 of %j and %j', (first, second, expected) => {
    expect(deltaELab(first, second)).toBeCloseTo(expected, 4)
  })
})

describe('deltaE', () => {
  it('is 0 for the same colour and symmetric', () => {
    expect(deltaE('#e44f27', '#e44f27')).toBe(0)
    expect(deltaE('#e44f27', '#2f56e8')).toBeCloseTo(deltaE('#2f56e8', '#e44f27'), 9)
  })

  it('puts white against black near 100', () => {
    expect(deltaE('#ffffff', '#000000')).toBeCloseTo(100, 0)
  })
})

describe('simulate', () => {
  it('leaves a grey a grey, whatever the vision', () => {
    for (const deficiency of ['protanopia', 'deuteranopia', 'tritanopia'] as const) {
      const [r, g, b] = [1, 3, 5].map((i) =>
        parseInt(simulate('#808080', deficiency).slice(i, i + 2), 16),
      )
      expect(Math.abs(r! - g!)).toBeLessThanOrEqual(2)
      expect(Math.abs(g! - b!)).toBeLessThanOrEqual(2)
    }
  })

  it('takes the red out of a red for a reader without red cones', () => {
    // A run coral and a green of the same lightness are told apart by hue; without red cones they converge.
    expect(
      deltaE(simulate('#e44f27', 'protanopia'), simulate('#2f9e44', 'protanopia')),
    ).toBeLessThan(deltaE('#e44f27', '#2f9e44'))
  })
})

describe('oklch', () => {
  it('reads white as full lightness and no chroma, and a vivid red as chromatic', () => {
    expect(oklch('#ffffff').lightness).toBeCloseTo(1, 2)
    expect(oklch('#ffffff').chroma).toBeLessThan(0.001)
    expect(oklch('#ff0000').chroma).toBeGreaterThan(0.25)
  })
})
