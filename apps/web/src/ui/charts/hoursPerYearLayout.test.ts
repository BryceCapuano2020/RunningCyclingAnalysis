import { describe, expect, it } from 'vitest'
import { yearRow } from '../historyFixtures'
import type { ChartSize } from './chartTypes'
import { hoursPerYearLayout } from './hoursPerYearLayout'
import { PLOT_BOTTOM_WITHOUT_X_TITLE, isPhoneWidth, plotBoxOf } from './plotBox'

/** A phone's chart: the 390 px screen less the page's two 16 px gutters. */
const PHONE = 358

const sizeAt = (width: number): ChartSize => ({
  width,
  height: width < 480 ? 262 : 320,
  plot: plotBoxOf(
    width,
    width < 480 ? 262 : 320,
    undefined,
    PLOT_BOTTOM_WITHOUT_X_TITLE,
    isPhoneWidth(width),
  ),
  tooltipId: 't',
  hintId: 'h',
  titleId: 'i',
})

/** A run of calendar years from `first`, each with some hours. */
const yearsFrom = (first: number, count: number) =>
  Array.from({ length: count }, (_, i) => yearRow(first + i, { hours: 40 + i, activities: 20 }))

const labels = (count: number, width: number, first = 2014) =>
  hoursPerYearLayout(yearsFrom(first, count), sizeAt(width))!.xTicks.map((tick) => tick.label)

describe('the years under the bars', () => {
  it('writes every year in full where each has room', () => {
    expect(labels(5, 800)).toEqual(['2014', '2015', '2016', '2017', '2018'])
    expect(labels(9, PHONE)).toHaveLength(9)
    expect(labels(9, PHONE)[0]).toBe('2014')
  })

  it('writes the years short before it drops any, so a phone labels every bar', () => {
    // Eleven years on a phone have room for ’14 but not 2014; thirteen have room only for 14.
    expect(labels(11, PHONE)).toEqual(
      Array.from({ length: 11 }, (_, i) => `’${String(14 + i).padStart(2, '0')}`),
    )
    expect(labels(13, PHONE)).toEqual(Array.from({ length: 13 }, (_, i) => String(14 + i)))
  })

  it('keeps each label the width of its room and the labels in the order of their bars', () => {
    const m = hoursPerYearLayout(yearsFrom(2014, 13), sizeAt(PHONE))!
    expect(m.xTicks.map((tick) => tick.position)).toEqual(m.xs)
  })

  it('puts every label under its own bar and spaces a thinned set evenly, at any count and width', () => {
    for (const width of [PHONE, 320, 800, 1100]) {
      for (let count = 2; count <= 45; count++) {
        const m = hoursPerYearLayout(yearsFrom(1985, count), sizeAt(width))!
        const at = m.xTicks.map((tick) => m.xs.findIndex((x) => Math.abs(x - tick.position) < 1e-6))
        expect(at.every((index) => index >= 0)).toBe(true)
        // The label is its bar's own year, in whichever of the three forms fits.
        at.forEach((index, i) =>
          expect(String(1985 + index)).toMatch(new RegExp(`${m.xTicks[i]!.label.slice(-2)}$`)),
        )
        const steps = at.slice(1).map((index, i) => index - at[i]!)
        expect(new Set(steps).size).toBeLessThanOrEqual(1)
      }
    }
  })

  it('writes a century’s turn with its two digits and a leading zero', () => {
    expect(labels(13, PHONE, 1998).slice(0, 4)).toEqual(['98', '99', '00', '01'])
  })

  it('thins the labels, as any axis is, only when even the short years collide', () => {
    const many = labels(40, PHONE, 1990)
    expect(many.length).toBeLessThan(40)
    expect(many.length).toBeGreaterThan(1)
  })
})

describe('the year still going', () => {
  it('marks only the bar of the year it names', () => {
    const years = yearsFrom(2021, 3)
    expect(hoursPerYearLayout(years, sizeAt(800), 2023)!.partial).toEqual([false, false, true])
    expect(hoursPerYearLayout(years, sizeAt(800), 2030)!.partial).toEqual([false, false, false])
    expect(hoursPerYearLayout(years, sizeAt(800))!.partial).toEqual([false, false, false])
  })
})
