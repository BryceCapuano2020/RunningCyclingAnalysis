import { describe, expect, it } from 'vitest'
import type { PlotBox } from './chartTypes'
import {
  axisTitle,
  fillsArea,
  formatNative,
  nativeLabel,
  paceUnitName,
  plottedValue,
  sportYAxis,
  usable,
} from './sportAxis'

const PLOT: PlotBox = { left: 40, right: 300, top: 20, bottom: 200 }

describe('usable', () => {
  it('keeps positive finite values and turns the rest into NaN', () => {
    expect(usable(4)).toBe(4)
    expect(usable(0)).toBeNaN()
    expect(usable(-1)).toBeNaN()
    expect(usable(Number.NaN)).toBeNaN()
    expect(usable(Number.POSITIVE_INFINITY)).toBeNaN()
  })
})

describe('sportYAxis', () => {
  it('spans at least two minutes for a narrow pace range, so ticks do not crowd', () => {
    const plot = { left: 0, right: 100, top: 0, bottom: 200 }
    // 4:00 and 4:10 are 10 s apart. The axis is two minutes wide, so its ticks are half a minute apart.
    const { ticks } = sportYAxis('run', [240, 250], plot)
    const labels = ticks.map((tick) => tick.label)
    expect(labels).toEqual(expect.arrayContaining(['3:30', '4:00', '4:30']))
    expect(labels).not.toContain('4:10')
  })
})

describe('plottedValue, nativeLabel and axisTitle', () => {
  it('plots running as seconds per unit and cycling as watts', () => {
    expect(plottedValue('run', 4, 'metric')).toBe(250)
    expect(plottedValue('ride', 250, 'metric')).toBe(250)
  })

  it('names each sport’s number and its axis, with the unit', () => {
    expect(nativeLabel('run')).toBe('Flat pace')
    expect(nativeLabel('ride')).toBe('Power')
    expect(axisTitle('run', 'imperial')).toBe('Flat pace (/mi), faster up')
    expect(axisTitle('ride', 'metric')).toBe('Power (W)')
  })

  it('formats a running value as a pace and a cycling value in watts', () => {
    expect(formatNative('run', 4, 'metric')).toBe('4:10 /km')
    expect(formatNative('ride', 250, 'metric')).toBe('250 W')
  })
})

describe('sportYAxis', () => {
  it('puts round minutes on a pace axis, with the faster pace higher up', () => {
    const { ticks } = sportYAxis('run', [210, 360], PLOT)
    expect(ticks.map((tick) => tick.label)).toEqual(['3:00', '4:00', '5:00', '6:00'])
    const top = ticks[0]?.position ?? NaN
    const bottom = ticks[3]?.position ?? NaN
    expect(top).toBeLessThan(bottom)
  })

  it('groups the watt labels from a thousand on', () => {
    const { ticks } = sportYAxis('ride', [210, 2000], PLOT)
    expect(ticks.map((tick) => tick.label)).toEqual(expect.arrayContaining(['1,000', '2,000']))
  })

  it('draws a cycling axis from zero, with the larger power higher up', () => {
    const { ticks } = sportYAxis('ride', [210, 400], PLOT)
    expect(ticks[0]?.label).toBe('0')
    const last = ticks.at(-1)
    expect(last?.position).toBeLessThan(ticks[0]?.position ?? NaN)
    expect(ticks.every((tick) => tick.position >= PLOT.top && tick.position <= PLOT.bottom)).toBe(
      true,
    )
  })
})

describe('paceUnitName and fillsArea', () => {
  it('spells the pace unit out for a chart’s name', () => {
    expect(paceUnitName('metric')).toBe('per kilometre')
    expect(paceUnitName('imperial')).toBe('per mile')
  })

  it('fills only watts: pace has no zero to fill down to', () => {
    expect(fillsArea('ride')).toBe(true)
    expect(fillsArea('run')).toBe(false)
  })
})
