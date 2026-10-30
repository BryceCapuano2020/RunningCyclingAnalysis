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
import { SLIPPING, waitingStatus } from '../fitnessFixtures'
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
  change: {
    fromEndMs: week(0, 3.0).endMs,
    toEndMs: week(7, 3.4).endMs,
    from: 3.0,
    to: 3.4,
    weeksApart: 7,
    relative: 0.133,
    real: true,
  },
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
      windowDays={28}
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
  it('reads answer, best efforts, race predictions, time in zones and week by week open, in that order', () => {
    renderPage('run', fullRun(), RUN_SAME_HEART_RATE, lateEvidenceFor('run'), RUN_ZONES)
    expect(headings()).toEqual([
      'Threshold pace, estimated',
      'Best efforts',
      'Race predictions',
      'Time in zones',
      'Week by week',
    ])
  })

  it('follows with the same heart rate, late in long sessions, stand-out and the full list, each closed', () => {
    renderPage('run', fullRun(), RUN_SAME_HEART_RATE, lateEvidenceFor('run'), RUN_ZONES)
    const closed = [
      'At the same heart rate',
      'Late in long sessions',
      'Where your bests stand out',
      'All best efforts',
    ]
    const order = regions().filter((name) => closed.includes(name ?? ''))
    expect(order).toEqual(closed)
    for (const name of closed) {
      const details = screen.getByRole('region', { name }).querySelector('details')!
      expect(details.open).toBe(false)
      expect(details.querySelector('.sport-disclosure__body')).toBeEmptyDOMElement()
    }
  })

  it('says its finding on every closed row, so closed still tells the athlete something', () => {
    renderPage('run', fullRun(), RUN_SAME_HEART_RATE, lateEvidenceFor('run'), RUN_ZONES)
    // 3.0 to 3.4 m/s is 5:33 to 4:54 a km, about 39 s faster; the first week's window is in December. The closed
    // row names the heart rate, so "the same" is a number.
    expect(closedRow('At the same heart rate')).toMatch(
      /^At the same heart rateAt the same heart rate you run (3[89]|40) s\/km faster than in December \(145 bpm\)$/,
    )
    expect(closedRow('Late in long sessions')).toMatch(
      /Best 20 min held \d+% after 90 min; output per heartbeat fell 3%/,
    )
    expect(closedRow('Where your bests stand out')).toMatch(/Your 5 min best is [23]\d% above/)
    expect(closedRow('All best efforts')).toMatch(
      /^All best efforts\d+ best efforts and the activity each was set in$/,
    )
  })

  it('has no heading of its own for the curve’s title, the closed sections or the stand-out finding', () => {
    renderPage('run', fullRun(), RUN_SAME_HEART_RATE, lateEvidenceFor('run'), RUN_ZONES)
    expect(screen.queryByRole('heading', { name: 'Pace curve' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Where your bests stand out' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Not enough yet' })).toBeNull()
  })

  it('puts the record tiles under the curve, and the stand-out finding in its own closed section, not as a caption', () => {
    renderPage('run', fullRun(), RUN_SAME_HEART_RATE, lateEvidenceFor('run'), RUN_ZONES)
    const section = screen.getByRole('region', { name: 'Best efforts' })
    const curve = within(section).getByRole('figure', { name: /^Run flat pace .* by duration$/ })
    const tiles = within(section).getByRole('list', { name: 'Best efforts' })
    expect(follows(curve, tiles)).toBe(true)
    expect(within(section).queryByText(/^Your 5 min best is/)).toBeNull()
    expect(tiles.querySelector('ul.records')).toBeNull()
  })

  it('keeps every best effort in a closed section that opens to the full list', () => {
    renderPage('run', fullRun(), RUN_SAME_HEART_RATE, lateEvidenceFor('run'), RUN_ZONES)
    const closed = screen.getByRole('region', { name: 'All best efforts' })
    expect(closed.querySelector('ul.records')).toBeNull()
    openSection('All best efforts')
    expect(closed.querySelector('ul.records')).not.toBeNull()
  })

  it('opens the stand-out section to the strip of each best against the others', () => {
    renderPage('run', fullRun(), RUN_SAME_HEART_RATE, lateEvidenceFor('run'), RUN_ZONES)
    const region = screen.getByRole('region', { name: 'Where your bests stand out' })
    expect(within(region).queryByRole('figure')).toBeNull()
    openSection('Where your bests stand out')
    expect(within(region).getByRole('figure')).toBeInTheDocument()
  })

  it('says the bests are in line when nothing stands out, and draws no strip when it opens', () => {
    const result = makeResult({
      activities: [...profileActivities('run'), withBests],
      runCurve: profileCurve(),
    })
    renderPage('run', result, RUN_SAME_HEART_RATE, lateEvidenceFor('run'), RUN_ZONES)
    expect(closedRow('Where your bests stand out')).toMatch(
      /Your bests are in line with each other/,
    )
    const region = openSection('Where your bests stand out')
    expect(within(region).queryByRole('figure')).toBeNull()
  })

  it('says under the week-by-week chart that a dip can be a best leaving the window', () => {
    renderPage('run', fullRun(), RUN_SAME_HEART_RATE, lateEvidenceFor('run'), RUN_ZONES)
    const section = screen.getByRole('region', { name: 'Week by week' })
    const line = within(section).getByText(
      'A dip can be a best leaving the 4-week window, not a change in you.',
    )
    expect(line).toHaveClass('muted')
    expect(follows(section.querySelector('figure')!, line)).toBe(true)
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
  it('says so under the predictions, which carry every run’s bests', () => {
    const result = { ...fullRun(), effortGate: { run: NO_HEART_RATE, ride: UNKNOWN } }
    renderPage('run', result, RUN_SAME_HEART_RATE, lateEvidenceFor('run'), RUN_ZONES)
    openSection('Race predictions')
    // Once under the threshold, once under the predictions.
    expect(
      screen.getAllByText(
        'Effort not checked: no heart rate on your best 20 min run. Add a run with heart rate to check it.',
      ),
    ).toHaveLength(2)
  })

  it('says nothing of it where the effort was checked', () => {
    renderPage('run', fullRun(), RUN_SAME_HEART_RATE, lateEvidenceFor('run'), RUN_ZONES)
    openSection('Race predictions')
    expect(screen.queryByText(/Effort not checked/)).toBeNull()
  })
})

describe('a sport page with sections that have nothing to show', () => {
  const newRun = () => makeResult({ activities: [makeActivity({ id: 'run-1', sport: 'run' })] })

  it('leaves the empty sections without a heading and gathers why in one muted list at the end', () => {
    renderPage('run', newRun())
    expect(headings()).toEqual([
      'Threshold pace, estimated',
      'Best efforts',
      'Week by week',
      'Not enough yet',
    ])
    // Only the sections with something to show have a row.
    expect(regions()).not.toContain('Late in long sessions')
    expect(regions()).not.toContain('At the same heart rate')
    const section = screen.getByRole('region', { name: 'Not enough yet' })
    const items = within(section)
      .getAllByRole('listitem')
      .map((item) => item.textContent)
    expect(items).toEqual([
      'Race predictions: needs a best of a mile or more, or runs with heart rate.',
      'Time in zones: needs 3 activities with heart rate, or a threshold pace entered on Profile, and 1 hour of them.',
      expect.stringMatching(
        /^At the same heart rate: needs at least \d+ steady 5-minute stretches/,
      ),
      'Best efforts late in long sessions: add 3 runs, each longer than an hour and reaching a hard heart rate.',
      'Output per heartbeat over an hour: needs 3 steady runs with heart rate.',
      expect.stringMatching(/^Where your bests stand out: needs bests at 5 or more durations/),
    ])
    expect(section.querySelector('ul')).toHaveClass('muted')
  })

  it('puts the list after the sections and before the footnote', () => {
    renderPage('run', newRun())
    const list = screen.getByRole('region', { name: 'Not enough yet' })
    const last = screen.getByRole('region', { name: 'All best efforts' })
    expect(follows(last, list)).toBe(true)
    expect(follows(list, screen.getByText('Page footnote'))).toBe(true)
  })

  it('does not list race predictions for a ride, which has none to give', () => {
    renderPage('ride', makeResult({ activities: [makeActivity({ id: 'ride-1', sport: 'ride' })] }))
    const section = screen.getByRole('region', { name: 'Not enough yet' })
    expect(within(section).queryByText(/Race predictions/)).toBeNull()
    expect(within(section).getByText(/^Where your bests stand out: needs/)).toBeInTheDocument()
  })

  it('shows no list when every section has something to say', () => {
    renderPage('run', fullRun(), RUN_SAME_HEART_RATE, lateEvidenceFor('run'), RUN_ZONES)
    expect(screen.queryByRole('region', { name: 'Not enough yet' })).toBeNull()
  })

  it('shows no list on a page with no activities', () => {
    renderPage('run', makeResult({ activities: [] }))
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
    fitness = { run: SLIPPING, ride: NO_FITNESS.ride },
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
        windowDays={28}
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

  it('says nothing about fitness on the ride page while rides are not compared', () => {
    withFitness('ride', makeResult({ activities: profileActivities('ride') }))
    expect(screen.queryByRole('region', { name: 'Your fitness' })).not.toBeInTheDocument()
  })

  it('defers the weekly same-heart-rate section to the status: retitled, and no change of its own that could disagree', () => {
    // The weekly data rise 13% while the status says slipping: the section must not say so beside the card.
    withFitness('run', fullRun(), { run: SLIPPING, ride: NO_FITNESS.ride }, RUN_SAME_HEART_RATE)
    expect(screen.queryByRole('region', { name: 'At the same heart rate' })).not.toBeInTheDocument()
    const row = closedRow('Same heart rate, week by week')
    expect(row).toContain('Your pace each week at 145 bpm.')
    expect(row).toContain('Your fitness status above')
    expect(row).not.toMatch(/faster|slower|quicker|no clear change|since/i)
    const region = openSection('Same heart rate, week by week')
    // The chart is still there, named by what it plots, without a headline of its own.
    expect(within(region).getByRole('figure')).toBeInTheDocument()
    expect(region.querySelector('.chart-frame__takeaway')).toBeNull()
  })

  it('keeps the section’s own finding where the status has no state to give', () => {
    withFitness(
      'run',
      fullRun(),
      { run: waitingStatus({ kind: 'recent', have: 2, need: 4, weeks: 8 }), ride: NO_FITNESS.ride },
      RUN_SAME_HEART_RATE,
    )
    expect(closedRow('At the same heart rate')).toMatch(/quicker|faster/i)
    expect(
      screen.queryByRole('region', { name: 'Same heart rate, week by week' }),
    ).not.toBeInTheDocument()
  })
})
