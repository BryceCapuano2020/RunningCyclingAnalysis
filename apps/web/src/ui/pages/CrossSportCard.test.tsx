// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Period } from '@rca/core/period'
import type { UnitSystem } from '@rca/core/units'
import { curvePoint } from '../charts/fixtures'
import { interval, makeActivity, makeEquivalence, makeResult } from '../components/fixtures'
import { CrossSportCard } from './CrossSportCard'

// A fixed clock, so the year on the ride's date does not depend on when the suite runs.
const NOW = new Date(2026, 5, 10, 12).getTime()

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// Local date: 9 January 2026 is a Friday.
const hillRide = makeActivity({
  id: 'ride-1',
  name: 'Hill ride',
  sport: 'ride',
  startMs: new Date(2026, 0, 9, 17, 0).getTime(),
})

/** A ride under the 3 min an equivalence needs, so no power curve can be read from it. */
const shortRide = makeActivity({
  id: 'ride-2',
  name: 'Warm-up spin',
  sport: 'ride',
  startMs: new Date(2026, 0, 10, 17, 0).getTime(),
  durationS: 120,
})

const ALL_TIME_PERIOD: Period = {
  choice: 'all',
  startMs: null,
  endMs: null,
  days: null,
  fellBack: false,
}
/** A six-week period from 12 May to 3 August 2025, dated in the viewer's zone. */
const SIX_WEEKS: Period = {
  choice: 42,
  startMs: new Date(2025, 4, 12, 12).getTime(),
  endMs: new Date(2025, 7, 3, 12).getTime(),
  days: 42,
  fellBack: false,
}

function renderCard(
  result: AnalysisResult,
  units: UnitSystem = 'metric',
  weighted = true,
  period: Period = ALL_TIME_PERIOD,
) {
  return render(
    <CrossSportCard result={result} units={units} weighted={weighted} period={period} />,
  )
}

/** The ride the best 20 minutes came from, measured or virtual, as the result holds it. */
function rideWith(powerSource: 'measured' | 'virtual' | 'none') {
  return makeActivity({ ...hillRide, powerSource })
}

/** The disclosure that opens to every duration, found by its summary. */
function everyDuration(): HTMLElement {
  const details = screen.getByText('See the pace curve').closest('details')
  if (!details) throw new Error('No disclosure for every duration')
  return details
}

describe('CrossSportCard', () => {
  it.each([
    ['metric', /worth \d+:\d{2}\u00a0\/km$/],
    ['imperial', /worth \d+:\d{2}\u00a0\/mi$/],
  ] as const)(
    'joins the %s unit to its pace with a non-breaking space, so the unit never starts a line',
    (units, pattern) => {
      renderCard(
        makeResult({ equivalents: [makeEquivalence({ durationS: 1200, ridePowerW: 250 })] }),
        units,
      )
      expect(screen.getByRole('heading', { level: 2 }).textContent).toMatch(pattern)
    },
  )

  it('states the bike fitness as a flat running pace, with the cycling effort it comes from', () => {
    renderCard(makeResult({ equivalents: [makeEquivalence({ durationS: 1200, ridePowerW: 250 })] }))

    expect(
      screen.getByRole('heading', { level: 2, name: 'On foot, your ride is worth 4:10\u00a0/km' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Across sports')).toBeInTheDocument()
    // The ride that set the effort is not in this result, so its watts count as estimated.
    expect(
      screen.getByText(
        'Your best 20 min on the bike, 250 W (estimated), takes the same effort as running on the flat.',
      ),
    ).toBeInTheDocument()
  })

  it('tags the watts estimated when the ride that set the effort had virtual power', () => {
    renderCard(
      makeResult({
        activities: [rideWith('virtual')],
        rideCurve: [curvePoint(1200, 250, 'ride-1')],
        equivalents: [makeEquivalence({ durationS: 1200, ridePowerW: 250 })],
      }),
    )
    expect(screen.getByText(/250 W \(estimated\), takes the same effort/)).toBeInTheDocument()
  })

  it('leaves the estimate tag off the watts when the ride had a power meter', () => {
    renderCard(
      makeResult({
        activities: [rideWith('measured')],
        rideCurve: [curvePoint(1200, 250, 'ride-1')],
        equivalents: [makeEquivalence({ durationS: 1200, ridePowerW: 250 })],
      }),
    )
    expect(
      screen.getByText(
        'Your best 20 min on the bike, 250 W, takes the same effort as running on the flat.',
      ),
    ).toBeInTheDocument()
  })

  it('holds the ride figures without a weight, with the same prompt as the cards', () => {
    renderCard(
      makeResult({
        activities: [rideWith('measured')],
        rideCurve: [curvePoint(1200, 250, 'ride-1')],
        equivalents: [makeEquivalence({ durationS: 1200, ridePowerW: 250 })],
      }),
      'metric',
      false,
    )

    expect(screen.getByRole('heading', { level: 2, name: 'Your ride on foot' })).toBeInTheDocument()
    expect(screen.queryByText(/4:10/)).not.toBeInTheDocument()
    expect(screen.queryByText(/250 W/)).not.toBeInTheDocument()
    expect(screen.queryByText('See the pace curve')).not.toBeInTheDocument()
    expect(screen.getByText(/Add your weight on/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '#/profile')
  })

  it('is a quiet section, not a bordered card, because it is an idea and not an action', () => {
    const { container } = renderCard(
      makeResult({ equivalents: [makeEquivalence({ durationS: 1200, ridePowerW: 250 })] }),
    )
    expect(container.querySelector('section')).not.toHaveClass('card')
  })

  it('gives the pace per mile for imperial', () => {
    renderCard(
      makeResult({ equivalents: [makeEquivalence({ durationS: 1200, ridePowerW: 250 })] }),
      'imperial',
    )

    expect(
      screen.getByRole('heading', { level: 2, name: 'On foot, your ride is worth 6:42\u00a0/mi' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/takes the same effort as running on the flat\.$/)).toBeInTheDocument()
    expect(screen.queryByText(/6:42/, { selector: 'p' })).not.toBeInTheDocument()
  })

  it('features the 20 minute effort rather than a shorter or longer one', () => {
    renderCard(
      makeResult({
        equivalents: [
          makeEquivalence({ durationS: 600, ridePowerW: 300 }),
          makeEquivalence({ durationS: 1200, ridePowerW: 250 }),
          makeEquivalence({ durationS: 3600, ridePowerW: 200 }),
        ],
      }),
    )

    expect(
      screen.getByText(/on the bike, 250 W \(estimated\), takes the same effort/),
    ).toBeInTheDocument()
  })

  it('names the ride that set the effort, linked to its activity page with the day', () => {
    renderCard(
      makeResult({
        activities: [hillRide],
        rideCurve: [curvePoint(1200, 250, 'ride-1')],
        equivalents: [makeEquivalence({ durationS: 1200 })],
      }),
    )

    expect(screen.getByRole('link', { name: 'Set on Hill ride, 9 Jan' })).toHaveAttribute(
      'href',
      '#/activities/ride-1',
    )
  })

  it('names no ride when the activity that set the effort is not in the result', () => {
    renderCard(
      makeResult({
        activities: [hillRide],
        rideCurve: [curvePoint(1200, 250, 'gone')],
        equivalents: [makeEquivalence({ durationS: 1200 })],
      }),
    )

    expect(screen.queryByRole('link', { name: /Set on/ })).not.toBeInTheDocument()
  })

  it('opens to every duration, as a table closed under the headline', () => {
    renderCard(
      makeResult({
        equivalents: [
          makeEquivalence({ durationS: 600, ridePowerW: 300 }),
          makeEquivalence({ durationS: 1200, ridePowerW: 250 }),
          makeEquivalence({ durationS: 3600, ridePowerW: 200 }),
        ],
      }),
    )

    const details = everyDuration()
    expect(details).not.toHaveAttribute('open')
    expect(within(details).getByRole('columnheader', { name: 'Ride effort' })).toBeInTheDocument()
    expect(within(details).getAllByRole('row')).toHaveLength(4)
  })

  it('names the dates the period covers in its needs-a-ride line', () => {
    renderCard(makeResult({ activities: [shortRide], equivalents: [] }), 'metric', true, SIX_WEEKS)
    expect(
      screen.getByText('Needs a ride of 3 min or more between 12 May and 3 Aug 2025.'),
    ).toBeInTheDocument()
  })

  it('asks for a ride of 3 min when no ride is that long', () => {
    renderCard(makeResult({ activities: [shortRide], equivalents: [] }))

    expect(screen.getByRole('heading', { level: 2, name: 'Your ride on foot' })).toBeInTheDocument()
    expect(screen.getByText('Needs a ride of 3 min or more.')).toBeInTheDocument()
    expect(screen.queryByText('See the pace curve')).not.toBeInTheDocument()
  })

  it('names the power as the missing reason when a ride is long enough but has no power curve', () => {
    renderCard(makeResult({ activities: [hillRide], equivalents: [] }))

    expect(screen.getByRole('heading', { level: 2, name: 'Your ride on foot' })).toBeInTheDocument()
    expect(screen.getByText('Needs a ride of 3 min or more with power.')).toBeInTheDocument()
    expect(screen.queryByText('Needs a ride of 3 min or more.')).not.toBeInTheDocument()
  })

  it('names the power and the dates when a long ride has no power curve in the period', () => {
    renderCard(makeResult({ activities: [hillRide], equivalents: [] }), 'metric', true, SIX_WEEKS)
    expect(
      screen.getByText('Needs a ride of 3 min or more with power between 12 May and 3 Aug 2025.'),
    ).toBeInTheDocument()
  })

  it('asks for a ride instead of a pace when the effort gives no valid running pace', () => {
    renderCard(
      makeResult({
        activities: [hillRide],
        equivalents: [makeEquivalence({ durationS: 1200, runSpeed: interval(0, 0, 0) })],
      }),
    )

    expect(screen.getByRole('heading', { level: 2, name: 'Your ride on foot' })).toBeInTheDocument()
    expect(screen.getByText('Needs a ride of 3 min or more.')).toBeInTheDocument()
    expect(screen.queryByText('See the pace curve')).not.toBeInTheDocument()
  })

  it('takes no room on a file with no rides, so a run-only balance shows no cross-sport slot', () => {
    const { container } = renderCard(makeResult({ activities: [], equivalents: [] }))
    expect(container).toBeEmptyDOMElement()
  })
})

describe('CrossSportCard pace unit', () => {
  it('sets the pace unit apart, so the upper-case headline does not turn it into capitals', () => {
    renderCard(makeResult({ equivalents: [makeEquivalence({ durationS: 1200, ridePowerW: 250 })] }))
    const heading = screen.getByRole('heading', {
      level: 2,
      name: 'On foot, your ride is worth 4:10\u00a0/km',
    })
    expect(heading.querySelector('.unit')).toHaveTextContent('/km')
  })
})
