import { describe, expect, it } from 'vitest'
import { bandsIn, fitAxis, ticksIn, xAt } from './balanceScaleAxis'

describe('fitAxis', () => {
  it('starts one ten below the lowest mark and ends at the next level above the highest', () => {
    // A range from 52 to 63 with a grade at 64: Local is the highest level reached, so Regional is the next.
    expect(fitAxis([52, 58, 63, 64])).toEqual({ min: 40, max: 80 })
  })

  it('never makes the axis narrower than 40 points, widening below first', () => {
    expect(fitAxis([62, 64])).toEqual({ min: 40, max: 80 })
    // High marks run into 100%, so the space is found below them.
    expect(fitAxis([93, 95])).toEqual({ min: 60, max: 100 })
  })

  it('stops at 0 and at 100%, and widens upward only where there is no room below', () => {
    expect(fitAxis([3, 5])).toEqual({ min: 0, max: 40 })
    expect(fitAxis([97])).toEqual({ min: 60, max: 100 })
  })

  it('holds every mark whatever the data', () => {
    for (const marks of [[10, 90], [55], [30, 99], [70, 71, 72]]) {
      const { min, max } = fitAxis(marks)
      expect(Math.min(...marks)).toBeGreaterThanOrEqual(min)
      expect(Math.max(...marks)).toBeLessThanOrEqual(max)
      expect(max - min).toBeGreaterThanOrEqual(40)
      expect(min % 10).toBe(0)
      expect(max % 10).toBe(0)
    }
  })
})

describe('bandsIn', () => {
  it('clips the five levels to the axis, lowest first, leaving out a band wholly off it', () => {
    expect(bandsIn({ min: 40, max: 80 })).toEqual([
      { name: 'Recreational', level: 1, from: 40, to: 60 },
      { name: 'Local', level: 2, from: 60, to: 70 },
      { name: 'Regional', level: 3, from: 70, to: 80 },
    ])
  })

  it('names all five on the whole scale, ending World at 100%', () => {
    const bands = bandsIn({ min: 0, max: 100 })
    expect(bands.map((band) => band.name)).toEqual([
      'Recreational',
      'Local',
      'Regional',
      'National',
      'World',
    ])
    expect(bands.at(-1)).toMatchObject({ from: 90, to: 100 })
  })

  it('keeps each band number, so a clipped axis paints the same level the same wash', () => {
    expect(bandsIn({ min: 60, max: 100 }).map((band) => band.level)).toEqual([2, 3, 4, 5])
  })
})

describe('ticksIn and xAt', () => {
  it('labels every ten the axis spans, ends included', () => {
    expect(ticksIn({ min: 40, max: 80 })).toEqual([40, 50, 60, 70, 80])
  })

  it('places a percentage linearly across the plot', () => {
    const axis = { min: 40, max: 80 }
    expect(xAt(axis, 0, 1000, 40)).toBe(0)
    expect(xAt(axis, 0, 1000, 60)).toBe(500)
    expect(xAt(axis, 10, 400, 80)).toBe(410)
  })
})
