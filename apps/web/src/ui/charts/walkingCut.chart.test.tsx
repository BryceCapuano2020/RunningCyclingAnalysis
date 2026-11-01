// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WALKING_PACE } from '@rca/core/constants'
import type { SportYearCurves } from '@rca/core/history'
import '../../test/deviceZone'
import { chartWidth } from './chartSizeStub'
import { curvePoint } from './fixtures'
import { SportCurveChart } from './SportCurveChart'
import { YearCurvesChart } from './YearCurvesChart'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const WALK = WALKING_PACE.maxMovingSpeedMs - 0.3

/** A run's best speeds at 5 and 20 minutes, 1 and 2 hours, and a 3 hour window that is a walk. */
const RUN = [
  curvePoint(300, 4.4, 'run-1'),
  curvePoint(1200, 3.9, 'run-2'),
  curvePoint(3600, 3.4, 'run-3'),
  curvePoint(7200, 3.0, 'run-4'),
  curvePoint(10_800, WALK, 'run-5'),
]

const rowHeads = () =>
  within(screen.getByRole('table'))
    .getAllByRole('rowheader')
    .map((n) => n.textContent)

describe('a run curve at walking pace, drawn', () => {
  it('stops the sport page curve and its table at the longest duration that is not a walk', () => {
    chartWidth(800)
    render(
      <SportCurveChart
        sport="run"
        curve={RUN}
        previous={null}
        change={null}
        massKg={70}
        units="imperial"
      />,
    )
    expect(rowHeads()).toEqual(['5 min', '20 min', '1 h', '2 h'])
  })

  it('draws a ride to its longest duration whatever the power', () => {
    chartWidth(800)
    const ride = [
      curvePoint(300, 320, 'r1'),
      curvePoint(3600, 210, 'r2'),
      curvePoint(10_800, 60, 'r3'),
    ]
    render(
      <SportCurveChart
        sport="ride"
        curve={ride}
        previous={null}
        change={null}
        massKg={70}
        units="metric"
      />,
    )
    expect(rowHeads()).toEqual(['5 min', '1 h', '3 h'])
  })

  it('stops the best curve by year the same way: with no 3 hour column', () => {
    chartWidth(800)
    const curves: SportYearCurves = {
      durations: [300, 1200, 7200, 10_800],
      years: [
        { year: 2021, values: [4.4, 3.9, 3.0, WALK], hard: true, estimated: [] },
        { year: 2022, values: [4.5, 4.0, 3.1, WALK - 0.3], hard: true, estimated: [] },
      ],
    }
    render(<YearCurvesChart sport="run" curves={curves} units="imperial" />)
    expect(
      within(screen.getByRole('table'))
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Year', '5 min', '20 min', '2 h'])
  })
})
