import { describe, expect, it } from 'vitest'
import {
  PHONE_CHART_HEIGHT,
  PHONE_CHART_WIDTH,
  PLOT_MARGIN,
  PLOT_MARGIN_PHONE,
  isPhoneWidth,
  plotBoxOf,
} from './plotBox'
import { NARROW_WIDTH } from './ticks'

describe('plotBoxOf', () => {
  it('keeps a wide chart’s margins: 56 px left, 52 px below, 16 px right', () => {
    expect(plotBoxOf(900, 320)).toEqual({ left: 56, right: 884, top: 28, bottom: 268 })
  })

  it('gives a phone a 40 px y gutter and a shorter x band, which leave a plot about 190 px tall', () => {
    const box = plotBoxOf(358, PHONE_CHART_HEIGHT, undefined, undefined, true)
    expect(box.left).toBe(40)
    expect(box.right).toBe(358 - PLOT_MARGIN_PHONE.right)
    expect(box.bottom).toBe(PHONE_CHART_HEIGHT - PLOT_MARGIN_PHONE.bottom)
    expect(box.bottom - box.top).toBeGreaterThanOrEqual(180)
    expect(box.bottom - box.top).toBeLessThanOrEqual(200)
  })

  it('keeps a margin a chart gives, at every width', () => {
    expect(plotBoxOf(358, 200, 90, 30, true)).toMatchObject({ right: 268, bottom: 170 })
    expect(plotBoxOf(900, 200, 90, 30)).toMatchObject({ right: 810, bottom: 170 })
  })

  it('never lets a narrow chart’s plot collapse', () => {
    expect(plotBoxOf(60, 200, 200, undefined, true).right).toBeGreaterThan(40)
  })

  it('shares the phone boundary with the axis ticks, so geometry and tick density change together', () => {
    expect(NARROW_WIDTH).toBe(PHONE_CHART_WIDTH)
    expect(isPhoneWidth(479)).toBe(true)
    expect(isPhoneWidth(480)).toBe(false)
    expect(PLOT_MARGIN_PHONE.left).toBeLessThan(PLOT_MARGIN.left)
  })
})
