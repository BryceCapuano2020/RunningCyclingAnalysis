// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnalysisResult } from '@rca/core/pipeline'
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

function renderCard(result: AnalysisResult, units: UnitSystem = 'metric', weighted = true) {
  return render(<CrossSportCard result={result} units={units} weighted={weighted} />)
}

/** The ride the best 20 minutes came from, measured or virtual, as the result holds it. */
function rideWith(powerSource: 'measured' | 'virtual' | 'none') {
  return makeActivity({ ...hillRide, powerSource })
}

/** The disclosure that opens to every duration, found by its summary. */
function everyDuration(): HTMLElement {
  const details = screen.getByText('See every duration').closest('details')
  if (!details) throw new Error('No disclosure for every duration')
  return details
}

describe('CrossSportCard', () => {
  it('states the bike fitness as a flat running pace, with the cycling effort it comes from', () => {
    renderCard(makeResult({ equivalents: [makeEquivalence({ durationS: 1200, ridePowerW: 250 })] }))

    expect(
      screen.getByRole('heading', { level: 2, name: 'On foot, your ride is worth 4:10 /km' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Across sports')).toBeInTheDocument()
    // The ride that set the effort is not in this result, so its watts count as estimated.
    expect(
      screen.getByText(
        'Your best 20 min on the bike, 250 W (estimated), takes the same effort as running 4:10 per kilometre on the flat.',
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
        'Your best 20 min on the bike, 250 W, takes the same effort as running 4:10 per kilometre on the flat.',
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
    expect(screen.queryByText('See every duration')).not.toBeInTheDocument()
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
      screen.getByRole('heading', { level: 2, name: 'On foot, your ride is worth 6:42 /mi' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/running 6:42 per mile on the flat\.$/)).toBeInTheDocument()
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

    expect(screen.getByRole('link', { name: 'Set on Hill ride, Fri 9 Jan' })).toHaveAttribute(
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

  it('asks for a ride of 3 min when there is no effort to compare', () => {
    renderCard(makeResult({ activities: [hillRide], equivalents: [] }))

    expect(screen.getByRole('heading', { level: 2, name: 'Your ride on foot' })).toBeInTheDocument()
    expect(screen.getByText('Needs a ride of 3 min or more.')).toBeInTheDocument()
    expect(screen.queryByText('See every duration')).not.toBeInTheDocument()
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
    expect(screen.queryByText('See every duration')).not.toBeInTheDocument()
  })

  it('takes no room on a file with no rides, so a run-only balance shows no cross-sport slot', () => {
    const { container } = renderCard(makeResult({ activities: [], equivalents: [] }))
    expect(container).toBeEmptyDOMElement()
  })
})
