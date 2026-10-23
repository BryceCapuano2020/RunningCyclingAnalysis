// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnalysisResult } from '@rca/core/pipeline'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import { ROAD_STANDARDS_SOURCE } from '@rca/core/grade'
import { curvePoint } from '../charts/fixtures'
import {
  FIVE_K_IN_20_MIN_WKG,
  MAN_BORN_1986,
  flatWkg,
  interval,
  makeActivity,
  makeEquivalence,
  makeResult,
} from '../components/fixtures'
import type { AgeProfile } from '../grades'
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
  profile: AgeProfile | null = null,
) {
  return render(
    <SportPage
      sport={sport}
      result={result}
      units={units}
      massKg={75}
      profile={profile}
      controls={<span>Period picker</span>}
    />,
  )
}

/** The record list item for one duration, found by its eyebrow such as "Best 20 min". */
function recordNamed(records: HTMLElement, eyebrow: string): HTMLElement {
  const item = within(records).getByText(eyebrow).closest('li')
  if (item === null) throw new Error(`No record named ${eyebrow}`)
  return item
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

describe('SportPage age grades', () => {
  it('shows a run record’s estimate where the run covers a mile to 200 km', () => {
    renderPage(
      'run',
      makeResult({
        activities: [morningRun],
        runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
      }),
      'metric',
      MAN_BORN_1986,
    )

    const records = screen.getByRole('region', { name: 'Best efforts' })
    expect(
      within(recordNamed(records, 'Best 20 min')).getByText('Estimated age grade 67.6% · Local'),
    ).toBeInTheDocument()
  })

  it('shows no grade for a run record that covers under a mile', () => {
    renderPage(
      'run',
      makeResult({
        activities: [morningRun],
        // 60 s at 8 m/s covers 480 m.
        runCurve: [curvePoint(60, flatWkg(8), 'run-1')],
      }),
      'metric',
      MAN_BORN_1986,
    )

    const records = screen.getByRole('region', { name: 'Best efforts' })
    expect(recordNamed(records, 'Best 1 min').textContent).not.toMatch(/Estimated age grade/)
  })

  it('shows a ride record’s estimate with its range', () => {
    const ride = makeActivity({ id: 'ride-1', sport: 'ride', name: 'Hill ride' })
    renderPage(
      'ride',
      makeResult({
        activities: [ride],
        rideCurve: [curvePoint(HEADLINE_DURATION_S, 400, 'ride-1')],
        equivalents: [
          makeEquivalence({
            durationS: HEADLINE_DURATION_S,
            runSpeed: interval(3.9, 5000 / HEADLINE_DURATION_S, 4.4),
          }),
        ],
      }),
      'metric',
      MAN_BORN_1986,
    )

    const records = screen.getByRole('region', { name: 'Best efforts' })
    expect(
      within(recordNamed(records, 'Best 20 min')).getByText(
        'Estimated age grade 67.6% · Local (63–71.5%)',
      ),
    ).toBeInTheDocument()
  })

  it('names the standards under Best efforts when a record shows a grade', () => {
    renderPage(
      'run',
      makeResult({
        activities: [morningRun],
        runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
      }),
      'metric',
      MAN_BORN_1986,
    )

    const records = screen.getByRole('region', { name: 'Best efforts' })
    const source = within(records).getByText(/Age grades for a man are estimates against the/)
    expect(source).toHaveTextContent(
      'Age is counted from your birth year on the date of each effort',
    )
    expect(
      within(source).getByRole('link', { name: 'USATF road age standards (2025)' }),
    ).toHaveAttribute('href', ROAD_STANDARDS_SOURCE.url)
  })

  it('names the sex the record grades are for on the source line', () => {
    renderPage(
      'run',
      makeResult({
        activities: [morningRun],
        runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
      }),
      'metric',
      { birthYear: 1986, sex: 'female' },
    )

    const records = screen.getByRole('region', { name: 'Best efforts' })
    expect(within(records).getByText(/Age grades for a woman are estimates/)).toBeInTheDocument()
  })

  it('says a ride’s range is its model range on the ride page only', () => {
    const runPage = renderPage(
      'run',
      makeResult({
        activities: [morningRun],
        runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
      }),
      'metric',
      MAN_BORN_1986,
    )
    expect(screen.getByText(/Age grades for a man are estimates/)).toBeInTheDocument()
    expect(screen.queryByText(/model range/)).not.toBeInTheDocument()
    runPage.unmount()

    const ride = makeActivity({ id: 'ride-1', sport: 'ride', name: 'Hill ride' })
    renderPage(
      'ride',
      makeResult({
        activities: [ride],
        rideCurve: [curvePoint(HEADLINE_DURATION_S, 400, 'ride-1')],
        equivalents: [
          makeEquivalence({
            durationS: HEADLINE_DURATION_S,
            runSpeed: interval(3.9, 5000 / HEADLINE_DURATION_S, 4.4),
          }),
        ],
      }),
      'metric',
      MAN_BORN_1986,
    )
    const records = screen.getByRole('region', { name: 'Best efforts' })
    expect(within(records).getByText(/a ride’s range is its model range/)).toBeInTheDocument()
  })

  it('shows no grades, and no standards line, without the year of birth and sex', () => {
    renderPage(
      'run',
      makeResult({
        activities: [morningRun],
        runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
      }),
    )

    expect(screen.queryByText(/Estimated age grade/)).not.toBeInTheDocument()
    expect(screen.queryByText(/are estimates against the/)).not.toBeInTheDocument()
  })
})
