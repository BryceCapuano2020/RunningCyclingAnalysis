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
  return { ...actual, profileEquivalents: vi.fn(actual.profileEquivalents) }
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
  it('shows the chart in a section named Grade by duration, with the finding under the title', () => {
    render(
      <GradeProfileSection
        result={resultAt([600, 1200, 3600])}
        profile={MAN_BORN_1986}
        massKg={75}
        weightKnown
        lean="run"
      />,
    )
    const section = screen.getByRole('region', { name: 'Grade by duration' })
    // The figure is named by the title, and the finding is its description, said once.
    const finding = 'Running grades higher at every length'
    const figure = within(section).getByRole('figure', { name: 'Grade by duration' })
    expect(figure).toHaveAccessibleDescription(finding)
    expect(within(section).getAllByText(finding)).toHaveLength(1)
  })

  it('keeps its heading for screen readers only, so the chart title is the one visible name', () => {
    const { container } = render(
      <GradeProfileSection
        result={resultAt([600, 1200, 3600])}
        profile={MAN_BORN_1986}
        massKg={75}
        weightKnown
        lean="run"
      />,
    )
    expect(screen.getByRole('heading', { name: 'Grade by duration' })).toHaveClass('sr-only')
    expect(container.querySelector('.chart-frame__title')).toHaveTextContent('Grade by duration')
  })

  it('leaves out a finding that names the other sport than the hero’s lean, and keeps the chart and its title', () => {
    const { container } = render(
      <GradeProfileSection
        result={resultAt([600, 1200, 3600])}
        profile={MAN_BORN_1986}
        massKg={75}
        weightKnown
        lean="ride"
      />,
    )
    expect(screen.getByRole('figure', { name: 'Grade by duration' })).toBeInTheDocument()
    expect(screen.queryByText(/grades higher/)).toBeNull()
    expect(container.querySelector('.chart-frame__takeaway')).toBeNull()
  })

  it('says no finding while the hero states no balance, since there is none to agree with', () => {
    render(
      <GradeProfileSection
        result={resultAt([600, 1200, 3600])}
        profile={MAN_BORN_1986}
        massKg={75}
        weightKnown
        lean={null}
      />,
    )
    expect(screen.getByRole('figure', { name: 'Grade by duration' })).toBeInTheDocument()
    expect(screen.queryByText(/grades higher/)).toBeNull()
  })

  it('shows nothing without a year of birth and sex', () => {
    const { container } = render(
      <GradeProfileSection
        result={resultAt([600, 1200, 3600])}
        profile={null}
        massKg={75}
        weightKnown
        lean="run"
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
        lean="run"
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
        lean="run"
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('prices the extra durations once for a result, not on each render, and again for a new mass', () => {
    // A best at 15 min is beyond the six durations a combine prices, so the section prices it.
    const base = resultAt([600, 1200, 3600])
    const result = { ...base, rideCurve: [...base.rideCurve, curvePoint(900, 250, 'ride-1')] }
    vi.mocked(pipeline.profileEquivalents).mockClear()
    const props = {
      result,
      profile: MAN_BORN_1986,
      massKg: 75,
      weightKnown: true,
      lean: 'run' as const,
    }
    const { rerender } = render(<GradeProfileSection {...props} />)
    expect(pipeline.profileEquivalents).toHaveBeenCalledTimes(1)
    // A new profile object with the same year and sex, as the page builds on each render.
    rerender(<GradeProfileSection {...props} profile={{ ...MAN_BORN_1986 }} />)
    expect(pipeline.profileEquivalents).toHaveBeenCalledTimes(1)
    rerender(<GradeProfileSection {...props} massKg={80} />)
    expect(pipeline.profileEquivalents).toHaveBeenCalledTimes(2)
  })

  it('prices nothing without a year of birth, or without a weight', () => {
    const base = resultAt([600, 1200, 3600])
    const result = { ...base, rideCurve: [...base.rideCurve, curvePoint(900, 250, 'ride-1')] }
    vi.mocked(pipeline.profileEquivalents).mockClear()
    render(
      <GradeProfileSection result={result} profile={null} massKg={75} weightKnown lean="run" />,
    )
    cleanup()
    render(
      <GradeProfileSection
        result={result}
        profile={MAN_BORN_1986}
        massKg={75}
        weightKnown={false}
        lean="run"
      />,
    )
    expect(pipeline.profileEquivalents).not.toHaveBeenCalled()
  })

  it('shows the chart open, with the finding under its title, when a duration separates the sports', () => {
    const { container } = render(
      <GradeProfileSection
        result={resultAt([600, 1200, 3600])}
        profile={MAN_BORN_1986}
        massKg={75}
        weightKnown
        lean="run"
      />,
    )
    expect(container.querySelector('.grade-profile__details')).toBeNull()
    expect(container.querySelector('.chart-frame__title')).toHaveTextContent('Grade by duration')
    expect(container.querySelector('.chart-frame__takeaway')).toHaveTextContent(
      /^Running grades higher /,
    )
    expect(container.querySelector('.chart-frame__lede')).toBeNull()
  })

  it('folds the chart behind Show by duration when no duration separates the sports, under the title and the finding', async () => {
    const { container } = render(
      <GradeProfileSection
        result={resultAt([600, 1200, 3600], true)}
        profile={MAN_BORN_1986}
        massKg={75}
        weightKnown
        lean="even"
      />,
    )
    const sentence = screen.getByText(/^Running and cycling grade alike$/)
    expect(sentence).toBeVisible()
    // The title is the card's, shown once, and the chart is not mounted while it is folded.
    expect(screen.getAllByText('Grade by duration')).toHaveLength(2)
    expect(container.querySelector('.meta')).toHaveTextContent('Grade by duration')
    expect(screen.queryByRole('figure')).toBeNull()
    const details = container.querySelector<HTMLDetailsElement>('.grade-profile__details')!
    expect(details).not.toHaveAttribute('open')
    expect(within(details).getByText('Show by duration')).toBeInTheDocument()

    fireEvent.click(details.querySelector('summary')!)
    await waitFor(() => expect(details).toHaveAttribute('open'))
    await waitFor(() =>
      expect(screen.getByRole('figure', { name: 'Grade by duration' })).toBeInTheDocument(),
    )
    // The sentence is said once: the open chart does not repeat it.
    expect(screen.getAllByText('Running and cycling grade alike')).toHaveLength(1)
    expect(within(details).getByText('Hide by duration')).toBeInTheDocument()
  })

  it('does not say the sports grade alike under a hero that leans, whichever way', async () => {
    for (const lean of ['run', 'ride'] as const) {
      const { container, unmount } = render(
        <GradeProfileSection
          result={resultAt([600, 1200, 3600], true)}
          profile={MAN_BORN_1986}
          massKg={75}
          weightKnown
          lean={lean}
        />,
      )
      // The card keeps its title and its folded chart, and says nothing that contradicts the hero.
      expect(container.querySelector('.meta')).toHaveTextContent('Grade by duration')
      expect(container.querySelector('.grade-profile__finding')).toBeNull()
      expect(screen.queryByText(/grade alike/)).toBeNull()
      expect(within(container).getByText('Show by duration')).toBeInTheDocument()
      unmount()
    }
  })
})
