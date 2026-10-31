// @vitest-environment jsdom
import type { Period } from '@rca/core/period'
import { NO_HEART_RATE_JUDGEMENT } from '@rca/core/digest/setAsideTypes'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import type { EarnedRecord } from '@rca/core/records'
import type { DigestSplits } from '@rca/core/types'
import type { ActivityTrace } from '@rca/core/workbench'
import { METRES_PER_KM, METRES_PER_MILE } from '@rca/core/units'
import { curveOf, rideCurveFixture, runCurveFixture } from '../charts/fixtures'
import { MAN_BORN_1986, makeActivity, makeEquivalence, makeResult } from '../components/fixtures'
import { FLAT_PACE_NOTE } from '../grades'
import type { RouteReply } from '../routeReply'
import type { ActivityPageProps } from './ActivityPage'
import { ActivityPage } from './ActivityPage'

// A fixed clock, so the year shown on the date does not depend on when the suite runs.
const NOW = new Date(2026, 5, 10, 12).getTime()

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/** The library's best efforts are set by the activity whose id is 'activity-1'. */
function resultWith(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return makeResult({ runCurve: runCurveFixture, rideCurve: rideCurveFixture, ...overrides })
}

/** No saved record and no route: the sample, or an activity this visitor has not kept. */
const NO_ROUTE = { routeId: null, loadRoute: async (): Promise<RouteReply> => ({ kind: 'none' }) }

function pageElement(
  activity: ActivitySummary | null,
  result: AnalysisResult = resultWith(),
  units: 'metric' | 'imperial' = 'metric',
  records: ReadonlyMap<string, readonly EarnedRecord[]> = new Map(),
  loadSplits: (id: string) => Promise<DigestSplits | null> = vi.fn(async () => null),
  route: Pick<ActivityPageProps, 'routeId' | 'loadRoute'> = NO_ROUTE,
  period?: Period,
  extra: Partial<ActivityPageProps> = {},
) {
  // As in the app, the page's activity is one of the result's activities, and of the library.
  const activities = activity ? [activity, ...result.activities] : result.activities
  return (
    <ActivityPage
      signedIn={false}
      activity={activity}
      library={activities}
      result={{ ...result, activities }}
      zoneEstimates={null}
      units={units}
      massKg={70}
      weightKnown
      heartRateJudgement={NO_HEART_RATE_JUDGEMENT}
      profile={MAN_BORN_1986}
      records={records}
      loadSplits={loadSplits}
      period={period}
      {...route}
      {...extra}
    />
  )
}

/** Renders the page with the arguments pageElement takes, so a test can rerender it with a delete's outcome. */
function renderPage(...args: Parameters<typeof pageElement>) {
  return render(pageElement(...args))
}

/** The period the bests are counted over, dated from 12 May to 3 August 2025. */
const DATED: Period = {
  choice: 42,
  startMs: new Date(2025, 4, 12, 12).getTime(),
  endMs: new Date(2025, 7, 3, 12).getTime(),
  days: 42,
  fellBack: false,
}

/** The records-list row that names the best effort `label`, such as "Best 5 min". */
function bestRow(label: string): HTMLElement {
  const row = screen.getByText(label, { selector: '.records__label' }).closest('li')
  if (!row) throw new Error(`No record row named `)
  return row
}

/** The Best efforts section, which holds the flat pace note when the splits do not. */
function bestsSection(): HTMLElement {
  const section = screen
    .getByRole('heading', { level: 2, name: 'Best efforts set here' })
    .closest('section')
  if (!section) throw new Error('No Best efforts section')
  return section
}

/** The Splits section, which holds the flat pace note when its flat pace column shows. */
function splitsSection(): HTMLElement {
  const section = screen.getByRole('heading', { level: 2, name: 'Splits' }).closest('section')
  if (!section) throw new Error('No Splits section')
  return section
}

/** The stat whose label is `label`; its value sits in the same group. */
function statFor(label: string): HTMLElement {
  const parent = screen.getByText(label, { selector: 'dt' }).parentElement
  if (!parent) throw new Error(`No stat labelled ${label}`)
  return parent
}

const morningRun = makeActivity({
  id: 'activity-1',
  name: 'Morning run',
  sport: 'run',
  startMs: new Date(2026, 0, 5, 7, 30).getTime(),
  durationS: 3600,
  distanceM: 10000,
  elevationGainM: 120,
  hasHeartRate: true,
  powerSource: 'none',
})

const powerRide = makeActivity({
  id: 'activity-1',
  name: 'Hill ride',
  sport: 'ride',
  startMs: new Date(2026, 0, 5, 16, 15).getTime(),
  durationS: 5400,
  distanceM: 45000,
  elevationGainM: 610,
  powerSource: 'measured',
})

/** Two whole kilometres: the first slower, so the second is the fastest. */
const twoKilometres: DigestSplits = {
  km: [
    {
      distanceM: 1000,
      seconds: 300,
      gradeAdjustedSeconds: 290,
      elevationGainM: 12,
      avgHeartRate: 150,
    },
    {
      distanceM: 1000,
      seconds: 285,
      gradeAdjustedSeconds: 280,
      elevationGainM: 9,
      avgHeartRate: 155,
    },
  ],
  mile: [],
}

describe('ActivityPage', () => {
  it('shows a run with its heading, sport, day and time, and a link back to the list', () => {
    renderPage(morningRun)
    const heading = screen.getByRole('heading', { level: 1, name: 'Morning run' })
    expect(heading).toHaveAttribute('id', 'page-heading')
    expect(heading).toHaveAttribute('tabindex', '-1')
    expect(screen.getByRole('link', { name: 'Back to activities' })).toHaveAttribute(
      'href',
      '#/activities',
    )
    expect(screen.getByText('Run')).toBeInTheDocument()
    expect(screen.getByText('Mon 5 Jan')).toBeInTheDocument()
    expect(screen.getByText('7:30 am')).toBeInTheDocument()
  })

  it('leads with the elapsed time when no moving time is kept, with distance, pace and climb', () => {
    renderPage(morningRun)
    expect(screen.getByText('Elapsed time', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByText('1 h', { selector: 'p' })).toBeInTheDocument()
    expect(within(statFor('Distance')).getByText('10.0 km')).toBeInTheDocument()
    expect(within(statFor('Average pace')).getByText('6:00 /km')).toBeInTheDocument()
    expect(within(statFor('Climb')).getByText('120 m')).toBeInTheDocument()
  })

  it('leads with the moving time when it is kept, with the elapsed time under it, and paces the moving time', () => {
    renderPage({ ...morningRun, movingS: 3000 })
    expect(screen.getByText('Moving time', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByText('50 min', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByText('Elapsed 1 h')).toBeInTheDocument()
    expect(within(statFor('Average pace')).getByText('5:00 /km')).toBeInTheDocument()
  })

  it('shows average and highest heart rate, and leaves out a missing heart rate and a zero climb', () => {
    const { unmount } = renderPage(
      makeActivity({ id: 'activity-1', name: 'Heart run', avgHeartRate: 150, maxHeartRate: 171 }),
    )
    expect(within(statFor('Average heart rate')).getByText('150 bpm')).toBeInTheDocument()
    expect(screen.getByText('Peak heart rate (30 s) 171 bpm')).toBeInTheDocument()
    unmount()
    renderPage(
      makeActivity({
        id: 'activity-1',
        name: 'Indoor run',
        hasHeartRate: false,
        elevationGainM: 0,
      }),
    )
    expect(screen.queryByText('Average heart rate', { selector: 'dt' })).not.toBeInTheDocument()
    expect(screen.queryByText('Climb', { selector: 'dt' })).not.toBeInTheDocument()
  })

  it('shows a ride with its climb and its average speed, and no pace', () => {
    renderPage(powerRide)
    expect(within(statFor('Climb')).getByText('610 m')).toBeInTheDocument()
    expect(within(statFor('Average speed')).getByText('30.0 km/h')).toBeInTheDocument()
    expect(screen.queryByText('Average pace', { selector: 'dt' })).not.toBeInTheDocument()
  })

  it("shows a ride's average power when a power meter measured it", () => {
    renderPage({ ...powerRide, avgPowerW: 210 })
    expect(within(statFor('Average power')).getByText('210 W')).toBeInTheDocument()
  })

  it('says a ride without a power meter has estimated power only where an estimated power figure is shown', () => {
    const sentence = 'Power here is estimated from speed and climbs. No power meter recorded it.'
    const { unmount } = renderPage({ ...powerRide, powerSource: 'virtual' })
    expect(screen.queryByText('Power', { selector: 'dt' })).not.toBeInTheDocument()
    expect(screen.queryByText('Average power', { selector: 'dt' })).not.toBeInTheDocument()
    expect(screen.queryByText(sentence)).not.toBeInTheDocument()
    unmount()
    renderPage({ ...powerRide, powerSource: 'virtual', avgPowerW: 180 })
    expect(screen.getByText(sentence)).toBeInTheDocument()
    expect(within(statFor('Average power')).getByText('Estimated')).toBeInTheDocument()
  })

  it('guards an average power that carries estimated watts, as estimated', () => {
    renderPage({ ...powerRide, powerSource: 'virtual', avgPowerW: 180 })
    expect(within(statFor('Average power')).getByText('Estimated')).toBeInTheDocument()
  })

  it("leaves the mark off a ride's average power when a power meter measured it", () => {
    renderPage({ ...powerRide, avgPowerW: 210 })
    expect(within(statFor('Average power')).queryByText('Estimated')).not.toBeInTheDocument()
  })

  it('shows no power for a run', () => {
    renderPage(morningRun)
    expect(screen.queryByText('Power', { selector: 'dt' })).not.toBeInTheDocument()
  })

  it('shows a run in imperial units', () => {
    renderPage(morningRun, resultWith(), 'imperial')
    expect(within(statFor('Distance')).getByText('6.2 mi')).toBeInTheDocument()
    expect(within(statFor('Average pace')).getByText('9:39 /mi')).toBeInTheDocument()
  })

  it('shows an indoor ride as indoor, with no distance or speed to report', () => {
    renderPage(
      makeActivity({
        id: 'activity-1',
        name: 'Trainer ride',
        sport: 'ride',
        indoor: true,
        distanceM: 0,
        elevationGainM: 0,
      }),
    )
    expect(screen.getByText('Indoor')).toBeInTheDocument()
    expect(screen.queryByText('Distance', { selector: 'dt' })).not.toBeInTheDocument()
    expect(screen.queryByText('Average speed', { selector: 'dt' })).not.toBeInTheDocument()
  })

  it('lists the run best efforts this activity set, with the pace each was run at', async () => {
    renderPage(morningRun)
    expect(
      screen.getByRole('heading', { level: 2, name: 'Best efforts set here' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Best 1 min', { selector: '.records__label' }),
    ).not.toBeInTheDocument()
    expect(within(bestRow('Best 5 min')).getByText('4:31 /km')).toBeInTheDocument()
    expect(within(bestRow('Best 20 min')).getByText('5:00 /km')).toBeInTheDocument()
    expect(within(bestRow('Best 60 min')).getByText('5:37 /km')).toBeInTheDocument()
    expect(within(bestRow('Best 5 min')).getByText('Flat')).toBeInTheDocument()
    // The splits are not kept here, so the bests explain their Flat marks.
    expect(await within(bestsSection()).findByText(FLAT_PACE_NOTE)).toBeInTheDocument()
    expect(screen.queryByText(/GAP/)).not.toBeInTheDocument()
  })

  it('gives a distance best its level, with a link to How is this graded?', () => {
    renderPage(
      makeActivity({
        id: 'activity-1',
        name: 'Tempo run',
        distanceBests: [{ distanceM: 5000, seconds: 1300 }],
      }),
    )
    expect(bestRow('Best 5 km').querySelector('.records__grade')?.textContent).toMatch(
      /Recreational|Local|Regional|National|World/,
    )
    expect(screen.getByRole('link', { name: 'How is this graded?' })).toHaveAttribute(
      'href',
      '#/method',
    )
  })

  it('shows the mile’s time alone in miles, since its pace is its time, and a 5 km pace beside its time', () => {
    renderPage(
      makeActivity({
        id: 'activity-1',
        name: 'Tempo run',
        distanceBests: [
          { distanceM: METRES_PER_MILE, seconds: 347 },
          { distanceM: 5 * METRES_PER_KM, seconds: 1300 },
        ],
      }),
      resultWith(),
      'imperial',
    )
    expect(bestRow('Best 1 mi').querySelector('.records__sub')).toBeNull()
    expect(bestRow('Best 5 km').querySelector('.records__sub')?.textContent).toMatch(/ \/mi$/)
  })

  it('says a run’s no-standard gap once under the bests, and leaves its row without a grade', () => {
    renderPage(
      makeActivity({
        id: 'activity-1',
        name: 'Tempo run',
        distanceBests: [{ distanceM: METRES_PER_KM, seconds: 240 }],
      }),
    )
    expect(within(bestsSection()).getAllByText('No age standard under 1 mile')).toHaveLength(1)
    expect(bestRow('Best 1 km').querySelector('.records__grade')).toBeNull()
  })

  it('says a ride’s estimated grade once under the bests, and not on each row', () => {
    renderPage(
      powerRide,
      resultWith({
        rideCurve: rideCurveFixture,
        equivalents: [makeEquivalence({ durationS: 300 }), makeEquivalence({ durationS: 1200 })],
      }),
    )
    expect(
      within(bestsSection()).getAllByText(/Estimated through its running equivalent/),
    ).toHaveLength(1)
    expect(bestRow('Best 20 min').querySelector('.records__grade')?.textContent).toMatch(
      /Recreational|Local|Regional|National|World/,
    )
    expect(bestRow('Best 20 min').querySelector('.records__grade')?.textContent).not.toMatch(
      /running equivalent/,
    )
  })

  it('says why a ride with estimated power has no power curve', () => {
    renderPage(
      makeActivity({ id: 'ride-x', name: 'Flat ride', sport: 'ride', powerSource: 'virtual' }),
    )
    expect(
      screen.getByText('No power curve: an estimate is made only on climbs.'),
    ).toBeInTheDocument()
  })

  it('says a ride with no power data has no power curve', () => {
    renderPage(
      makeActivity({ id: 'ride-x', name: 'Flat ride', sport: 'ride', powerSource: 'none' }),
    )
    expect(screen.getByText('No power curve: this ride has no power data.')).toBeInTheDocument()
  })

  it('shows no speed for an indoor ride, though it has a distance', () => {
    renderPage(
      makeActivity({
        id: 'activity-1',
        name: 'Trainer ride',
        sport: 'ride',
        indoor: true,
        distanceM: 20000,
        elevationGainM: 0,
      }),
    )
    expect(within(statFor('Distance')).getByText('20.0 km')).toBeInTheDocument()
    expect(screen.queryByText('Average speed', { selector: 'dt' })).not.toBeInTheDocument()
  })

  it('names the level each best effort earned, with its grade', () => {
    renderPage(morningRun)
    expect(bestRow('Best 20 min').querySelector('.records__grade')?.textContent).toMatch(
      /Recreational|Local|Regional|National|World/,
    )
  })

  it('lists the ride best efforts in watts, marked estimated only when no power meter measured them', () => {
    renderPage(powerRide, resultWith({ rideCurve: rideCurveFixture }))
    expect(within(bestRow('Best 1 min')).getByText('1,400 W')).toBeInTheDocument()
    expect(within(bestRow('Best 20 min')).getByText('1,050 W')).toBeInTheDocument()
    expect(within(bestRow('Best 1 min')).queryByText('Estimated')).not.toBeInTheDocument()
  })

  it('marks a ride best as estimated when its power is estimated', () => {
    renderPage(
      { ...powerRide, powerSource: 'virtual' },
      resultWith({ rideCurve: rideCurveFixture }),
    )
    expect(within(bestRow('Best 1 min')).getByText('Estimated')).toBeInTheDocument()
  })

  it("holds a ride's best efforts until the weight is entered, with the prompt to add it", () => {
    renderPage(
      powerRide,
      resultWith({ rideCurve: rideCurveFixture }),
      'metric',
      new Map(),
      undefined,
      undefined,
      undefined,
      { weightKnown: false },
    )
    expect(screen.queryByText('1,400 W')).not.toBeInTheDocument()
    expect(screen.getByText(/Add your weight on/)).toBeInTheDocument()
  })

  it('shows no ride record chips until the weight is entered', () => {
    renderPage(
      powerRide,
      resultWith(),
      'metric',
      new Map([['activity-1', [{ kind: 'duration', durationS: 1200 }]]]),
      undefined,
      undefined,
      undefined,
      { weightKnown: false },
    )
    expect(screen.queryByRole('group', { name: 'All-time records' })).toBeNull()
  })

  it('lists only the durations this activity set', () => {
    renderPage(morningRun, resultWith({ runCurve: curveOf({ 300: 15.6 }) }))
    expect(within(bestRow('Best 5 min')).getByText('4:31 /km')).toBeInTheDocument()
    expect(
      screen.queryByText('Best 1 min', { selector: '.records__label' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Best 20 min', { selector: '.records__label' }),
    ).not.toBeInTheDocument()
  })

  it('shows no best efforts section when the activity set none, rather than saying so', () => {
    renderPage(makeActivity({ id: 'run-2', name: 'Easy run' }))
    expect(screen.queryByRole('heading', { name: 'Best efforts set here' })).not.toBeInTheDocument()
    expect(screen.queryByText(/None of your best efforts/)).not.toBeInTheDocument()
  })

  it('names the all-time records of an activity outside the period, and never says they are not counted', () => {
    render(
      <ActivityPage
        signedIn={false}
        activity={morningRun}
        library={[morningRun]}
        result={resultWith()}
        zoneEstimates={null}
        units="metric"
        massKg={70}
        weightKnown
        heartRateJudgement={NO_HEART_RATE_JUDGEMENT}
        profile={MAN_BORN_1986}
        records={new Map([['activity-1', [{ kind: 'duration', durationS: 300 }]]])}
        loadSplits={vi.fn(async () => null)}
        routeId={null}
        loadRoute={NO_ROUTE.loadRoute}
        period={DATED}
      />,
    )
    // The chip above and the section agree on the record, whatever period the page last held.
    const group = screen.getByRole('group', { name: 'All-time records' })
    expect(within(group).getByText('Best 5 min')).toBeInTheDocument()
    expect(
      within(bestsSection()).getByText(/All-time records here: Best 5 min\./),
    ).toBeInTheDocument()
    expect(screen.queryByText(/not counted/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Outside/)).not.toBeInTheDocument()
  })

  it('groups the skipped readings by kind, one line for each kind, with the times of its readings', () => {
    renderPage(
      makeActivity({
        id: 'activity-1',
        name: 'Noisy run',
        flags: [
          { kind: 'hr-dropout', start: 65, end: 125, message: 'Heart rate read zero' },
          { kind: 'speed-spike', start: 300, end: 301, message: 'GPS jumped' },
          { kind: 'hr-dropout', start: 600, end: 630, message: 'Heart rate read zero' },
        ],
        flagCounts: { 'hr-dropout': 2, 'speed-spike': 1 },
      }),
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Skipped readings' })).toBeInTheDocument()
    // Each kind's line carries its count, so the page does not also say the total.
    expect(screen.queryByText(/Readings skipped/)).not.toBeInTheDocument()
    expect(
      screen.getByText(
        'Heart rate was missing or too low while moving 2 times. We left those out of your figures.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('from 1:05 to 2:05, 1 min')).toBeInTheDocument()
    expect(screen.getByText('from 10:00 to 10:30, 30 s')).toBeInTheDocument()
    expect(
      screen.getByText('GPS speed jumped suddenly once. We left that out of your figures.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/impossible/)).not.toBeInTheDocument()
  })

  it('keeps altitude notes out of the skipped count, under a Data notes heading', () => {
    renderPage(
      makeActivity({
        id: 'activity-1',
        name: 'Barometer run',
        flags: [
          { kind: 'altitude-jump', start: 754, end: 755, message: 'Altitude jumped' },
          { kind: 'missing-altitude', start: 0, end: 3600, message: 'No altitude' },
        ],
        flagCounts: { 'altitude-jump': 1, 'missing-altitude': 1 },
      }),
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Data notes' })).toBeInTheDocument()
    expect(screen.queryByText(/readings? skipped/)).not.toBeInTheDocument()
    expect(
      screen.getByText(
        'Altitude jumped in a single second once. We left the climb and the slope-based figures near that jump out of your figures.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText('No altitude was recorded, so climb and slope-based figures are not shown.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/from 0:00/)).not.toBeInTheDocument()
  })

  it('gives the true count of a kind, not the number of its flags the digest kept', () => {
    renderPage(
      makeActivity({
        id: 'activity-1',
        name: 'Strap run',
        flags: [
          { kind: 'hr-dropout', start: 65, end: 125, message: 'Heart rate read zero' },
          { kind: 'hr-dropout', start: 300, end: 330, message: 'Heart rate read zero' },
          { kind: 'hr-dropout', start: 600, end: 640, message: 'Heart rate read zero' },
        ],
        flagCounts: { 'hr-dropout': 7 },
      }),
    )
    expect(screen.queryByText(/Readings skipped/)).not.toBeInTheDocument()
    expect(
      screen.getByText(
        'Heart rate was missing or too low while moving 7 times. We left those out of your figures.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Showing the first 3 of 7.')).toBeInTheDocument()
  })

  it('hides the Climb figure when elevation gain is zero, so a missing altitude shows no climb', () => {
    renderPage(
      makeActivity({
        id: 'activity-1',
        name: 'No altitude run',
        elevationGainM: 0,
        flags: [{ kind: 'missing-altitude', start: 0, end: 3600, message: 'No altitude' }],
        flagCounts: { 'missing-altitude': 1 },
      }),
    )
    expect(screen.queryByText('Climb', { selector: 'dt' })).not.toBeInTheDocument()
    expect(
      screen.getByText('No altitude was recorded, so climb and slope-based figures are not shown.'),
    ).toBeInTheDocument()
  })

  it('lists no kind whose count is zero', () => {
    renderPage(
      makeActivity({
        id: 'activity-1',
        name: 'Quiet run',
        flags: [{ kind: 'speed-spike', start: 300, end: 301, message: 'GPS jumped' }],
        flagCounts: { 'hr-dropout': 0, 'speed-spike': 1 },
      }),
    )
    expect(screen.queryByText(/Heart rate was missing/)).not.toBeInTheDocument()
    expect(
      screen.getByText('GPS speed jumped suddenly once. We left that out of your figures.'),
    ).toBeInTheDocument()
  })

  it('names an indoor ride’s speed jump without GPS', () => {
    renderPage(
      makeActivity({
        id: 'activity-1',
        name: 'Trainer ride',
        sport: 'ride',
        indoor: true,
        flags: [{ kind: 'speed-spike', start: 300, end: 301, message: 'GPS jumped' }],
        flagCounts: { 'speed-spike': 1 },
      }),
    )
    expect(
      screen.getByText('Speed jumped suddenly once. We left that out of your figures.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/GPS/)).not.toBeInTheDocument()
  })

  it('shows no skipped readings when the activity has none', () => {
    renderPage(morningRun)
    expect(screen.queryByRole('heading', { name: 'Skipped readings' })).not.toBeInTheDocument()
  })

  it('groups the count of readings and of listed flags from a thousand on', () => {
    renderPage(
      makeActivity({
        id: 'activity-1',
        name: 'Strap run',
        flags: [{ kind: 'hr-dropout', start: 65, end: 125, message: 'Heart rate read zero' }],
        flagCounts: { 'hr-dropout': 1060 },
      }),
    )
    expect(
      screen.getByText(
        'Heart rate was missing or too low while moving 1,060 times. We left those out of your figures.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Showing the first 1 of 1,060.')).toBeInTheDocument()
  })

  it('says how many are listed when there are more readings skipped than the digest keeps', () => {
    renderPage(
      makeActivity({
        id: 'activity-1',
        name: 'Strap run',
        flags: [{ kind: 'hr-dropout', start: 65, end: 125, message: 'Heart rate read zero' }],
        flagCounts: { 'hr-dropout': 60 },
      }),
    )
    expect(screen.queryByText(/Readings skipped/)).not.toBeInTheDocument()
    expect(screen.getByText('Showing the first 1 of 60.')).toBeInTheDocument()
  })

  it('links to the activities either side of this one in the library, and to its sport and method', () => {
    const day = 86_400_000
    const newer = makeActivity({
      id: 'newer',
      name: 'Newer run',
      startMs: morningRun.startMs + day,
    })
    const older = makeActivity({
      id: 'older',
      name: 'Older run',
      startMs: morningRun.startMs - day,
    })
    renderPage(morningRun, resultWith(), 'metric', new Map(), undefined, undefined, undefined, {
      library: [newer, morningRun, older],
    })
    expect(screen.getByRole('link', { name: 'Later: Newer run' })).toHaveAttribute(
      'href',
      '#/activities/newer',
    )
    expect(screen.getByRole('link', { name: 'Earlier: Older run' })).toHaveAttribute(
      'href',
      '#/activities/older',
    )
    expect(screen.getByRole('link', { name: 'Your run records' })).toHaveAttribute('href', '#/run')
    // The footer links to How sure is this? on every page, so the activity's own links do not.
    expect(screen.queryByRole('link', { name: 'How sure is this?' })).not.toBeInTheDocument()
  })

  it('offers Delete for a saved activity, and asks before it removes the saved copy', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    renderPage(
      morningRun,
      resultWith(),
      'metric',
      new Map(),
      undefined,
      { routeId: 'saved-1', loadRoute: NO_ROUTE.loadRoute },
      undefined,
      { onDelete },
    )
    await user.click(screen.getByRole('button', { name: 'Delete Morning run' }))
    expect(onDelete).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalledWith('saved-1')
  })

  it('stays on the activity, and says why, when the delete fails', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    const route = { routeId: 'saved-1', loadRoute: NO_ROUTE.loadRoute }
    window.history.replaceState(null, '', '#/activities/activity-1')
    const view = renderPage(
      morningRun,
      resultWith(),
      'metric',
      new Map(),
      undefined,
      route,
      undefined,
      { onDelete },
    )
    await user.click(screen.getByRole('button', { name: 'Delete Morning run' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    view.rerender(
      pageElement(morningRun, resultWith(), 'metric', new Map(), undefined, route, undefined, {
        onDelete,
        libraryError: 'Could not delete this activity. Try again.',
      }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not delete this activity. Try again.',
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Morning run' })).toBeInTheDocument()
    expect(window.location.hash).toBe('#/activities/activity-1')
  })

  it('goes to the list once the delete has worked, replacing this page in the history', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    const route = { routeId: 'saved-1', loadRoute: NO_ROUTE.loadRoute }
    window.history.replaceState(null, '', '#/activities/activity-1')
    const entries = window.history.length
    const view = renderPage(
      morningRun,
      resultWith(),
      'metric',
      new Map(),
      undefined,
      route,
      undefined,
      { onDelete },
    )
    await user.click(screen.getByRole('button', { name: 'Delete Morning run' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(window.location.hash).toBe('#/activities/activity-1')
    view.rerender(
      pageElement(morningRun, resultWith(), 'metric', new Map(), undefined, route, undefined, {
        onDelete,
        libraryNotice: 'Deleted Morning run.',
      }),
    )
    await waitFor(() => expect(window.location.hash).toBe('#/activities?removed=1'))
    expect(window.history.length).toBe(entries)
    window.history.replaceState(null, '', '#/')
  })

  it('offers no Delete for an activity that is not saved, as with the sample', () => {
    renderPage(morningRun)
    expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument()
  })

  it('asks for the splits of the run it shows, and shows them in a Splits section', async () => {
    const loadSplits = vi.fn(async () => twoKilometres)
    renderPage(morningRun, resultWith(), 'metric', new Map(), loadSplits)
    expect(loadSplits).toHaveBeenCalledWith('activity-1')
    expect(await screen.findByRole('heading', { level: 2, name: 'Splits' })).toBeInTheDocument()
    const table = await screen.findByRole('table', { name: 'Pace for each kilometre' })
    const [first, second] = within(table).getAllByRole('row').slice(1)
    expect(within(first!).getByText('5:00 /km')).toBeInTheDocument()
    expect(within(first!).getByText('4:50 /km')).toBeInTheDocument()
    expect(within(second!).getByText('Fastest')).toBeInTheDocument()
    expect(screen.getAllByText(FLAT_PACE_NOTE)).toHaveLength(1)
  })

  it('says a run whose splits were not kept has none, and shows no table', async () => {
    renderPage(
      morningRun,
      resultWith(),
      'metric',
      new Map(),
      vi.fn(async () => null),
    )
    expect(
      await screen.findByText('Splits were not kept when this run was added.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('says the splits could not be loaded when the worker fails to answer', async () => {
    renderPage(
      morningRun,
      resultWith(),
      'metric',
      new Map(),
      vi.fn(async () => Promise.reject(new Error('x'))),
    )
    expect(await screen.findByText(/The splits could not be loaded/)).toBeInTheDocument()
  })

  it('shows no splits section for a ride, and asks for none', () => {
    const loadSplits = vi.fn(async () => twoKilometres)
    renderPage(powerRide, resultWith(), 'metric', new Map(), loadSplits)
    expect(screen.queryByRole('heading', { name: 'Splits' })).not.toBeInTheDocument()
    expect(loadSplits).not.toHaveBeenCalled()
  })
})

describe('the flat pace note', () => {
  /** Splits whose flat pace equals the pace, so the splits show no flat pace column. */
  const samePace: DigestSplits = {
    km: [
      {
        distanceM: 1000,
        seconds: 300,
        gradeAdjustedSeconds: 300,
        elevationGainM: 12,
        avgHeartRate: 150,
      },
    ],
    mile: [],
  }

  it('sits under the splits, and not under the bests, when the splits show a flat pace', async () => {
    renderPage(
      morningRun,
      resultWith(),
      'metric',
      new Map(),
      vi.fn(async () => twoKilometres),
    )
    await screen.findByRole('table', { name: 'Pace for each kilometre' })
    expect(within(splitsSection()).getByText(FLAT_PACE_NOTE)).toBeInTheDocument()
    expect(within(bestsSection()).queryByText(FLAT_PACE_NOTE)).not.toBeInTheDocument()
  })

  it('moves under the bests when the splits show no flat pace, and a best carries a Flat mark', async () => {
    renderPage(
      morningRun,
      resultWith(),
      'metric',
      new Map(),
      vi.fn(async () => samePace),
    )
    await screen.findByRole('table', { name: 'Pace for each kilometre' })
    expect(within(splitsSection()).queryByText(FLAT_PACE_NOTE)).not.toBeInTheDocument()
    expect(await within(bestsSection()).findByText(FLAT_PACE_NOTE)).toBeInTheDocument()
  })

  it('sits under the bests when the splits are not kept', async () => {
    renderPage(morningRun)
    expect(
      await screen.findByText('Splits were not kept when this run was added.'),
    ).toBeInTheDocument()
    expect(await within(bestsSection()).findByText(FLAT_PACE_NOTE)).toBeInTheDocument()
    expect(within(splitsSection()).queryByText(FLAT_PACE_NOTE)).not.toBeInTheDocument()
  })

  it('sits under the bests when the run is too short to split', async () => {
    renderPage(
      morningRun,
      resultWith(),
      'metric',
      new Map(),
      vi.fn(async () => ({ km: [], mile: [] })),
    )
    expect(await within(bestsSection()).findByText(FLAT_PACE_NOTE)).toBeInTheDocument()
    expect(within(splitsSection()).getByText('This run is too short to split.')).toBeInTheDocument()
  })

  it('is left out when no best carries a Flat mark and the splits are not kept', async () => {
    renderPage(
      makeActivity({
        id: 'activity-1',
        name: 'Tempo run',
        distanceBests: [{ distanceM: 5000, seconds: 1300 }],
      }),
      resultWith({ runCurve: curveOf({}) }),
    )
    expect(
      await screen.findByText('Splits were not kept when this run was added.'),
    ).toBeInTheDocument()
    expect(bestRow('Best 5 km')).toBeInTheDocument()
    expect(screen.queryByText(FLAT_PACE_NOTE)).not.toBeInTheDocument()
  })

  it('waits for the splits before it is placed, so it is never in two places at once', () => {
    renderPage(
      morningRun,
      resultWith(),
      'metric',
      new Map(),
      vi.fn(() => new Promise<DigestSplits | null>(() => undefined)),
    )
    expect(screen.getByText('Loading splits.')).toBeInTheDocument()
    expect(screen.queryByText(FLAT_PACE_NOTE)).not.toBeInTheDocument()
  })

  it('sits under the bests when the splits fail to load and a best carries a Flat mark', async () => {
    renderPage(
      morningRun,
      resultWith(),
      'metric',
      new Map(),
      vi.fn(() => Promise.reject(new Error('worker down'))),
    )
    expect(await screen.findByText(/The splits could not be loaded/)).toBeInTheDocument()
    expect(await within(bestsSection()).findByText(FLAT_PACE_NOTE)).toBeInTheDocument()
    expect(within(splitsSection()).queryByText(FLAT_PACE_NOTE)).not.toBeInTheDocument()
  })

  it('never sits on a ride, whose best efforts carry no Flat mark', () => {
    renderPage(
      powerRide,
      resultWith({ rideCurve: rideCurveFixture }),
      'metric',
      new Map(),
      undefined,
    )
    expect(
      screen.getByRole('heading', { level: 2, name: 'Best efforts set here' }),
    ).toBeInTheDocument()
    expect(screen.queryByText(FLAT_PACE_NOTE)).not.toBeInTheDocument()
  })
})

describe('ActivityPage records earned', () => {
  const held: ReadonlyMap<string, EarnedRecord[]> = new Map([
    [
      'activity-1',
      [
        { kind: 'duration', durationS: 300 },
        { kind: 'duration', durationS: 3600 },
        { kind: 'distance', distanceM: 5000 },
      ],
    ],
  ])

  it('lists every record the activity holds in one All-time records group', () => {
    renderPage(morningRun, resultWith(), 'metric', held)
    const group = screen.getByRole('group', { name: 'All-time records' })
    expect(within(group).getByText('Best 5 min')).toBeTruthy()
    expect(within(group).getByText('Best 60 min')).toBeTruthy()
    expect(within(group).getByText('Best 5 km')).toBeTruthy()
    expect(within(group).queryByText(/more/)).toBeNull()
  })

  it('links each all-time record chip to the sport page its records are on', () => {
    renderPage(morningRun, resultWith(), 'metric', held)
    const group = screen.getByRole('group', { name: 'All-time records' })
    expect(within(group).getByRole('link', { name: 'Best 5 min' })).toHaveAttribute('href', '#/run')
  })

  it('shows no Best efforts group for an activity that holds nothing', () => {
    renderPage(morningRun)
    expect(screen.queryByRole('group', { name: 'All-time records' })).toBeNull()
  })
})

describe('route shape', () => {
  const SHAPE = {
    points: [
      [0, 0],
      [1, 1],
    ] as [number, number][],
    aspect: 1,
  }
  const DRAWN = 'Route shape of this run'

  it('draws a route the device library or this tab holds at once, with no offer to read the file', async () => {
    const loadRoute = vi.fn(async (): Promise<RouteReply> => ({ kind: 'shape', route: SHAPE }))
    renderPage(makeActivity(), resultWith(), 'metric', undefined, undefined, {
      routeId: 'saved-1',
      loadRoute,
    })

    expect(await screen.findByRole('img', { name: DRAWN })).toBeInTheDocument()
    expect(loadRoute).toHaveBeenCalledOnce()
    expect(loadRoute).toHaveBeenCalledWith('saved-1', false)
    expect(screen.queryByRole('button', { name: 'Show route' })).toBeNull()
  })

  it('sets the figures beside a drawn route, and by themselves without one', async () => {
    const loadRoute = vi.fn(async (): Promise<RouteReply> => ({ kind: 'shape', route: SHAPE }))
    const view = renderPage(makeActivity(), resultWith(), 'metric', undefined, undefined, {
      routeId: 'saved-1',
      loadRoute,
    })
    const route = await screen.findByRole('img', { name: DRAWN })
    const top = route.closest('.activity-page__top')
    expect(top).toHaveClass('activity-page__top--route')
    expect(top).toContainElement(screen.getByText('Distance'))
    view.unmount()

    renderPage(makeActivity())
    expect(screen.getByText('Distance').closest('.activity-page__top')).not.toHaveClass(
      'activity-page__top--route',
    )
  })

  it('offers to show a route from the kept file, and reads nothing until asked', async () => {
    const loadRoute = vi.fn(async (): Promise<RouteReply> => ({ kind: 'original' }))
    renderPage(makeActivity(), resultWith(), 'metric', undefined, undefined, {
      routeId: 'saved-1',
      loadRoute,
    })

    const button = await screen.findByRole('button', { name: 'Show route' })
    expect(button).not.toHaveAttribute('aria-disabled', 'true')
    expect(loadRoute).toHaveBeenCalledOnce()
    expect(loadRoute).toHaveBeenCalledWith('saved-1', false)
    expect(screen.queryByRole('img', { name: DRAWN })).toBeNull()
  })

  it('reads the kept file when asked, shows the button as busy meanwhile, then draws the outline', async () => {
    const user = userEvent.setup()
    let finish: (reply: RouteReply) => void = () => undefined
    const loadRoute = vi.fn((_id: string, fromOriginal: boolean): Promise<RouteReply> =>
      fromOriginal
        ? new Promise<RouteReply>((resolve) => {
            finish = resolve
          })
        : Promise.resolve({ kind: 'original' }),
    )
    renderPage(makeActivity(), resultWith(), 'metric', undefined, undefined, {
      routeId: 'saved-1',
      loadRoute,
    })

    await user.click(await screen.findByRole('button', { name: 'Show route' }))

    expect(loadRoute).toHaveBeenLastCalledWith('saved-1', true)
    expect(screen.getByRole('button', { name: 'Show route' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'Reading the route from your original file.',
    )

    await user.click(screen.getByRole('button', { name: 'Show route' }))
    expect(loadRoute).toHaveBeenCalledTimes(2)

    await act(async () => finish({ kind: 'shape', route: SHAPE }))
    expect(await screen.findByRole('img', { name: DRAWN })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show route' })).toBeNull()
  })

  it('says so neutrally when the file cannot be read, and keeps the button to try again', async () => {
    const user = userEvent.setup()
    const loadRoute = vi.fn(async (_id: string, fromOriginal: boolean): Promise<RouteReply> =>
      fromOriginal ? { kind: 'failed' } : { kind: 'original' },
    )
    renderPage(makeActivity(), resultWith(), 'metric', undefined, undefined, {
      routeId: 'saved-1',
      loadRoute,
    })

    await user.click(await screen.findByRole('button', { name: 'Show route' }))

    expect(
      await screen.findByText('The route could not be read. Try again later.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show route' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('says when the kept file has no route to show, and offers nothing more', async () => {
    const user = userEvent.setup()
    const loadRoute = vi.fn(async (_id: string, fromOriginal: boolean): Promise<RouteReply> =>
      fromOriginal ? { kind: 'none' } : { kind: 'original' },
    )
    renderPage(makeActivity(), resultWith(), 'metric', undefined, undefined, {
      routeId: 'saved-1',
      loadRoute,
    })

    await user.click(await screen.findByRole('button', { name: 'Show route' }))

    expect(await screen.findByText('This file has no route to show.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show route' })).toBeNull()
  })

  it('asks for no route when the activity is not saved, as with the sample', () => {
    const loadRoute = vi.fn(async (): Promise<RouteReply> => ({ kind: 'shape', route: SHAPE }))
    renderPage(makeActivity(), resultWith(), 'metric', undefined, undefined, {
      routeId: null,
      loadRoute,
    })

    expect(loadRoute).not.toHaveBeenCalled()
    expect(screen.queryByRole('img', { name: /Route shape/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Show route' })).toBeNull()
  })

  it('moves focus to the drawn route once a read of the kept file draws it', async () => {
    const user = userEvent.setup()
    let finish: (reply: RouteReply) => void = () => undefined
    const loadRoute = vi.fn((_id: string, fromOriginal: boolean): Promise<RouteReply> =>
      fromOriginal
        ? new Promise<RouteReply>((resolve) => {
            finish = resolve
          })
        : Promise.resolve({ kind: 'original' }),
    )
    renderPage(makeActivity(), resultWith(), 'metric', undefined, undefined, {
      routeId: 'saved-1',
      loadRoute,
    })
    await user.click(await screen.findByRole('button', { name: 'Show route' }))

    await act(async () => finish({ kind: 'shape', route: SHAPE }))

    const figure = (await screen.findByRole('img', { name: DRAWN })).closest('figure')
    expect(figure).toHaveFocus()
  })

  it('moves focus to the status line when the kept file has no route to show', async () => {
    const user = userEvent.setup()
    const loadRoute = vi.fn(async (_id: string, fromOriginal: boolean): Promise<RouteReply> =>
      fromOriginal ? { kind: 'none' } : { kind: 'original' },
    )
    renderPage(makeActivity(), resultWith(), 'metric', undefined, undefined, {
      routeId: 'saved-1',
      loadRoute,
    })
    await user.click(await screen.findByRole('button', { name: 'Show route' }))

    expect(await screen.findByText('This file has no route to show.')).toHaveFocus()
  })

  it('keeps focus on the button when the read fails, so the visitor can try again', async () => {
    const user = userEvent.setup()
    const loadRoute = vi.fn(async (_id: string, fromOriginal: boolean): Promise<RouteReply> =>
      fromOriginal ? { kind: 'failed' } : { kind: 'original' },
    )
    renderPage(makeActivity(), resultWith(), 'metric', undefined, undefined, {
      routeId: 'saved-1',
      loadRoute,
    })
    await user.click(await screen.findByRole('button', { name: 'Show route' }))

    expect(
      await screen.findByText('The route could not be read. Try again later.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show route' })).toHaveFocus()
  })

  it('offers nothing on the first read when the activity has no route in the kept file either', async () => {
    const loadRoute = vi.fn(async (): Promise<RouteReply> => ({ kind: 'none' }))
    renderPage(makeActivity(), resultWith(), 'metric', undefined, undefined, {
      routeId: 'saved-1',
      loadRoute,
    })

    await waitFor(() => expect(loadRoute).toHaveBeenCalledWith('saved-1', false))
    await act(async () => undefined)

    expect(screen.queryByRole('button', { name: 'Show route' })).toBeNull()
    expect(screen.queryByRole('img', { name: DRAWN })).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('the back link', () => {
  // A click the page leaves alone is followed by jsdom, which moves the hash and replaces the history
  // state a moment later, over whatever the next test has set. Nothing here asserts a navigation, so none runs.
  const keepWhereItIs = (event: Event) => event.preventDefault()
  beforeEach(() => {
    document.addEventListener('click', keepWhereItIs)
  })

  afterEach(() => {
    document.removeEventListener('click', keepWhereItIs)
    window.history.replaceState(null, '', '#')
    vi.restoreAllMocks()
  })

  // Each origin sets its own history entry, so no case depends on the one before it. Back is taken
  // only for the list, Run and Ride; a visitor from any other page follows the link.
  it.each([
    { from: '#/run', label: 'Back to Run', href: '#/run', goesBack: true },
    { from: '#/ride', label: 'Back to Ride', href: '#/ride', goesBack: true },
    { from: '#/activities', label: 'Back to activities', href: '#/activities', goesBack: true },
    { from: '#/balance', label: 'Back to activities', href: '#/activities', goesBack: false },
    { from: undefined, label: 'Back to activities', href: '#/activities', goesBack: false },
  ])(
    'from $from reads "$label", links to $href, and takes Back only when $goesBack',
    async ({ from, label, href, goesBack }) => {
      window.history.replaceState(
        from === undefined
          ? { rcaEntry: 'activity-entry' }
          : { rcaEntry: 'activity-entry', rcaFrom: from },
        '',
      )
      const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined)
      renderPage(morningRun)
      const link = screen.getByRole('link', { name: label })
      expect(link).toHaveAttribute('href', href)
      await userEvent.click(link)
      expect(back).toHaveBeenCalledTimes(goesBack ? 1 : 0)
    },
  )

  it.each([
    ['a command click', { metaKey: true }],
    ['a control click', { ctrlKey: true }],
    ['a shift click', { shiftKey: true }],
    ['an alt click', { altKey: true }],
    ['a middle button click', { button: 1 }],
  ])('leaves %s to the browser, which opens the list as a link does', (_name, modifier) => {
    window.history.replaceState({ rcaEntry: 'activity-entry', rcaFrom: '#/activities' }, '')
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined)
    renderPage(morningRun)
    fireEvent.click(screen.getByRole('link', { name: 'Back to activities' }), modifier)
    expect(back).not.toHaveBeenCalled()
  })
})

describe('ActivityPage layout around the timeline', () => {
  const heartRun = { ...morningRun, avgHeartRate: 150, maxHeartRate: 171 }

  it('puts the distance and pace in the key strip and the climb and heart rate in the tiles that follow the timeline', async () => {
    renderPage(heartRun)
    const key = document.querySelector('.activity-page__stats--key')!
    const more = document.querySelector('.activity-page__stats--more')!
    expect(
      within(key as HTMLElement)
        .getAllByRole('term')
        .map((t) => t.textContent),
    ).toEqual(['Distance', 'Average pace'])
    expect(
      within(more as HTMLElement)
        .getAllByRole('term')
        .map((t) => t.textContent),
    ).toEqual(['Climb', 'Average heart rate'])
  })

  it('leads a ride with its power in the key strip, and gives its speed to the tiles below', () => {
    renderPage({ ...powerRide, avgPowerW: 210 })
    const key = document.querySelector('.activity-page__stats--key') as HTMLElement
    expect(
      within(key)
        .getAllByRole('term')
        .map((t) => t.textContent),
    ).toEqual(['Distance', 'Average power'])
    expect(
      within(document.querySelector('.activity-page__stats--more') as HTMLElement).getByText(
        'Average speed',
      ),
    ).toBeInTheDocument()
  })

  it('becomes a summary with a note after it when the recording is not kept, and offers the file as a quiet action', async () => {
    const onAddFiles = vi.fn()
    renderPage(morningRun, undefined, 'metric', undefined, undefined, undefined, undefined, {
      loadTrace: async () => ({ kind: 'missing' }),
      onAddFiles,
    })
    await screen.findByText(/aren't kept on this device/)
    await waitFor(() =>
      expect(document.querySelector('.activity-page__main')).toHaveClass(
        'activity-page__main--summary-only',
      ),
    )
    expect(document.querySelector('.activity-workbench')).toHaveClass('activity-workbench--note')
    expect(screen.getByRole('button', { name: "Add this activity's file again" })).not.toHaveClass(
      'btn-primary',
    )
  })

  it('leads an estimated-power ride with its speed, and gives the estimate to the tiles below', () => {
    renderPage({ ...powerRide, powerSource: 'virtual', avgPowerW: 180 })
    const key = document.querySelector('.activity-page__stats--key') as HTMLElement
    expect(
      within(key)
        .getAllByRole('term')
        .map((t) => t.textContent),
    ).toEqual(['Distance', 'Average speed'])
    expect(
      within(document.querySelector('.activity-page__stats--more') as HTMLElement).getByText(
        'Average power',
      ),
    ).toBeInTheDocument()
  })

  it('gives the whole-activity readout the header’s average pace on a run with a pause in it', async () => {
    // Ten minutes at 3 m/s with a hundred seconds paused: 500 s moving, 1,497 m to the last sample.
    const seconds = 600
    const paused = Uint8Array.from({ length: seconds }, (_, i) => (i >= 200 && i < 300 ? 1 : 0))
    let metres = 0
    const distance = Float64Array.from({ length: seconds }, (_, i) => {
      const here = metres
      if (paused[i] !== 1) metres += 3
      return here
    })
    const trace: ActivityTrace = {
      version: 1,
      activityId: 'activity-1',
      sport: 'run',
      durationS: seconds,
      distance,
      paused,
      unrecorded: new Uint8Array(seconds),
      streams: { speed: Float32Array.from({ length: seconds }, (_, i) => 3 + (i % 2) * 0.0001) },
      laps: [],
    }
    renderPage(
      { ...morningRun, durationS: seconds, movingS: 500, distanceM: distance[seconds - 1]! },
      undefined,
      'metric',
      undefined,
      undefined,
      undefined,
      undefined,
      { loadTrace: async () => ({ kind: 'trace', trace }) },
    )
    await waitFor(() => expect(document.querySelector('.ts-readout')).not.toBeNull())
    const readout = document.querySelector('.ts-readout') as HTMLElement
    expect(readout).toHaveTextContent('SelectionAverage')
    const key = document.querySelector('.activity-page__stats--key') as HTMLElement
    const header = within(key).getByText(/\/km$/).textContent!
    expect(readout).toHaveTextContent(`Pace${header.replace(' ', '')}`)
  })
})

describe('ActivityPage: a run at walking pace the athlete may count', () => {
  const hike = makeActivity({
    id: 'activity-1',
    name: 'Slow loop',
    sport: 'run',
    walkingPace: true,
  })

  it('offers to count it, beside the line that says it is left out', () => {
    const onCount = vi.fn(() => null)
    renderPage(hike, undefined, undefined, undefined, undefined, undefined, undefined, {
      walkingChoice: { counted: false, onCount, onStop: vi.fn(() => null) },
    })
    expect(
      screen.getByText('This run is at walking pace, so it is left out of your run analysis.'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Count this run' }))
    expect(onCount).toHaveBeenCalledTimes(1)
  })

  it('shows a counted run with its bests, says it is counted, and offers the way back', () => {
    const onStop = vi.fn(() => null)
    const counted = { ...hike, walkingPace: undefined }
    renderPage(counted, undefined, undefined, undefined, undefined, undefined, undefined, {
      walkingChoice: { counted: true, onCount: vi.fn(() => null), onStop },
    })
    expect(
      screen.getByText(/You count it as a run, so it is in your run analysis\./),
    ).toBeInTheDocument()
    expect(screen.getByText('Walking pace')).toHaveClass('chip')
    expect(
      screen.getByRole('heading', { level: 2, name: 'Best efforts set here' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Leave this run out' }))
    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it('offers no choice on an ordinary run', () => {
    renderPage(
      makeActivity({ sport: 'run' }),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        walkingChoice: { counted: false, onCount: vi.fn(() => null), onStop: vi.fn(() => null) },
      },
    )
    expect(
      screen.queryByRole('button', { name: /Count this run|Leave this run out/ }),
    ).not.toBeInTheDocument()
  })
})
