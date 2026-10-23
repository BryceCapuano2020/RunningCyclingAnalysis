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

function renderCard(result: AnalysisResult, units: UnitSystem = 'metric') {
  return render(<CrossSportCard result={result} units={units} />)
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
      screen.getByRole('heading', { level: 2, name: 'On foot, your bike is worth 4:10 /km' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Cross-sport')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Your best 20 min on the bike, 250 W, uses the same energy as running 4:10 per kilometre on the flat.',
      ),
    ).toBeInTheDocument()
  })

  it('gives the pace per mile for imperial', () => {
    renderCard(
      makeResult({ equivalents: [makeEquivalence({ durationS: 1200, ridePowerW: 250 })] }),
      'imperial',
    )

    expect(
      screen.getByRole('heading', { level: 2, name: 'On foot, your bike is worth 6:42 /mi' }),
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

    expect(screen.getByText(/on the bike, 250 W, uses the same energy/)).toBeInTheDocument()
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
    expect(
      within(details).getByRole('columnheader', { name: 'Cycling effort' }),
    ).toBeInTheDocument()
    expect(within(details).getAllByRole('row')).toHaveLength(4)
  })

  it('asks for a ride of five minutes when there is no effort to compare', () => {
    renderCard(makeResult({ equivalents: [] }))

    expect(screen.getByRole('heading', { level: 2, name: 'Your bike on foot' })).toBeInTheDocument()
    expect(screen.getByText('Needs a ride of five minutes or more.')).toBeInTheDocument()
    expect(screen.queryByText('See every duration')).not.toBeInTheDocument()
  })

  it('asks for a ride instead of a pace when the effort gives no valid running pace', () => {
    renderCard(
      makeResult({
        equivalents: [makeEquivalence({ durationS: 1200, runSpeed: interval(0, 0, 0) })],
      }),
    )

    expect(screen.getByRole('heading', { level: 2, name: 'Your bike on foot' })).toBeInTheDocument()
    expect(screen.getByText('Needs a ride of five minutes or more.')).toBeInTheDocument()
    expect(screen.queryByText('See every duration')).not.toBeInTheDocument()
  })
})
