import { describe, expect, it } from 'vitest'
import { dotsFixture, slipAndRise } from '../fitnessYearsFixtures'
import type { ChartSize } from './chartTypes'
import { fitnessYearsLayout } from './fitnessYearsLayout'
import { PLOT_BOTTOM_WITHOUT_X_TITLE, plotBoxOf } from './plotBox'

/**
 * Every steady activity of a library is a dot, and the chart is laid out again when its width changes, so the layout of
 * a long library must stay well inside a frame: about 3,000 dots over 12 years, drawn as one path.
 */
const BUDGET_MS = 40
const SIZE: ChartSize = {
  width: 900,
  height: 320,
  plot: plotBoxOf(900, 320, undefined, PLOT_BOTTOM_WITHOUT_X_TITLE),
  tooltipId: 't',
  hintId: 'h',
  titleId: 'i',
}

/** The fastest of five timed runs, ms, so neither the cold first call nor a stray pause counts. */
function fastestMs(run: () => void): number {
  let fastest = Infinity
  for (let i = 0; i < 5; i++) {
    const start = performance.now()
    run()
    fastest = Math.min(fastest, performance.now() - start)
  }
  return fastest
}

describe('fitnessYearsLayout performance', () => {
  const years = Array.from({ length: 12 }, (_, i) => 2014 + i)
  const dots = dotsFixture({ years, perYear: 250, spans: slipAndRise(2018) })

  it(`lays out ${dots.levels.length} dots in under ${BUDGET_MS} ms`, () => {
    let drawn = 0
    const ms = fastestMs(() => {
      drawn = fitnessYearsLayout(dots, 'run', 'metric', SIZE)!.dots.split('M').length - 1
    })
    expect(drawn).toBe(3000)
    expect(ms).toBeLessThan(BUDGET_MS)
  })
})
