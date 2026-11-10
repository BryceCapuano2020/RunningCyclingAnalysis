// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { MeasureTime } from '@rca/core/zones'
import {
  makeActivity,
  makeResult,
  makeRideThreshold,
  makeRunThreshold,
} from '../components/test/fixtures'
import { NO_HEART_RATE, UNKNOWN } from '../test/effortGateFixtures'
import { profileActivities, profileCurve } from '../test/profileFixtures'
import { paceFigure } from '../records'
import { measureTime } from '../test/zoneTimeFixtures'
import { openSection } from '../test/openSection'
import { NO_FITNESS } from '@rca/core/fitness/types'
import { RIDE_SLIPPING, SLIPPING } from '../test/fitnessFixtures'
import { SportPage } from './SportPage'
import { openDetail } from '../test/openDetail'
import { rowValue } from '../test/propertyRows'

afterEach(cleanup)

/** Ten hours of a run's heart rate over eight runs, mostly in zone 2, so the section has something to say. */
const RUN_ZONES: MeasureTime[] = [
  measureTime('run', 'heartRate', [3600, 21_600, 7200, 3600, 0]),
  measureTime('run', 'pace', [0, 0, 0, 0, 0], { counted: 0 }),
]

function renderPage(sport: Sport, result: AnalysisResult, zoneTimes?: readonly MeasureTime[]) {
  return render(
    <SportPage
      sport={sport}
      result={result}
      previous={null}
      previousLabel={null}
      zoneTimes={zoneTimes}
      change={null}
      units="metric"
      massKg={75}
      weighted
      profile={null}
      missingAge={null}
      rangeDays={42}
      controls={<span>Period picker</span>}
      footnote={<p>Page footnote</p>}
      emptyText="Nothing in this period."
      inLibrary={result.activities.filter((activity) => activity.sport === sport).length}
      library={result.activities}
      onAddFiles={vi.fn()}
    />,
  )
}

const headings = () =>
  screen
    .getAllByRole('heading', { level: 2 })
    .map((heading) => heading.getAttribute('aria-label') ?? heading.textContent)

/** Whether b comes after a in the document. */
const follows = (a: Node, b: Node) =>
  (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

const withBests = makeActivity({
  id: 'races',
  sport: 'run',
  distanceM: 10_000,
  distanceBests: [
    { distanceM: 5000, seconds: 21 * 60 },
    { distanceM: 10000, seconds: 44 * 60 },
  ],
})

/**
 * A run athlete with everything to show: a best that stands out, race predictions, a change. A run's
 * profile has no short anchor, so its fit is loose and a best must stand well clear to be named.
 */
function fullRun(): AnalysisResult {
  return makeResult({
    activities: [...profileActivities('run'), withBests],
    runCurve: profileCurve((durationS, value) => (durationS === 300 ? value * 1.3 : value)),
  })
}

describe('a sport page with everything to show', () => {
  it('reads answer, history, best efforts, race predictions and time in zones, in that order', () => {
    renderPage('run', fullRun(), RUN_ZONES)
    // The page is given no look-back here, so the years are one line in their place.
    expect(headings()).toEqual([
      'Threshold pace',
      'History',
      'Best efforts',
      'Race predictions',
      'Time in zones',
    ])
  })

  it('has no heading of its own for the curve’s title', () => {
    renderPage('run', fullRun(), RUN_ZONES)
    expect(screen.queryByRole('heading', { name: 'Pace curve' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Not enough yet' })).toBeNull()
  })

  it('draws no strip of tiles under the curve and no stand-out finding', () => {
    renderPage('run', fullRun(), RUN_ZONES)
    const section = screen.getByRole('region', { name: 'Best efforts' })
    expect(within(section).queryByRole('list', { name: 'Best efforts' })).toBeNull()
    expect(section.querySelector('ol.records, .record-tiles')).toBeNull()
    expect(within(section).queryByText(/^Your 5 min best is/)).toBeNull()
  })

  it('never uses the words the page has banned', () => {
    const { container } = renderPage('run', fullRun(), RUN_ZONES)
    const text = (container.textContent ?? '').toLowerCase()
    for (const word of ['limiter', 'weak', 'strength', 'holding you back', 'ahead of']) {
      expect(text).not.toContain(word)
    }
  })
})

describe('race predictions where the effort could not be checked', () => {
  it('asks for no heart rate under the threshold, and carries every run’s bests as a prediction', () => {
    const result = { ...fullRun(), effortGate: { run: NO_HEART_RATE, ride: UNKNOWN } }
    renderPage('run', result, RUN_ZONES)
    openSection('Race predictions')
    const threshold = screen.getByRole('region', { name: 'Threshold pace' })
    expect(threshold.querySelector('.sport-hero__number')).not.toBeNull()
    expect(screen.queryByText(/so the effort was not checked/)).toBeNull()
    expect(screen.queryByText('No slower than')).toBeNull()
  })

  it('says nothing of it where the effort was checked', () => {
    renderPage('run', fullRun(), RUN_ZONES)
    openSection('Race predictions')
    expect(screen.queryByText(/Effort not checked/)).toBeNull()
  })
})

describe('a sport page with sections that have nothing to show', () => {
  const newRun = () => makeResult({ activities: [makeActivity({ id: 'run-1', sport: 'run' })] })

  /** The one line a section says in its own place. */
  const lineIn = (name: string) =>
    screen.getByRole('region', { name }).querySelector('p.muted')?.textContent

  it('says one line in each empty section’s own place, and names the section', () => {
    renderPage('run', newRun())
    expect(headings()).toEqual([
      'Threshold pace',
      'History',
      'Best efforts',
      'Race predictions',
      'Time in zones',
    ])
    expect(lineIn('History')).toBe('Needs a year of runs.')
    expect(lineIn('Race predictions')).toBe('Needs a run of a mile or more.')
    expect(lineIn('Time in zones')).toBe(
      'Needs an activity with heart rate, or a threshold pace entered on Profile.',
    )
  })

  it('has no list of what is missing, no empty section is a fold, and no jump list', () => {
    renderPage('run', newRun())
    expect(screen.queryByText('Not enough yet')).toBeNull()
    expect(screen.queryByRole('region', { name: 'Not enough yet' })).toBeNull()
    expect(screen.getByRole('region', { name: 'History' }).closest('details')).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'On this page' })).toBeNull()
  })

  it('keeps the lines in the sections’ own order, before the footnote', () => {
    renderPage('run', newRun())
    const zones = screen.getByRole('region', { name: 'Time in zones' })
    expect(follows(zones, screen.getByText('Page footnote'))).toBe(true)
  })

  it('gives a ride no race predictions, which it has none to give', () => {
    renderPage('ride', makeResult({ activities: [makeActivity({ id: 'ride-1', sport: 'ride' })] }))
    expect(screen.queryByRole('region', { name: 'Race predictions' })).toBeNull()
  })
})

describe('the run threshold whatever the fit does', () => {
  const uneven = {
    fit: { cp: 4.4, wPrime: 15, cpSe: 0.04, r2: 0.98, nPoints: 5 },
    leftOutS: [900, 1200],
    floor: 3.2,
  }
  const pace = (wkg: number) => paceFigure(wkg, 'metric').number
  const notHard = {
    ...UNKNOWN,
    verdict: 'notHard' as const,
    unchecked: null,
    floor: { durationS: 1800, value: 3 },
  }

  it('is the plain "Threshold pace" with the estimate as its figure when the fit is refused, whatever the gate holds', () => {
    const run = makeActivity({ id: 'run-1', sport: 'run' })
    renderPage(
      'run',
      makeResult({
        activities: [run],
        runCp: null,
        runCpRefusal: 'shape',
        runCpUneven: uneven,
        runThreshold: makeRunThreshold(16),
        effortGate: { run: notHard, ride: UNKNOWN },
      }),
    )
    const section = screen.getByRole('region', { name: 'Threshold pace' })
    expect(section.querySelector('.sport-hero__number')).toHaveTextContent(pace(16))
    // Not the gate's floor (its best 30 min, at 3.0 W/kg), nor the uneven fit's 4.4.
    expect(section.querySelector('.sport-hero__figure')).not.toHaveTextContent(pace(3))
    expect(section.querySelector('.sport-hero__figure')).not.toHaveTextContent(pace(4.4))
    expect(section.querySelector('.chip')).toBeNull()
    expect(within(section).queryByText(/At least|From your best|Estimated/)).toBeNull()
    expect(screen.queryByRole('region', { name: 'Threshold pace, at least' })).toBeNull()
  })

  it('has no floor on a ride: the estimate stands, whatever a refused fit left out', () => {
    const ride = makeActivity({ id: 'ride-1', sport: 'ride' })
    renderPage(
      'ride',
      makeResult({
        activities: [ride],
        rideCp: null,
        rideCpRefusal: 'shape',
        rideCpUneven: { ...uneven, fit: { ...uneven.fit, cp: 3.6 } },
        rideThreshold: makeRideThreshold(15.5),
      }),
    )
    const section = screen.getByRole('region', { name: 'Threshold power' })
    expect(section.querySelector('.sport-hero__number')).toHaveTextContent('250')
    expect(section.querySelector('.chip')).toBeNull()
    expect(within(section).queryByText(/At least|From your best/)).toBeNull()
  })

  it('keeps the estimate and its own range while an uneven fit sits beside it', () => {
    const run = makeActivity({ id: 'run-1', sport: 'run' })
    renderPage('run', makeResult({ activities: [run], runCpUneven: uneven }))
    const section = screen.getByRole('region', { name: 'Threshold pace' })
    expect(section.querySelector('.sport-hero__number')).toHaveTextContent(pace(4))
    openDetail(section)
    // The range is the estimate's own 10th to 90th percentile, not a run up to the uneven fit's pace.
    expect(section.querySelector('.props')).not.toHaveTextContent(pace(4.4))
  })
})

describe('a sport page’s fitness', () => {
  const withFitness = (
    sport: Sport,
    result: AnalysisResult,
    fitness: { run: typeof SLIPPING; ride: typeof RIDE_SLIPPING | typeof NO_FITNESS.ride } = {
      run: SLIPPING,
      ride: NO_FITNESS.ride,
    },
  ) =>
    render(
      <SportPage
        sport={sport}
        result={result}
        previous={null}
        previousLabel={null}
        fitness={fitness}
        change={null}
        units="metric"
        massKg={75}
        weighted
        profile={null}
        missingAge={null}
        rangeDays={42}
        controls={<span>Period picker</span>}
        emptyText="Nothing in this period."
        inLibrary={result.activities.filter((activity) => activity.sport === sport).length}
        library={result.activities}
        onAddFiles={vi.fn()}
      />,
    )

  it('puts the run page’s status directly under the hero, and does not name the sport twice', () => {
    withFitness('run', fullRun())
    const fitness = screen.getByRole('region', { name: 'Your fitness' })
    const threshold = screen.getByRole('heading', { name: 'Threshold pace' })
    expect(follows(threshold, fitness)).toBe(true)
    // The graph's title is the state alone: the page's own title names the sport.
    expect(within(fitness).getByRole('figure', { name: 'Slipping' })).toBeInTheDocument()
    expect(within(fitness).queryByText(/^Run( ·|$)/)).not.toBeInTheDocument()
  })

  it('says nothing about fitness on the ride page for a library with no ride status', () => {
    withFitness('ride', makeResult({ activities: profileActivities('ride') }))
    expect(screen.queryByRole('region', { name: 'Your fitness' })).not.toBeInTheDocument()
  })

  it('leads the ride page with the ride’s status, in watts, and not the run’s', () => {
    withFitness('ride', makeResult({ activities: profileActivities('ride') }), {
      run: SLIPPING,
      ride: RIDE_SLIPPING,
    })
    const fitness = screen.getByRole('region', { name: 'Your fitness' })
    expect(within(fitness).getAllByRole('figure')).toHaveLength(1)
    expect(rowValue(fitness, 'Power at 140 bpm')).toMatch(/^\d+ W$/)
    expect(fitness.textContent).not.toMatch(/\/km|\/mi/)
  })
})
