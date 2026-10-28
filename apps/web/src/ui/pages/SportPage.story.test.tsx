// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LateEvidence, SameHeartRate } from '@rca/core/digest'
import { NO_LATE_EVIDENCE } from '@rca/core/digest/lateEvidenceTypes'
import { NO_SAME_HEART_RATE } from '@rca/core/digest/sameHeartRateTypes'
import { NO_TRENDS } from '@rca/core/digest/trendPoints'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { MeasureTime } from '@rca/core/zones'
import { makeActivity, makeResult } from '../components/fixtures'
import { lateEvidenceFor } from '../lateFixtures'
import { profileActivities, profileCurve } from '../profileFixtures'
import { measureTime } from '../test/zoneTimeFixtures'
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
  weeks: [0, 1, 2, 3, 4].map((i) => week(i, 3.2 + i * 0.05)),
  change: {
    fromEndMs: week(0, 3.2).endMs,
    toEndMs: week(4, 3.4).endMs,
    from: 3.2,
    to: 3.4,
    weeksApart: 4,
    relative: 0.0625,
    real: true,
  },
  lacks: null,
  latestWeekEndMs: week(4, 3.4).endMs,
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
  screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)

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
  it('reads answer, best efforts, race predictions, week by week, the same heart rate, late in long sessions, then time in zones', () => {
    renderPage('run', fullRun(), RUN_SAME_HEART_RATE, lateEvidenceFor('run'), RUN_ZONES)
    expect(headings()).toEqual([
      'Threshold pace, estimated',
      'Best efforts',
      'Race predictions',
      'Week by week',
      'At the same heart rate',
      'Late in long sessions',
      'Time in zones',
    ])
  })

  it('has no heading of its own for the curve or for the stand-out finding', () => {
    renderPage('run', fullRun(), RUN_SAME_HEART_RATE, lateEvidenceFor('run'), RUN_ZONES)
    expect(screen.queryByRole('heading', { name: 'Pace curve' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Where your bests stand out' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Not enough yet' })).toBeNull()
  })

  it('puts the curve under the records list, with the stand-out finding as its caption', () => {
    renderPage('run', fullRun(), RUN_SAME_HEART_RATE, lateEvidenceFor('run'), RUN_ZONES)
    const section = screen.getByRole('region', { name: 'Best efforts' })
    const list = section.querySelector('ul.records')!
    const curve = within(section).getByRole('figure', { name: /^Run flat pace .* by duration$/ })
    const caption = within(section).getByText(/^Your 5 min best is [23]\d% above/)
    expect(follows(list, curve)).toBe(true)
    expect(follows(curve, caption)).toBe(true)
  })

  it('keeps the strip behind a closed disclosure that opens to show each best against the others', () => {
    renderPage('run', fullRun(), RUN_SAME_HEART_RATE, lateEvidenceFor('run'), RUN_ZONES)
    const section = screen.getByRole('region', { name: 'Best efforts' })
    const details = within(section)
      .getByText('Show each best against the others')
      .closest('details')!
    expect(details.open).toBe(false)
    expect(within(details).queryByRole('figure')).toBeNull()
    details.open = true
    fireEvent(details, new Event('toggle'))
    expect(within(details).getByRole('figure')).toBeInTheDocument()
    expect(within(details).getByText('Hide each best against the others')).toBeInTheDocument()
  })

  it('offers no disclosure when nothing stands out, and says the bests are in line', () => {
    const result = makeResult({
      activities: [...profileActivities('run'), withBests],
      runCurve: profileCurve(),
    })
    renderPage('run', result, RUN_SAME_HEART_RATE, lateEvidenceFor('run'), RUN_ZONES)
    expect(screen.queryByText(/each best against the others/)).toBeNull()
    expect(screen.getByText(/^Your bests are in line with each other/)).toBeInTheDocument()
  })

  it('says under the week-by-week chart that a step down can be a best leaving the window', () => {
    renderPage('run', fullRun(), RUN_SAME_HEART_RATE, lateEvidenceFor('run'), RUN_ZONES)
    const section = screen.getByRole('region', { name: 'Week by week' })
    const line = within(section).getByText(
      'A step down can be a best leaving the 4-week window, not a change in you.',
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
    const section = screen.getByRole('region', { name: 'Not enough yet' })
    const items = within(section)
      .getAllByRole('listitem')
      .map((item) => item.textContent)
    expect(items).toEqual([
      expect.stringMatching(/^Where your bests stand out: needs bests at 5 or more durations/),
      'Race predictions: needs a best of a mile or more, or runs with heart rate.',
      expect.stringMatching(
        /^At the same heart rate: needs at least \d+ steady 5-minute stretches/,
      ),
      'Late in long sessions: add 3 runs longer than an hour. Needs 3 steady runs over an hour with heart rate to show how output per heartbeat changes.',
      'Time in zones: needs 3 activities with heart rate, or a threshold pace entered on Profile, and 1 hour of them.',
    ])
    expect(section.querySelector('ul')).toHaveClass('muted')
  })

  it('puts the list after the sections and before the footnote', () => {
    renderPage('run', newRun())
    const list = screen.getByRole('region', { name: 'Not enough yet' })
    const last = screen.getByRole('region', { name: 'Week by week' })
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
    expect(within(section).getByText('52 W')).toBeInTheDocument()
    expect(screen.queryByText('Threshold power, estimated')).toBeNull()
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
