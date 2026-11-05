import { describe, expect, it } from 'vitest'
import type { PlotBox } from './chartTypes'
import {
  axisTitle,
  axisTitleWithin,
  curveYAxis,
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

describe('sportYAxis for watts', () => {
  it('starts at zero by default, for an area to fill', () => {
    const { ticks } = sportYAxis('ride', [196, 214], PLOT)
    expect(ticks[0]?.label).toBe('0')
  })

  it('stays near the values when it is tight, so a 5% change can be seen', () => {
    const { ticks } = sportYAxis('ride', [196, 214], PLOT, true)
    expect(Number(ticks[0]?.label)).toBeGreaterThan(150)
    expect(Number(ticks.at(-1)?.label)).toBeLessThan(260)
  })
})

describe('sportYAxis for pace', () => {
  it('spans two minutes at least by default, and a minute when it is tight', () => {
    const span = (tight: boolean) => {
      const { ticks } = sportYAxis('run', [320, 327], PLOT, tight)
      const seconds = ticks.map((tick) => {
        const [m, s] = tick.label.split(':').map(Number)
        return m! * 60 + s!
      })
      return Math.max(...seconds) - Math.min(...seconds)
    }
    expect(span(false)).toBeGreaterThanOrEqual(120)
    expect(span(true)).toBeLessThan(90)
    expect(span(true)).toBeGreaterThanOrEqual(60)
  })
})

describe('plottedValue, nativeLabel and axisTitle', () => {
  it('plots running as seconds per unit and cycling as watts', () => {
    expect(plottedValue('run', 4, 'metric')).toBe(250)
    expect(plottedValue('ride', 250, 'metric')).toBe(250)
  })

  it('names each sport’s number and its axis, with the unit', () => {
    expect(nativeLabel('run')).toBe('GAP')
    expect(nativeLabel('ride')).toBe('Power')
    expect(axisTitle('run', 'imperial')).toBe('GAP (/mi), faster up')
    expect(axisTitle('ride', 'metric')).toBe('Power (W)')
  })

  it('spells GAP out on the axis a page names it on, and leaves power as it is', () => {
    expect(axisTitle('run', 'metric', true)).toBe('Grade-adjusted pace (/km), faster up')
    expect(axisTitle('ride', 'metric', true)).toBe('Power (W)')
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

describe('curveYAxis', () => {
  const wide = [230, 300, 440, 720]

  it('fits a pace axis to a wide range, where sportYAxis rounds it out to a 0:00 tick', () => {
    expect(sportYAxis('run', wide, PLOT).ticks.map((tick) => tick.label)).toContain('0:00')
    const { y, ticks } = curveYAxis('run', wide, PLOT)
    const labels = ticks.map((tick) => tick.label)
    expect(labels).not.toContain('0:00')
    // Round minutes inside the data's range with a little room, not more than six.
    expect(labels).toEqual(['4:00', '6:00', '8:00', '10:00', '12:00'])
    const height = PLOT.bottom - PLOT.top
    expect(y(230) - PLOT.top).toBeLessThan(0.1 * height)
    expect(PLOT.bottom - y(720)).toBeLessThan(0.1 * height)
    // Faster is up, and the ticks run down the page as the pace slows.
    expect(y(230)).toBeLessThan(y(720))
    expect(ticks.every((tick, i) => i === 0 || tick.position > ticks[i - 1]!.position)).toBe(true)
  })

  it('keeps a narrow range at least half a minute tall, so a change of seconds is not a cliff', () => {
    const { y } = curveYAxis('run', [300, 304], PLOT)
    expect(Math.abs(y(304) - y(300))).toBeLessThan(0.2 * (PLOT.bottom - PLOT.top))
    expect(curveYAxis('run', [300, 304], PLOT).ticks.length).toBeGreaterThanOrEqual(2)
  })

  it('leaves the power axis as the sport pages draw it, from zero', () => {
    const [curve, page] = [
      curveYAxis('ride', [196, 640], PLOT),
      sportYAxis('ride', [196, 640], PLOT),
    ]
    expect(curve.ticks).toEqual(page.ticks)
    expect(curve.y(400)).toBe(page.y(400))
    expect(curveYAxis('ride', [196, 640], PLOT).ticks[0]?.label).toBe('0')
  })
})

describe('axisTitleWithin', () => {
  it('spells the title out over a wide plot and shortens it over a narrow phone’s, so it never runs past the plot', () => {
    const wide = { left: 48, right: 900, top: 20, bottom: 200 }
    const narrow = { left: 40, right: 260, top: 20, bottom: 200 }
    expect(axisTitleWithin('run', 'imperial', wide, 1)).toBe(axisTitle('run', 'imperial', true))
    expect(axisTitleWithin('run', 'imperial', narrow, 1)).toBe(axisTitle('run', 'imperial'))
    // At a larger text size the full title needs more room.
    expect(axisTitleWithin('run', 'imperial', { ...narrow, right: 360 }, 1)).toBe(
      axisTitle('run', 'imperial', true),
    )
    expect(axisTitleWithin('run', 'imperial', { ...narrow, right: 360 }, 2)).toBe(
      axisTitle('run', 'imperial'),
    )
  })
})
