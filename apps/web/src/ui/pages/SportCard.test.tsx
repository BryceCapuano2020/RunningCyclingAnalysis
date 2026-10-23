// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { UnitSystem } from '@rca/core/units'
import { curvePoint } from '../charts/fixtures'
import { makeActivity, makeResult } from '../components/fixtures'
import { SportCard } from './SportCard'

// A fixed clock, so the year on each record date does not depend on when the suite runs.
const NOW = new Date(2026, 5, 10, 12).getTime()

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// Local dates: 5 January 2026 is a Monday and 9 January 2026 a Friday.
const runOnMonday = makeActivity({
  id: 'run-1',
  name: 'Morning run',
  sport: 'run',
  startMs: new Date(2026, 0, 5, 7, 30).getTime(),
})
const rideOnFriday = makeActivity({
  id: 'ride-1',
  name: 'Hill ride',
  sport: 'ride',
  startMs: new Date(2026, 0, 9, 17, 0).getTime(),
})

function renderCard(sport: 'run' | 'ride', result: AnalysisResult, units: UnitSystem = 'metric') {
  return render(<SportCard sport={sport} result={result} units={units} massKg={75} />)
}

/** The card for one sport, named by its heading. */
function cardNamed(name: 'Run' | 'Ride'): HTMLElement {
  return screen.getByRole('region', { name })
}

describe('SportCard without activities of its sport', () => {
  it('says runs are needed to see the running balance, and still links to the running records', () => {
    renderCard('run', makeResult({ activities: [rideOnFriday], runCurve: [] }))

    const card = cardNamed('Run')
    expect(
      within(card).getByText('Add runs to see your running and your balance.'),
    ).toBeInTheDocument()
    expect(within(card).queryByText('Threshold pace, estimated')).not.toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'All running records' })).toHaveAttribute(
      'href',
      '#/run',
    )
  })

  it('says rides are needed to see the cycling balance', () => {
    renderCard('ride', makeResult({ activities: [runOnMonday], rideCurve: [] }))

    const card = cardNamed('Ride')
    expect(
      within(card).getByText('Add rides to see your cycling and your balance.'),
    ).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'All cycling records' })).toHaveAttribute(
      'href',
      '#/ride',
    )
  })
})

describe('SportCard threshold', () => {
  it('shows the running threshold as a named pace estimate', () => {
    renderCard('run', makeResult({ activities: [runOnMonday] }))

    const card = cardNamed('Run')
    expect(within(card).getByText('Threshold pace, estimated')).toBeInTheDocument()
    expect(within(card).getByText('23:23 /km')).toBeInTheDocument()
  })

  it('shows the running threshold in miles for imperial', () => {
    renderCard('run', makeResult({ activities: [runOnMonday] }), 'imperial')
    expect(within(cardNamed('Run')).getByText('37:38 /mi')).toBeInTheDocument()
  })

  it('shows the cycling threshold in watts with its W/kg for the body mass', () => {
    renderCard('ride', makeResult({ activities: [rideOnFriday] }))

    const card = cardNamed('Ride')
    expect(within(card).getByText('Threshold power, estimated')).toBeInTheDocument()
    expect(within(card).getByText('48 W')).toBeInTheDocument()
    expect(within(card).getByText('0.6 W/kg')).toBeInTheDocument()
  })

  it('asks for a hard effort instead of a number when a sport has no threshold yet', () => {
    renderCard('run', makeResult({ activities: [runOnMonday], runCp: null }))

    const card = cardNamed('Run')
    expect(within(card).getByText('Needs a hard effort of 2 to 20 minutes.')).toBeInTheDocument()
    expect(card.querySelector('.hero-number')).toBeNull()
  })

  it('asks for a hard effort on the cycling card when there is no cycling threshold', () => {
    renderCard('ride', makeResult({ activities: [rideOnFriday], rideCp: null }))

    const card = cardNamed('Ride')
    expect(within(card).getByText('Needs a hard effort of 2 to 20 minutes.')).toBeInTheDocument()
    expect(within(card).queryByText(/W\/kg/)).not.toBeInTheDocument()
  })
})

describe('SportCard records', () => {
  it('lists the 5, 20 and 60 minute bests, each with the friendly day it was set', () => {
    renderCard(
      'run',
      makeResult({
        activities: [runOnMonday],
        runCurve: [
          curvePoint(60, 5.5, 'run-1'),
          curvePoint(300, 4.1, 'run-1'),
          curvePoint(1200, 3.6, 'run-1'),
          curvePoint(3600, 3.1, 'run-1'),
        ],
      }),
    )

    const card = cardNamed('Run')
    const records = within(card).getAllByRole('listitem')
    expect(records).toHaveLength(3)
    expect(within(card).getByText('5 min')).toBeInTheDocument()
    expect(within(card).getByText('20 min')).toBeInTheDocument()
    expect(within(card).getByText('1 h')).toBeInTheDocument()
    expect(within(card).queryByText('1 min')).not.toBeInTheDocument()
  })

  it('links each record to the activity that set it, named with the day it was set', () => {
    renderCard(
      'run',
      makeResult({
        activities: [runOnMonday],
        runCurve: [curvePoint(1200, 3.6, 'run-1')],
      }),
    )

    expect(
      within(cardNamed('Run')).getByRole('link', { name: 'Morning run, Mon 5 Jan' }),
    ).toHaveAttribute('href', '#/activities/run-1')
  })

  it('keeps a record’s value but drops its link when its activity is not in the result', () => {
    renderCard(
      'run',
      makeResult({
        activities: [runOnMonday],
        runCurve: [curvePoint(1200, 3.6, 'gone')],
      }),
    )

    const card = cardNamed('Run')
    expect(within(card).getByText('20 min')).toBeInTheDocument()
    expect(within(card).queryByRole('link', { name: /Mon 5 Jan/ })).not.toBeInTheDocument()
  })

  it('shows cycling records in watts, linked to the ride that set them', () => {
    renderCard(
      'ride',
      makeResult({
        activities: [rideOnFriday],
        rideCurve: [curvePoint(300, 400, 'ride-1')],
      }),
    )

    const card = cardNamed('Ride')
    expect(within(card).getByText('400 W')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Hill ride, Fri 9 Jan' })).toHaveAttribute(
      'href',
      '#/activities/ride-1',
    )
  })

  it('shows no record list when the sport has no best efforts at those durations', () => {
    renderCard('ride', makeResult({ activities: [rideOnFriday], rideCurve: [] }))
    expect(within(cardNamed('Ride')).queryByRole('listitem')).not.toBeInTheDocument()
  })
})
