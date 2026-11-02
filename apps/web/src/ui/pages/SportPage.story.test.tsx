// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LateEvidence, SameHeartRate } from '@rca/core/digest'
import { NO_LATE_EVIDENCE } from '@rca/core/digest/lateEvidenceTypes'
import { NO_SAME_HEART_RATE } from '@rca/core/digest/sameHeartRateTypes'
import { NO_TRENDS } from '@rca/core/digest/trendPoints'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { MeasureTime } from '@rca/core/zones'
import { makeActivity, makeResult } from '../components/fixtures'
import { NO_HEART_RATE, UNKNOWN } from '../effortGateFixtures'
import { lateEvidenceFor } from '../lateFixtures'
import { profileActivities, profileCurve } from '../profileFixtures'
import { measureTime } from '../test/zoneTimeFixtures'
import { closedRow, openSection } from '../test/openSection'
import { NO_FITNESS } from '@rca/core/fitness/types'
import { RIDE_SLIPPING, SLIPPING, waitingStatus } from '../fitnessFixtures'
import { SportPage } from './SportPage'

afterEach(cleanup)

const WEEK_MS = 7 * 86_400_000
const week = (index: number, output: number): SameHeartRate['weeks'][number] => ({
  endMs: Date.UTC(2025, 0, 12, 23, 59, 59, 999) + index * WEEK_MS,
  fit: { output, low: output * 0.97, high: output * 1.03 },
  lacks: null,
  blocks: 14,
  activities: 5,
})

/** A real change in the run's pace at one heart rate, so the section has something to say. */
const RUN_SAME_HEART_RATE: SameHeartRate = {
  referenceHeartRate: 145,
  // Eight weeks, from 3.0 to 3.4 m/s: 5:33 to 4:54 a kilometre, a trend the weeks' own ranges leave no doubt of.
  weeks: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => week(i, 3.0 + i * (0.4 / 7))),
  reportedWeeks: 8,
  lacks: null,
  latestWeekEndMs: week(7, 3.4).endMs,
}

/** Ten hours of a run's heart rate over eight runs, mostly in zone 2, so the section has something to say. */
const RUN_ZONES: MeasureTime[] = [
  measureTime('run', 'heartRate', [3600, 21_600, 7200, 3600, 0]),
  measureTime('run', 'pace', [0, 0, 0, 0, 0], { counted: 0 }),
]

function renderPage(
  sport: Sport,
  result: AnalysisResult,
  sameHeartRate?: SameHeartRate,
  lateEvidence: LateEvidence = NO_LATE_EVIDENCE[sport],
  zoneTimes?: readonly MeasureTime[],
) {
  return render(
    <SportPage
      sport={sport}
      result={result}
      previous={null}
      previousLabel={null}
      trends={NO_TRENDS}
      sameHeartRate={sameHeartRate ?? NO_SAME_HEART_RATE[sport]}
      lateEvidence={lateEvidence}
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

/** The names of the page's named sections, in the order they are read. */
const regions = () =>
  screen
    .getAllByRole('region')
    .map((region) => region.getAttribute('aria-label') ?? region.getAttribute('aria-labelledby'))

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
  it('reads answer, history, best efforts, race predictions, time in zones and best efforts by day, in that order', () => {
    renderPage('run', fullRun(), RUN_SAME_HEART_RATE, lateEvidenceFor('run'), RUN_ZONES)
    // The page is given no look-back here, so the years are one line in their place.
    expect(headings()).toEqual([
      'Threshold pace, estimated',
      'History',
      'Best efforts',
      'Race predictions',
      'Time in zones',
      'Best efforts by day',
    ])
  })

  it('follows with pace at heart rate, durability, best durations and the full list, each open', () => {
    renderPage('run', fullRun(), RUN_SAME_HEART_RATE, lateEvidenceFor('run'), RUN_ZONES)
    const sections = ['Pace at heart rate', 'Durability', 'Best durations', 'All best efforts']
    const order = regions().filter((name) => sections.includes(name ?? ''))
    expect(order).toEqual(sections)
    for (const name of sections) {
      const details = screen.getByRole('region', { name }).querySelector('details')!
      expect(details.open).toBe(true)
      expect(details.querySelector('.sport-disclosure__body')).not.toBeEmptyDOMElement()
    }
  })

  it('says its finding on every row, so a section the reader folds still tells the athlete something', () => {
    renderPage('run', fullRun(), RUN_SAME_HEART_RATE, lateEvidenceFor('run'), RUN_ZONES)
    // The row names the heart rate, so "the same" is a number. It claims no change.
    expect(closedRow('Pace at heart rate')).toBe('Pace at heart ratePace at 145 bpm, by week.')
    expect(closedRow('Durability')).toMatch(
      /Durability: \d+% of your best 20 min after 90 min\. Heart rate drift: efficiency fell 3%/,
    )
    expect(closedRow('Best durations')).toMatch(/Your 5 min best is [23]\d% above/)
    // The full list is its name alone: a count of its rows says nothing the list does not.
    expect(closedRow('All best efforts')).toBe('All best efforts')
  })

  it('has no heading of its own for the curve’s title, the closed sections or the stand-out finding', () => {
    renderPage('run', fullRun(), RUN_SAME_HEART_RATE, lateEvidenceFor('run'), RUN_ZONES)
    expect(screen.queryByRole('heading', { name: 'Pace curve' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Best durations' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Not enough yet' })).toBeNull()
  })

  it('puts the record tiles under the curve, and the stand-out finding in its own closed section, not as a caption', () => {
    renderPage('run', fullRun(), RUN_SAME_HEART_RATE, lateEvidenceFor('run'), RUN_ZONES)
    const section = screen.getByRole('region', { name: 'Best efforts' })
    const curve = within(section).getByRole('figure', { name: 'Best efforts' })
    const tiles = within(section).getByRole('list', { name: 'Best efforts' })
    expect(follows(curve, tiles)).toBe(true)
    expect(within(section).queryByText(/^Your 5 min best is/)).toBeNull()
    expect(tiles.querySelector('ul.records')).toBeNull()
  })

  it('shows every best effort from the start, in a section the reader can fold', () => {
    renderPage('run', fullRun(), RUN_SAME_HEART_RATE, lateEvidenceFor('run'), RUN_ZONES)
    const section = screen.getByRole('region', { name: 'All best efforts' })
    expect(section.querySelector('ul.records')).not.toBeNull()
    expect(section.querySelector('details')).toHaveAttribute('open')
  })

  it('draws the strip of each best against the others when one stands out, with no press', () => {
    renderPage('run', fullRun(), RUN_SAME_HEART_RATE, lateEvidenceFor('run'), RUN_ZONES)
    const region = screen.getByRole('region', { name: 'Best durations' })
    expect(within(region).getByRole('figure')).toBeInTheDocument()
  })

  it('says nothing stands out, and draws no strip', () => {
    const result = makeResult({
      activities: [...profileActivities('run'), withBests],
      runCurve: profileCurve(),
    })
    renderPage('run', result, RUN_SAME_HEART_RATE, lateEvidenceFor('run'), RUN_ZONES)
    expect(closedRow('Best durations')).toBe('Best durationsNothing stands out.')
    expect(
      within(screen.getByRole('region', { name: 'Best durations' })).queryByRole('figure'),
    ).toBeNull()
  })

  it('draws the dated bests with no line and no wash, and no sentence about a dip in a window', () => {
    const { container } = renderPage(
      'run',
      fullRun(),
      RUN_SAME_HEART_RATE,
      lateEvidenceFor('run'),
      RUN_ZONES,
    )
    const section = screen.getByRole('region', { name: 'Best efforts by day' })
    expect(
      section.querySelector('[data-testid="trend-line"], [data-testid="trend-wash"]'),
    ).toBeNull()
    expect(container.textContent).not.toMatch(/leaving the .*window/)
  })

  it('never uses the words the page has banned', () => {
    const { container } = renderPage(
      'run',
      fullRun(),
      RUN_SAME_HEART_RATE,
      lateEvidenceFor('run'),
      RUN_ZONES,
    )
    const text = (container.textContent ?? '').toLowerCase()
    for (const word of ['limiter', 'weak', 'strength', 'holding you back', 'ahead of']) {
      expect(text).not.toContain(word)
    }
  })
})

describe('race predictions where the effort could not be checked', () => {
  it('says so once, under the threshold, and carries every run’s bests as a prediction', () => {
    const result = { ...fullRun(), effortGate: { run: NO_HEART_RATE, ride: UNKNOWN } }
    renderPage('run', result, RUN_SAME_HEART_RATE, lateEvidenceFor('run'), RUN_ZONES)
    openSection('Race predictions')
    expect(
      screen.getAllByText(
        'No heart rate on your best 20 min run, so the effort was not checked. Add a run with heart rate to check it.',
      ),
    ).toHaveLength(1)
    expect(screen.queryByText('No slower than')).toBeNull()
  })

  it('says nothing of it where the effort was checked', () => {
    renderPage('run', fullRun(), RUN_SAME_HEART_RATE, lateEvidenceFor('run'), RUN_ZONES)
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
      'Threshold pace, estimated',
      'History',
      'Best efforts',
      'Race predictions',
      'Time in zones',
      'Best efforts by day',
      'Pace at heart rate',
      'Durability',
      'Best durations',
    ])
    expect(lineIn('History')).toBe('Needs a year of runs.')
    expect(lineIn('Race predictions')).toBe('Needs a run of a mile or more.')
    expect(lineIn('Time in zones')).toBe(
      'Needs an activity with heart rate, or a threshold pace entered on Profile.',
    )
    expect(lineIn('Pace at heart rate')).toMatch(/^Needs at least \d+ steady 5-minute stretches/)
    expect(lineIn('Durability')).toBe('Add 3 steady runs over an hour with heart rate.')
    expect(lineIn('Best durations')).toMatch(/^Needs bests at 5 or more durations/)
  })

  it('has no list of what is missing, and no empty section is a fold or a nav button', () => {
    renderPage('run', newRun())
    expect(screen.queryByText('Not enough yet')).toBeNull()
    expect(screen.queryByRole('region', { name: 'Not enough yet' })).toBeNull()
    for (const name of ['History', 'Durability', 'Best durations']) {
      expect(screen.getByRole('region', { name }).closest('details')).toBeNull()
    }
    const nav = screen.getByRole('navigation', { name: 'On this page' })
    expect(within(nav).queryByRole('button', { name: 'Durability' })).toBeNull()
    expect(within(nav).getByRole('button', { name: 'Best efforts by day' })).toBeInTheDocument()
  })

  it('keeps the lines in the sections’ own order, before the footnote', () => {
    renderPage('run', newRun())
    const durability = screen.getByRole('region', { name: 'Durability' })
    const durations = screen.getByRole('region', { name: 'Best durations' })
    const full = screen.getByRole('region', { name: 'All best efforts' })
    expect(follows(durability, durations)).toBe(true)
    expect(follows(durations, full)).toBe(true)
    expect(follows(full, screen.getByText('Page footnote'))).toBe(true)
  })

  it('gives a ride no race predictions, which it has none to give, and asks for a power meter', () => {
    renderPage('ride', makeResult({ activities: [makeActivity({ id: 'ride-1', sport: 'ride' })] }))
    expect(screen.queryByRole('region', { name: 'Race predictions' })).toBeNull()
    expect(lineIn('Best durations')).toMatch(/^Needs bests at 5 or more durations.*power meter\.$/)
    expect(lineIn('Durability')).toBe(
      'Add 3 steady rides over an hour with a power meter and heart rate.',
    )
  })

  it('shows one answer for durability and a line for the half it lacks, when only drift shows', () => {
    renderPage('run', newRun(), undefined, {
      ...lateEvidenceFor('run'),
      durability: NO_LATE_EVIDENCE.run.durability,
    })
    const section = screen.getByRole('region', { name: 'Durability' })
    expect(within(section).getAllByRole('figure')).toHaveLength(1)
    expect(
      within(section).getByText('Durability needs 3 runs longer than an hour.'),
    ).toBeInTheDocument()
  })

  it('shows no empty section on a page with no activities', () => {
    renderPage('run', makeResult({ activities: [] }))
    expect(screen.queryByRole('region', { name: 'Durability' })).toBeNull()
    expect(screen.queryByText('Not enough yet')).toBeNull()
  })
})

describe('the threshold when only a floor is shown', () => {
  const uneven = {
    fit: { cp: 3.6, wPrime: 15, cpSe: 0.04, r2: 0.98, nPoints: 5 },
    leftOutS: [900, 1200],
    floor: 3.2,
  }

  it('is labelled "at least", not "estimated", on a ride', () => {
    const ride = makeActivity({ id: 'ride-1', sport: 'ride' })
    renderPage(
      'ride',
      makeResult({
        activities: [ride],
        rideCp: null,
        rideCpRefusal: 'shape',
        rideCpUneven: uneven,
      }),
    )
    const section = screen.getByRole('region', { name: 'Threshold power, at least' })
    expect(section.querySelector('.sport-hero__number')).toHaveTextContent('52')
    expect(within(section).getByText('At least', { selector: '.stat-tile__basis' })).toHaveClass(
      'stat-tile__basis--floor',
    )
    expect(screen.queryByText('Estimated', { selector: '.stat-tile__basis' })).toBeNull()
  })

  it('is labelled "at least" on a run', () => {
    const run = makeActivity({ id: 'run-1', sport: 'run' })
    renderPage(
      'run',
      makeResult({ activities: [run], runCp: null, runCpRefusal: 'shape', runCpUneven: uneven }),
    )
    expect(screen.getByRole('region', { name: 'Threshold pace, at least' })).toBeInTheDocument()
  })

  it('stays "estimated" while the threshold is fitted, even with an uneven fit beside it', () => {
    const ride = makeActivity({ id: 'ride-1', sport: 'ride' })
    renderPage('ride', makeResult({ activities: [ride], rideCpUneven: uneven }))
    expect(screen.getByRole('region', { name: 'Threshold power, estimated' })).toBeInTheDocument()
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
    sameHeartRate: SameHeartRate = NO_SAME_HEART_RATE[sport],
  ) =>
    render(
      <SportPage
        sport={sport}
        result={result}
        previous={null}
        previousLabel={null}
        trends={NO_TRENDS}
        sameHeartRate={sameHeartRate}
        lateEvidence={NO_LATE_EVIDENCE[sport]}
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

  it('leads the run page with its status, above the threshold, and does not name the sport twice', () => {
    withFitness('run', fullRun())
    const fitness = screen.getByRole('region', { name: 'Your fitness' })
    const threshold = screen.getByRole('heading', { name: 'Threshold pace, estimated' })
    expect(follows(fitness, threshold)).toBe(true)
    expect(screen.getByRole('article', { name: 'Slipping' })).toBeInTheDocument()
    expect(within(fitness).queryByText('Run')).not.toBeInTheDocument()
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
    expect(within(fitness).getAllByRole('article')).toHaveLength(1)
    expect(fitness.textContent).toMatch(/you now ride at \d+ W/)
    expect(fitness.textContent).not.toMatch(/you now run/)
  })

  it('claims no change in the weekly pace-at-heart-rate section, whatever the status above it says', () => {
    // The weekly data rise 13% while the status says slipping: the section must not say so beside the card.
    withFitness('run', fullRun(), { run: SLIPPING, ride: NO_FITNESS.ride }, RUN_SAME_HEART_RATE)
    expect(screen.queryByRole('region', { name: 'At the same heart rate' })).not.toBeInTheDocument()
    const row = closedRow('Pace at heart rate')
    expect(row).toBe('Pace at heart ratePace at 145 bpm, by week.')
    expect(row).not.toMatch(/faster|slower|quicker|no clear change|since|status/i)
    const region = openSection('Pace at heart rate')
    // The chart is still there, named by what it plots, without a headline of its own.
    expect(within(region).getByRole('figure')).toBeInTheDocument()
    expect(region.querySelector('.chart-frame__takeaway')).toBeNull()
  })

  it('claims no change in the weekly section where the status has no state to give either', () => {
    withFitness(
      'run',
      fullRun(),
      { run: waitingStatus({ kind: 'recent', have: 2, need: 4, weeks: 8 }), ride: NO_FITNESS.ride },
      RUN_SAME_HEART_RATE,
    )
    expect(closedRow('Pace at heart rate')).toBe('Pace at heart ratePace at 145 bpm, by week.')
  })
})
