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

  it('runs past 100% in tens where a grade or a range end does, since grades are not capped', () => {
    expect(fitAxis([132, 52])).toEqual({ min: 40, max: 140 })
    expect(fitAxis([60, 62, 115])).toEqual({ min: 50, max: 120 })
    // A mark at the top of the scale is not on the axis's edge.
    expect(fitAxis([100, 90])).toEqual({ min: 70, max: 110 })
    expect(fitAxis([99])).toEqual({ min: 60, max: 100 })
  })

  it('falls back to the default axis, and returns, for marks that are not numbers or are none', () => {
    expect(fitAxis([])).toEqual({ min: 40, max: 80 })
    expect(fitAxis([Number.NaN])).toEqual({ min: 40, max: 80 })
    expect(fitAxis([62, Number.NaN, 70])).toEqual({ min: 40, max: 80 })
    expect(fitAxis([Number.POSITIVE_INFINITY, 60])).toEqual({ min: 40, max: 80 })
  })

  it('holds every mark whatever the data', () => {
    for (const marks of [
      [10, 90],
      [55],
      [30, 99],
      [70, 71, 72],
      [52, 132],
      [40, 115, 119.4],
      [100],
    ]) {
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

  it('lets World run on to the axis’s end where the axis passes 100%', () => {
    const bands = bandsIn({ min: 40, max: 140 })
    expect(bands.at(-1)).toMatchObject({ name: 'World', to: 140 })
    // Every band is clipped and the bands meet, so nothing of the axis is left bare.
    bands.slice(1).forEach((band, i) => expect(band.from).toBe(bands[i]!.to))
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
