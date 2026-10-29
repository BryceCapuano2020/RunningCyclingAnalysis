// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as pipeline from '@rca/core/pipeline'
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

vi.mock('@rca/core/pipeline', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@rca/core/pipeline')>()
  return { ...actual, equivalenceFor: vi.fn(actual.equivalenceFor) }
})

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

/** A run and a ride with a best at 10, 20 and 60 min, the run ahead at each; level, the ride matches it. */
function resultAt(durations: readonly number[], level = false): AnalysisResult {
  return makeResult({
    activities,
    runCurve: durations.map((d) => curvePoint(d, flatWkg(SPEEDS[d]?.run ?? 4), 'run-1')),
    rideCurve: durations.map((d) => curvePoint(d, 250, 'ride-1')),
    equivalents: durations.map((d) => {
      const ride = level ? (SPEEDS[d]?.run ?? 4) : (SPEEDS[d]?.ride ?? 4)
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
        massKg={75}
        weightKnown
        calibration={null}
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
        massKg={75}
        weightKnown
        calibration={null}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Grade by duration' })).toHaveClass('sr-only')
  })

  it('shows nothing without a year of birth and sex', () => {
    const { container } = render(
      <GradeProfileSection
        result={resultAt([600, 1200, 3600])}
        profile={null}
        massKg={75}
        weightKnown
        calibration={null}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows nothing while no weight is entered, since the ride is not graded until then', () => {
    const { container } = render(
      <GradeProfileSection
        result={resultAt([600, 1200, 3600])}
        profile={MAN_BORN_1986}
        massKg={75}
        weightKnown={false}
        calibration={null}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows nothing with fewer than two durations graded in both sports', () => {
    const { container } = render(
      <GradeProfileSection
        result={resultAt([1200])}
        profile={MAN_BORN_1986}
        massKg={75}
        weightKnown
        calibration={null}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('prices the extra durations once for a result, not on each render, and again for a new mass', () => {
    // A best at 15 min is beyond the six durations a combine prices, so the section prices it.
    const base = resultAt([600, 1200, 3600])
    const result = { ...base, rideCurve: [...base.rideCurve, curvePoint(900, 250, 'ride-1')] }
    vi.mocked(pipeline.equivalenceFor).mockClear()
    const props = {
      result,
      profile: MAN_BORN_1986,
      massKg: 75,
      weightKnown: true,
      calibration: null,
    }
    const { rerender } = render(<GradeProfileSection {...props} />)
    expect(pipeline.equivalenceFor).toHaveBeenCalledTimes(1)
    // A new profile object with the same year and sex, as the page builds on each render.
    rerender(<GradeProfileSection {...props} profile={{ ...MAN_BORN_1986 }} />)
    expect(pipeline.equivalenceFor).toHaveBeenCalledTimes(1)
    rerender(<GradeProfileSection {...props} massKg={80} />)
    expect(pipeline.equivalenceFor).toHaveBeenCalledTimes(2)
  })

  it('prices nothing without a year of birth, or without a weight', () => {
    const base = resultAt([600, 1200, 3600])
    const result = { ...base, rideCurve: [...base.rideCurve, curvePoint(900, 250, 'ride-1')] }
    vi.mocked(pipeline.equivalenceFor).mockClear()
    render(
      <GradeProfileSection
        result={result}
        profile={null}
        massKg={75}
        weightKnown
        calibration={null}
      />,
    )
    cleanup()
    render(
      <GradeProfileSection
        result={result}
        profile={MAN_BORN_1986}
        massKg={75}
        weightKnown={false}
        calibration={null}
      />,
    )
    expect(pipeline.equivalenceFor).not.toHaveBeenCalled()
  })

  it('shows the chart open, with the finding as its lede, when a duration separates the sports', () => {
    const { container } = render(
      <GradeProfileSection
        result={resultAt([600, 1200, 3600])}
        profile={MAN_BORN_1986}
        massKg={75}
        weightKnown
        calibration={null}
      />,
    )
    expect(container.querySelector('.grade-profile__details')).toBeNull()
    expect(screen.getByRole('figure', { name: 'Grade by duration' })).toBeInTheDocument()
    expect(container.querySelector('.chart-frame__lede')).toHaveTextContent(/^Your running grades/)
  })

  it('keeps the sentence and folds the chart behind Show by duration when no duration separates them', async () => {
    const { container } = render(
      <GradeProfileSection
        result={resultAt([600, 1200, 3600], true)}
        profile={MAN_BORN_1986}
        massKg={75}
        weightKnown
        calibration={null}
      />,
    )
    const sentence = screen.getByText(
      /^At every duration from .* the range of the gap reaches zero/,
    )
    expect(sentence).toBeVisible()
    // The chart is not mounted while it is folded, and its lede is not said twice.
    expect(screen.queryByRole('figure')).toBeNull()
    const details = container.querySelector<HTMLDetailsElement>('.grade-profile__details')!
    expect(details).not.toHaveAttribute('open')
    expect(within(details).getByText('Show by duration')).toBeInTheDocument()

    fireEvent.click(details.querySelector('summary')!)
    await waitFor(() => expect(details).toHaveAttribute('open'))
    await waitFor(() =>
      expect(screen.getByRole('figure', { name: 'Grade by duration' })).toBeInTheDocument(),
    )
    expect(screen.getAllByText(/the range of the gap reaches zero/)).toHaveLength(1)
    expect(within(details).getByText('Hide by duration')).toBeInTheDocument()
  })
})
