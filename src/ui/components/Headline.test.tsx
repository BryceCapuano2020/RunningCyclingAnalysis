// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { AnalysisResult } from '../../core/pipeline'
import type { ComparisonPoint, EffortCheck } from '../../core/types'
import type { UnitSystem } from '../../core/units'
import { comparisonPoint, interval, makeActivity, makeResult } from './fixtures'
import { Headline } from './Headline'

afterEach(() => {
  cleanup()
})

/** A result whose only comparison point has the given ratio, optionally calibrated. */
function withRatio(
  ratio: ComparisonPoint['ratio'],
  calibrated = false,
  overrides: Partial<AnalysisResult> = {},
): AnalysisResult {
  const point = comparisonPoint({ ratio })
  return makeResult({
    comparison: { prior: [point], calibrated: calibrated ? [point] : null },
    ...overrides,
  })
}

function renderHeadline(result: AnalysisResult, units: UnitSystem = 'metric', massKg = 75) {
  return render(<Headline result={result} units={units} massKg={massKg} />)
}

describe('Headline wording', () => {
  it('says running is stronger when the whole interval is above 1', () => {
    renderHeadline(withRatio(interval(1.05, 1.12, 1.2)))
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Your running is 12% stronger than your cycling',
      }),
    ).toBeInTheDocument()
  })

  it('says cycling is stronger when the whole interval is below 1', () => {
    renderHeadline(withRatio(interval(0.8, 0.9, 0.95)))
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Your cycling is 10% stronger than your running',
      }),
    ).toBeInTheDocument()
  })

  it('says the two are too close to call when the interval spans 1', () => {
    renderHeadline(withRatio(interval(0.95, 1.0, 1.05)))
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Your running and cycling are too close to call',
      }),
    ).toBeInTheDocument()
  })

  it('states the 20 minute costs and the signed likely range', () => {
    renderHeadline(withRatio(interval(1.05, 1.12, 1.2)))
    expect(
      screen.getByText(
        'Over 20 min, your best running burns 3.4 W/kg and your best cycling burns 3.0 W/kg. The gap is probably between +5% and +20%.',
      ),
    ).toBeInTheDocument()
  })

  it('makes the heading a programmatic focus target for the page', () => {
    renderHeadline(withRatio(interval(1.05, 1.12, 1.2)))
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveAttribute('id', 'results-heading')
    expect(heading).toHaveAttribute('tabindex', '-1')
  })

  it('draws no card of its own, since the page supplies the card', () => {
    const { container } = renderHeadline(withRatio(interval(1.05, 1.12, 1.2)))
    expect(container.querySelector('.card')).toBeNull()
  })

  it('says the range is narrowed when the heart-rate comparison was used', () => {
    renderHeadline(withRatio(interval(1.05, 1.12, 1.2), true))
    expect(screen.getByText('Range narrowed using your heart-rate data')).toBeInTheDocument()
  })

  it('says the range uses population averages without heart-rate data', () => {
    renderHeadline(withRatio(interval(1.05, 1.12, 1.2), false))
    expect(
      screen.getByText(
        'Range based on population averages. Add more runs and rides with heart rate to narrow it',
      ),
    ).toBeInTheDocument()
  })
})

describe('Headline effort notice', () => {
  function renderWithEffort(effort: EffortCheck | null | undefined) {
    return render(
      <Headline
        result={withRatio(interval(1.05, 1.12, 1.2))}
        units="metric"
        massKg={75}
        effort={effort}
      />,
    )
  }

  it('explains that a low cycling effort probably was not all-out', () => {
    renderWithEffort({ durationS: 1200, runHrFraction: 0.95, rideHrFraction: 0.8 })
    expect(
      screen.getByText(
        'Your best cycling effort over 20 min reached 80% of your highest heart rate, so it was probably not all-out. Your cycling may be stronger than shown.',
      ),
    ).toBeInTheDocument()
  })

  it('explains that a low running effort probably was not all-out', () => {
    renderWithEffort({ durationS: 1200, runHrFraction: 0.7, rideHrFraction: 0.95 })
    expect(
      screen.getByText(
        'Your best running effort over 20 min reached 70% of your highest heart rate, so it was probably not all-out. Your running may be stronger than shown.',
      ),
    ).toBeInTheDocument()
  })

  it('says neither effort was all-out when both are low', () => {
    renderWithEffort({ durationS: 1200, runHrFraction: 0.7, rideHrFraction: 0.8 })
    expect(
      screen.getByText(
        'Neither best effort over 20 min was close to all-out (running 70%, cycling 80% of your highest heart rate), so treat this comparison as rough.',
      ),
    ).toBeInTheDocument()
  })

  it('shows a warning icon drawn with currentColor and the text', () => {
    const { container } = renderWithEffort({
      durationS: 1200,
      runHrFraction: 0.95,
      rideHrFraction: 0.8,
    })
    const icon = container.querySelector('.headline__effort svg')
    expect(icon).toHaveAttribute('aria-hidden', 'true')
    expect(icon?.querySelector('path')).toHaveAttribute('stroke', 'currentColor')
  })

  it('shows a muted line when both efforts are at or above 0.9 of the highest heart rate', () => {
    const { container } = renderWithEffort({
      durationS: 1200,
      runHrFraction: 0.9,
      rideHrFraction: 0.95,
    })
    expect(
      screen.getByText('Both best efforts were close to all-out by heart rate'),
    ).toBeInTheDocument()
    expect(container.querySelector('.headline__effort')).toBeNull()
  })

  it('renders nothing extra when the effort check is missing', () => {
    const { container, unmount } = renderWithEffort(undefined)
    expect(container.querySelector('.headline__effort')).toBeNull()
    expect(screen.queryByText(/all-out/)).not.toBeInTheDocument()
    unmount()
    renderWithEffort(null)
    expect(screen.queryByText(/all-out/)).not.toBeInTheDocument()
  })

  it('renders nothing extra when neither heart-rate fraction is known', () => {
    renderWithEffort({ durationS: 1200, runHrFraction: null, rideHrFraction: null })
    expect(screen.queryByText(/all-out/)).not.toBeInTheDocument()
  })
})

describe('Headline missing sport', () => {
  it('asks for a run and a ride when there are no comparison points', () => {
    renderHeadline(
      makeResult({
        activities: [makeActivity({ sport: 'run' })],
        comparison: { prior: [], calibrated: null },
      }),
    )
    expect(
      screen.getByRole('heading', { level: 1, name: 'Add at least one run and one ride' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Your files have no cycling activities yet.')).toBeInTheDocument()
  })

  it('names running as the missing sport when only rides are present', () => {
    renderHeadline(
      makeResult({
        activities: [makeActivity({ sport: 'ride' })],
        comparison: { prior: [], calibrated: null },
      }),
    )
    expect(screen.getByText('Your files have no running activities yet.')).toBeInTheDocument()
  })

  it('says both sports are present when no efforts could be compared', () => {
    renderHeadline(makeResult({ comparison: { prior: [], calibrated: null } }))
    expect(
      screen.getByText('Both sports are in your files, but no efforts could be compared yet.'),
    ).toBeInTheDocument()
  })

  it('says neither sport is present when there are no activities', () => {
    renderHeadline(makeResult({ activities: [], comparison: { prior: [], calibrated: null } }))
    expect(
      screen.getByText('Your files have no running or cycling activities yet.'),
    ).toBeInTheDocument()
  })
})

/** The stat tile whose label is the given text. */
function tileFor(label: string): HTMLElement {
  const tile = screen.getByText(label).closest('li')
  if (!tile) throw new Error(`no tile labelled ${label}`)
  return tile
}

describe('Headline stat tiles', () => {
  it('shows the running and cycling thresholds, accuracy and activity counts', () => {
    renderHeadline(withRatio(interval(1.05, 1.12, 1.2)), 'metric', 75)
    const running = within(tileFor('Running threshold pace'))
    expect(running.getByText('21:35 /km')).toBeInTheDocument()
    expect(running.getByText('4.0 W/kg')).toBeInTheDocument()

    const cycling = within(tileFor('Cycling threshold power'))
    expect(cycling.getByText('48 W')).toBeInTheDocument()
    expect(cycling.getByText('3.0 W/kg')).toBeInTheDocument()

    const accuracy = within(tileFor('Virtual power meter error'))
    expect(accuracy.getByText('±6%')).toBeInTheDocument()
    expect(accuracy.getByText('3 climbs tested')).toBeInTheDocument()

    const activities = within(tileFor('Activities analysed'))
    expect(activities.getByText('2')).toBeInTheDocument()
    expect(activities.getByText('1 run, 1 ride')).toBeInTheDocument()
  })

  it('shows the running pace in miles for imperial', () => {
    renderHeadline(withRatio(interval(1.05, 1.12, 1.2)), 'imperial')
    expect(screen.getByText('34:44 /mi')).toBeInTheDocument()
  })

  it('omits the running threshold tile when there is no running threshold', () => {
    renderHeadline(withRatio(interval(1.05, 1.12, 1.2), false, { runCp: null }))
    expect(screen.queryByText('Running threshold pace')).not.toBeInTheDocument()
    expect(screen.getByText('Cycling threshold power')).toBeInTheDocument()
  })

  it('omits the cycling threshold tile when there is no cycling threshold', () => {
    renderHeadline(withRatio(interval(1.05, 1.12, 1.2), false, { rideCp: null }))
    expect(screen.queryByText('Cycling threshold power')).not.toBeInTheDocument()
  })

  it('omits the accuracy tile when there is no virtual power accuracy', () => {
    renderHeadline(withRatio(interval(1.05, 1.12, 1.2), false, { virtualAccuracy: null }))
    expect(screen.queryByText('Virtual power meter error')).not.toBeInTheDocument()
  })

  it('omits the accuracy tile when no climbs were scored', () => {
    renderHeadline(
      withRatio(interval(1.05, 1.12, 1.2), false, {
        virtualAccuracy: { nSegments: 0, mape: 0, bias: 0, segments: [] },
      }),
    )
    expect(screen.queryByText('Virtual power meter error')).not.toBeInTheDocument()
  })

  it('uses singular words for one climb, run and ride', () => {
    renderHeadline(
      withRatio(interval(1.05, 1.12, 1.2), false, {
        activities: [makeActivity({ sport: 'run' }), makeActivity({ id: 'b', sport: 'ride' })],
        virtualAccuracy: { nSegments: 1, mape: 0.06, bias: 0, segments: [] },
      }),
    )
    expect(screen.getByText('1 climb tested')).toBeInTheDocument()
    expect(screen.getByText('1 run, 1 ride')).toBeInTheDocument()
  })
})
