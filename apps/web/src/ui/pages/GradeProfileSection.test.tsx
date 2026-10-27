// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { AnalysisResult } from '@rca/core/pipeline'
import { curvePoint } from '../charts/fixtures'
import {
  MAN_BORN_1986,
  flatWkg,
  interval,
  makeActivity,
  makeEquivalence,
  makeResult,
} from '../components/fixtures'
import { GradeProfileSection } from './GradeProfileSection'

afterEach(cleanup)

const startMs = new Date(2026, 2, 1).getTime()
const activities = [
  makeActivity({ id: 'run-1', sport: 'run', startMs }),
  makeActivity({ id: 'ride-1', sport: 'ride', startMs }),
]

/** The run's speed and the ride's running equivalent at each duration, in m/s. */
const SPEEDS: Record<number, { run: number; ride: number }> = {
  600: { run: 4.9, ride: 4.2 },
  1200: { run: 4.6, ride: 3.9 },
  3600: { run: 4.1, ride: 3.4 },
}

/** A run and a ride with a best at 10, 20 and 60 min, the run ahead at each. */
function resultAt(durations: readonly number[]): AnalysisResult {
  return makeResult({
    activities,
    runCurve: durations.map((d) => curvePoint(d, flatWkg(SPEEDS[d]?.run ?? 4), 'run-1')),
    rideCurve: durations.map((d) => curvePoint(d, 250, 'ride-1')),
    equivalents: durations.map((d) => {
      const ride = SPEEDS[d]?.ride ?? 4
      return makeEquivalence({ durationS: d, runSpeed: interval(ride - 0.1, ride, ride + 0.1) })
    }),
  })
}

describe('GradeProfileSection', () => {
  it('shows the finding and the chart in a section named by the chart’s title', () => {
    render(
      <GradeProfileSection
        result={resultAt([600, 1200, 3600])}
        profile={MAN_BORN_1986}
        weightKnown
      />,
    )
    const section = screen.getByRole('region', { name: 'Grade by duration' })
    expect(within(section).getByRole('figure', { name: 'Grade by duration' })).toBeInTheDocument()
    expect(
      within(section).getByText(
        /^Your running grades about \d+ points higher than your cycling at every duration from 10 to 60 min, /,
      ),
    ).toBeInTheDocument()
  })

  it('keeps its heading for screen readers only, so the chart title is the one visible name', () => {
    render(
      <GradeProfileSection
        result={resultAt([600, 1200, 3600])}
        profile={MAN_BORN_1986}
        weightKnown
      />,
    )
    expect(screen.getByRole('heading', { name: 'Grade by duration' })).toHaveClass('sr-only')
  })

  it('shows nothing without a year of birth and sex', () => {
    const { container } = render(
      <GradeProfileSection result={resultAt([600, 1200, 3600])} profile={null} weightKnown />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows nothing while no weight is entered, since the ride is not graded until then', () => {
    const { container } = render(
      <GradeProfileSection
        result={resultAt([600, 1200, 3600])}
        profile={MAN_BORN_1986}
        weightKnown={false}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows nothing with fewer than two durations graded in both sports', () => {
    const { container } = render(
      <GradeProfileSection result={resultAt([1200])} profile={MAN_BORN_1986} weightKnown />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
