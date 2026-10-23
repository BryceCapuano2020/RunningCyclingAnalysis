// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnalysisResult } from '@rca/core/pipeline'
import { curvePoint } from '../charts/fixtures'
import { makeActivity, makeResult } from '../components/fixtures'
import { SportPage } from './SportPage'

// A fixed clock, so the friendly record dates do not depend on when the suite runs.
const NOW = new Date(2026, 5, 10, 12).getTime()

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// Local dates: 5 January 2026 is a Monday.
const morningRun = makeActivity({
  id: 'run-1',
  name: 'Morning run',
  sport: 'run',
  startMs: new Date(2026, 0, 5, 7, 30).getTime(),
})

function renderPage(
  sport: 'run' | 'ride',
  result: AnalysisResult,
  units: 'metric' | 'imperial' = 'metric',
) {
  return render(
    <SportPage
      sport={sport}
      result={result}
      units={units}
      massKg={75}
      controls={<span>Period picker</span>}
    />,
  )
}

describe('SportPage', () => {
  it('is the sport’s own page heading, with the period control beside it', () => {
    renderPage('run', makeResult({ activities: [morningRun] }))

    const heading = screen.getByRole('heading', { level: 1, name: 'Run' })
    expect(heading).toHaveAttribute('id', 'page-heading')
    expect(heading).toHaveAttribute('tabindex', '-1')
    expect(screen.getByText('Period picker')).toBeInTheDocument()
  })

  it('asks for runs when there are none in the period', () => {
    renderPage('run', makeResult({ activities: [makeActivity({ id: 'ride', sport: 'ride' })] }))

    expect(
      screen.getByText('No runs in this period. Add runs to see your records.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Best efforts' })).not.toBeInTheDocument()
  })

  it('asks for rides when there are none in the period', () => {
    renderPage('ride', makeResult({ activities: [morningRun] }))

    expect(
      screen.getByText('No rides in this period. Add rides to see your records.'),
    ).toBeInTheDocument()
  })

  it('shows the running threshold as a named pace estimate, and what it rests on', () => {
    renderPage('run', makeResult({ activities: [morningRun] }))

    const section = screen.getByRole('region', { name: 'Threshold pace, estimated' })
    expect(within(section).getByText('23:23 /km')).toBeInTheDocument()
    expect(within(section).getByText('Based on 1 run in this period.')).toBeInTheDocument()
  })

  it('pluralises what the threshold rests on for several rides', () => {
    const ride = makeActivity({ id: 'ride-1', sport: 'ride' })
    renderPage(
      'ride',
      makeResult({ activities: [ride, makeActivity({ id: 'ride-2', sport: 'ride' })] }),
    )

    expect(screen.getByText('Based on 2 rides in this period.')).toBeInTheDocument()
  })

  it('shows the cycling threshold in watts with its W/kg', () => {
    renderPage('ride', makeResult({ activities: [makeActivity({ id: 'ride-1', sport: 'ride' })] }))

    expect(screen.getByText('Threshold power, estimated')).toBeInTheDocument()
    expect(screen.getByText('48 W')).toBeInTheDocument()
    expect(screen.getByText('0.6 W/kg')).toBeInTheDocument()
  })

  it('asks for harder efforts when no threshold can be estimated', () => {
    renderPage('run', makeResult({ activities: [morningRun], runCp: null }))

    expect(
      screen.getByText('Needs harder efforts of 2 to 20 minutes to estimate a threshold.'),
    ).toBeInTheDocument()
  })

  it('explains that run paces are grade-adjusted', () => {
    renderPage('run', makeResult({ activities: [morningRun] }))

    expect(
      screen.getByText('Paces are grade-adjusted: the flat pace with the same effort.'),
    ).toBeInTheDocument()
  })

  it('lists the best effort at each record duration, linked to the activity that set it', () => {
    renderPage(
      'run',
      makeResult({
        activities: [morningRun],
        runCurve: [
          curvePoint(60, 5.5, 'run-1'),
          curvePoint(300, 4.1, 'run-1'),
          curvePoint(1200, 3.6, 'run-1'),
          curvePoint(3600, 3.1, 'run-1'),
        ],
      }),
    )

    const records = screen.getByRole('region', { name: 'Best efforts' })
    expect(within(records).getByText('Best 1 min')).toBeInTheDocument()
    expect(within(records).getByText('Best 5 min')).toBeInTheDocument()
    expect(within(records).getByText('Best 20 min')).toBeInTheDocument()
    expect(within(records).getByText('Best 1 h')).toBeInTheDocument()
    expect(
      within(records).getAllByRole('link', { name: 'Morning run, Mon 5 Jan' })[0],
    ).toHaveAttribute('href', '#/activities/run-1')
  })

  it('shows the best cycling efforts in watts with W/kg', () => {
    renderPage(
      'ride',
      makeResult({
        activities: [makeActivity({ id: 'ride-1', sport: 'ride', name: 'Hill ride' })],
        rideCurve: [curvePoint(60, 400, 'ride-1')],
      }),
    )

    const records = screen.getByRole('region', { name: 'Best efforts' })
    expect(within(records).getByText('400 W')).toBeInTheDocument()
    expect(within(records).getByText('5.3 W/kg')).toBeInTheDocument()
  })

  it('leaves the grade-adjusted note off the cycling page', () => {
    renderPage('ride', makeResult({ activities: [makeActivity({ id: 'ride-1', sport: 'ride' })] }))

    expect(
      screen.queryByText('Paces are grade-adjusted: the flat pace with the same effort.'),
    ).not.toBeInTheDocument()
  })

  it('shows every duration as a chart section', () => {
    renderPage('run', makeResult({ activities: [morningRun] }))

    expect(screen.getByRole('region', { name: 'Every duration' })).toBeInTheDocument()
  })
})
