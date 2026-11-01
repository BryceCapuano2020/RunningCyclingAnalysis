import { describe, expect, it } from 'vitest'
import type { IntensityRow, IntensityShares } from '@rca/core/history'
import type { ChartSize } from './chartTypes'
import { intensityLayout } from './intensityByYearLayout'

const NONE: IntensityShares = { easy: 0, moderate: 0, hard: 0, seconds: 0, counted: 0 }
const SIZE: ChartSize = {
  width: 400,
  height: 300,
  plot: { left: 40, right: 400, top: 20, bottom: 260 },
  tooltipId: 'tooltip',
  hintId: 'hint',
  titleId: 'title',
}

describe('intensityLayout', () => {
  it('stacks the bands from the foot of the bar up, easy first, with a gap between them', () => {
    const years: IntensityRow[] = [
      {
        year: 2025,
        sports: {
          run: { easy: 0.5, moderate: 0.25, hard: 0.25, seconds: 36_000, counted: 9 },
          ride: NONE,
        },
      },
    ]
    const layout = intensityLayout(years, 'run', SIZE)!
    const [easy, moderate, hard] = layout.bars[0]!.segments
    expect(easy).toMatchObject({ band: 'easy' })
    expect(moderate).toMatchObject({ band: 'moderate' })
    expect(hard).toMatchObject({ band: 'hard' })
    // The easy band stands on the plot's foot, the hard band reaches its top, and each band sits 2 px above the next.
    expect(easy!.y + easy!.height).toBeCloseTo(SIZE.plot.bottom - 1)
    expect(moderate!.y + moderate!.height).toBeCloseTo(easy!.y - 2)
    expect(hard!.y).toBeCloseTo(SIZE.plot.top + 1)
    expect(layout.ys).toEqual([hard!.y])
  })

  it('leaves a year with no heart-rate time as an empty room, with its tooltip at the foot', () => {
    const years: IntensityRow[] = [{ year: 2025, sports: { run: NONE, ride: NONE } }]
    const layout = intensityLayout(years, 'run', SIZE)!
    expect(layout.bars[0]!.segments).toEqual([])
    expect(layout.ys).toEqual([SIZE.plot.bottom])
  })
})
