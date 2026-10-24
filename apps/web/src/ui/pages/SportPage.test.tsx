// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SportCurves, TrendPoint } from '@rca/core/digest'
import { EFFORT_LENGTHS_S, NO_TRENDS } from '@rca/core/digest/trendPoints'
import type { EffortLengthS } from '@rca/core/digest/trendPoints'
import type { AnalysisResult } from '@rca/core/pipeline'
import { FLAT_RUN_COST, HEADLINE_DURATION_S, RESTING_W_PER_KG } from '@rca/core/constants'
import { ROAD_STANDARDS_SOURCE } from '@rca/core/grade'
import { formatPace } from '@rca/core/units'
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
  previous: SportCurves | null = null,
  previousLabel: string | null = null,
  trends: Readonly<Record<EffortLengthS, readonly TrendPoint[]>> = NO_TRENDS,
  weighted = true,
  footnote: ReactNode = null,
  rangeDays: number | null = 42,
  emptyText = 'Nothing in this period.',
) {
  return render(
    <SportPage
      sport={sport}
      result={result}
      previous={previous}
      previousLabel={previousLabel}
      trends={trends}
      windowDays={14}
      units={units}
      massKg={75}
      weighted={weighted}
      profile={profile}
      rangeDays={rangeDays}
      controls={<span>Period picker</span>}
      footnote={footnote}
      emptyText={emptyText}
      onAddFiles={vi.fn()}
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

  it("offers the sport's files from its empty page, as a secondary action that hands them on", () => {
    const onAddFiles = vi.fn()
    render(
      <SportPage
        sport="run"
        result={makeResult({ activities: [makeActivity({ id: 'ride', sport: 'ride' })] })}
        previous={null}
        previousLabel={null}
        trends={NO_TRENDS}
        windowDays={14}
        units="metric"
        massKg={75}
        profile={null}
        controls={<span>Period picker</span>}
        weighted
        rangeDays={42}
        emptyText="No runs between 12 May and 3 Aug 2025. You have 1 run in All time."
        onAddFiles={onAddFiles}
      />,
    )
    const add = screen.getByRole('button', { name: 'Add runs' })
    expect(add).toHaveClass('btn')
    expect(add).not.toHaveClass('btn-primary')
    const file = new File(['x'], 'run.fit')
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [file] },
    })
    expect(onAddFiles).toHaveBeenCalledWith([file])
  })

  it('shows the empty text it is given, naming the period, when there are none in the period', () => {
    renderPage(
      'run',
      makeResult({ activities: [makeActivity({ id: 'ride', sport: 'ride' })] }),
      'metric',
      null,
      null,
      null,
      NO_TRENDS,
      true,
      null,
      42,
      'No runs between 12 May and 3 Aug 2025. You have 1 run in All time.',
    )

    expect(
      screen.getByText('No runs between 12 May and 3 Aug 2025. You have 1 run in All time.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Best efforts' })).not.toBeInTheDocument()
  })

  it('asks for rides when the library has none, in the words it is given', () => {
    renderPage(
      'ride',
      makeResult({ activities: [morningRun] }),
      'metric',
      null,
      null,
      null,
      NO_TRENDS,
      true,
      null,
      42,
      'Your files have no rides yet. Add rides to see your records.',
    )

    expect(
      screen.getByText('Your files have no rides yet. Add rides to see your records.'),
    ).toBeInTheDocument()
  })

  it('shows the running threshold as a named pace estimate, and what it rests on', () => {
    renderPage('run', makeResult({ activities: [morningRun] }))

    const section = screen.getByRole('region', { name: 'Threshold pace, estimated' })
    expect(within(section).getByText('23:23 /km')).toBeInTheDocument()
    expect(within(section).getByText('Based on 1 run in this period.')).toBeInTheDocument()
  })

  it('says what the threshold means, about the pace, and names its 3 to 20 min basis', () => {
    renderPage('run', makeResult({ activities: [morningRun] }))

    const section = screen.getByRole('region', { name: 'Threshold pace, estimated' })
    expect(
      within(section).getByText(
        'About the pace you could hold for a long, steady effort, estimated from your best 3 to 20 min efforts.',
      ),
    ).toBeInTheDocument()
  })

  it('says the figures are in all your files under All time, not in a period', () => {
    renderPage(
      'run',
      makeResult({ activities: [morningRun] }),
      'metric',
      null,
      null,
      null,
      NO_TRENDS,
      true,
      null,
      null,
    )

    const section = screen.getByRole('region', { name: 'Threshold pace, estimated' })
    expect(within(section).getByText('Based on 1 run in all your files.')).toBeInTheDocument()
    expect(within(section).queryByText(/in this period/)).not.toBeInTheDocument()
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

  it('asks for a harder effort between 3 and 20 min when the efforts show no threshold', () => {
    renderPage('run', makeResult({ activities: [morningRun], runCp: null, runCpRefusal: 'shape' }))

    expect(screen.getByText('Needs a harder effort between 3 and 20 min')).toBeInTheDocument()
    expect(screen.queryByText(/About the pace/)).not.toBeInTheDocument()
  })

  it('asks for efforts between 3 and 20 min instead of a number when no threshold can be estimated', () => {
    renderPage('run', makeResult({ activities: [morningRun], runCp: null }))

    expect(screen.getByText('Needs efforts between 3 and 20 min')).toBeInTheDocument()
    expect(screen.queryByText(/\/km$/)).not.toBeInTheDocument()
  })

  it('explains that run paces are flat paces', () => {
    renderPage('run', makeResult({ activities: [morningRun] }))

    expect(
      screen.getByText('Flat pace: your pace allowing for hills, as if on level ground.'),
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
    expect(within(records).getByText('Best 1 hour')).toBeInTheDocument()
    expect(
      within(records).getAllByRole('link', { name: 'Morning run, Mon 5 Jan' })[0],
    ).toHaveAttribute('href', '#/activities/run-1')
  })

  it('marks each run record’s pace Flat on the run page', () => {
    renderPage(
      'run',
      makeResult({
        activities: [morningRun],
        runCurve: [curvePoint(300, 4.1, 'run-1'), curvePoint(1200, 3.6, 'run-1')],
      }),
    )
    expect(
      within(screen.getByRole('region', { name: 'Best efforts' })).getAllByText('Flat'),
    ).toHaveLength(2)
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

  it('leaves the flat pace note off the cycling page', () => {
    renderPage('ride', makeResult({ activities: [makeActivity({ id: 'ride-1', sport: 'ride' })] }))

    expect(
      screen.queryByText('Flat pace: your pace allowing for hills, as if on level ground.'),
    ).not.toBeInTheDocument()
  })

  it('shows every duration as a chart section', () => {
    renderPage('run', makeResult({ activities: [morningRun] }))

    expect(screen.getByRole('region', { name: 'Pace curve' })).toBeInTheDocument()
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
    expect(within(recordNamed(records, 'Best 20 min')).getByText('Local · 67%')).toBeInTheDocument()
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
    expect(recordNamed(records, 'Best 20 min').querySelector('.records__grade')?.textContent).toBe(
      'Estimated through its running equivalent · Local to Regional · 67% (63–71%)',
    )
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
    const source = within(records).getByText(/Age grades for a man use the/)
    expect(source).toHaveTextContent(
      'Age is counted from your birth year on the date of each effort.',
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
    expect(within(records).getByText(/Age grades for a woman use the/)).toBeInTheDocument()
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
    expect(screen.getByText(/Age grades for a man use the/)).toBeInTheDocument()
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

    expect(screen.queryByText(/Age grades for a/)).not.toBeInTheDocument()
    expect(screen.queryByText(/use the/)).not.toBeInTheDocument()
  })

  it('names no sex and no standards line when the profile is set but no record has a grade', () => {
    // A run with a profile, whose only best effort is too short to grade: no record shows a grade,
    // so the page does not name the sex the grades are for.
    renderPage(
      'run',
      makeResult({
        activities: [morningRun],
        runCurve: [curvePoint(60, flatWkg(8), 'run-1')],
      }),
      'metric',
      MAN_BORN_1986,
    )

    expect(screen.queryByText(/Age grades for a/)).not.toBeInTheDocument()
    expect(screen.queryByText(/use the/)).not.toBeInTheDocument()
  })

  it('compares the best efforts with the period before, when one is selected', () => {
    const result = makeResult({
      activities: [morningRun],
      runCurve: [curvePoint(60, flatWkg(5), 'run-1'), curvePoint(1200, flatWkg(4), 'run-1')],
    })
    const previous: SportCurves = {
      runCurve: [curvePoint(60, flatWkg(4.8), 'run-0'), curvePoint(1200, flatWkg(3.8), 'run-0')],
      rideCurve: [],
    }
    renderPage('run', result, 'metric', null, previous, 'Previous 6 weeks')

    expect(
      screen.getByRole('figure', { name: 'Running flat pace per kilometre by duration' }),
    ).toBeInTheDocument()
    const legend = screen.getByRole('list', { name: 'Legend' })
    expect(within(legend).getByText('Previous 6 weeks')).toBeInTheDocument()
  })

  it('draws no comparison for all time', () => {
    renderPage('run', makeResult({ activities: [morningRun] }))
    expect(screen.queryByRole('list', { name: 'Legend' })).toBeNull()
  })
})

describe('SportPage fitness trend', () => {
  /** The effort lengths, shortest first: 5, 20 and 60 minutes. */
  const [FIVE_MIN_S, TWENTY_MIN_S, SIXTY_MIN_S] = EFFORT_LENGTHS_S

  /** A week ending on a Sunday, with a running value in metabolic W/kg. */
  const week = (index: number, runWkg: number): TrendPoint => ({
    endMs: Date.UTC(2026, 0, 11 + index * 7, 23, 59, 59, 999),
    runWkg,
    rideWkg: null,
    runCount: 1,
    rideCount: 0,
    runAtMs: Date.UTC(2026, 0, 11 + index * 7, 23, 59, 59, 999),
    rideAtMs: null,
    rideRunSpeed: null,
  })
  const TRENDS: Record<EffortLengthS, TrendPoint[]> = {
    [FIVE_MIN_S]: [week(0, 16), week(1, 16.2)],
    [TWENTY_MIN_S]: [week(0, 15), week(1, 15.2)],
    [SIXTY_MIN_S]: [week(0, 14), week(1, 14.2)],
  }

  /** The pace of a running value, as the trend table shows it, for the given metabolic W/kg. */
  const paceOf = (wkg: number | null) =>
    formatPace(wkg === null ? NaN : (wkg - RESTING_W_PER_KG) / FLAT_RUN_COST, 'metric')

  /** The pace column of the trend chart named by `label`, one entry per week. */
  const paceColumnOf = (label: string): (string | null | undefined)[] => {
    const figure = screen.getByRole('figure', { name: new RegExp(label) })
    return Array.from(figure?.querySelectorAll('tbody tr') ?? [], (row) => {
      return row.querySelectorAll('th, td')[1]?.textContent
    })
  }

  const paceList = (points: TrendPoint[]) => points.map((point) => paceOf(point.runWkg))

  it('shows the 20-minute trend first, with an effort length choice', () => {
    renderPage('run', makeResult({ activities: [morningRun] }), 'metric', null, null, null, TRENDS)
    const choice = screen.getByRole('group', { name: 'Effort length' })
    expect(within(choice).getByRole('radio', { name: '20 min' })).toBeChecked()
    expect(
      screen.getByRole('figure', {
        name: /^Running flat pace per kilometre, best 20 minutes, trailing/,
      }),
    ).toBeInTheDocument()
  })

  it('draws the trend of the effort length chosen, with the length in its name', () => {
    renderPage('run', makeResult({ activities: [morningRun] }), 'metric', null, null, null, TRENDS)
    const choice = screen.getByRole('group', { name: 'Effort length' })

    fireEvent.click(within(choice).getByRole('radio', { name: '5 min' }))
    expect(
      screen.getByRole('figure', {
        name: /^Running flat pace per kilometre, best 5 minutes, trailing/,
      }),
    ).toBeInTheDocument()
    expect(paceColumnOf('best 5 minutes')).toEqual(paceList(TRENDS[FIVE_MIN_S]))
    expect(screen.queryByRole('figure', { name: /best 20 minutes/ })).toBeNull()

    fireEvent.click(within(choice).getByRole('radio', { name: '60 min' }))
    expect(screen.getByRole('figure', { name: /best 60 minutes, trailing/ })).toBeInTheDocument()
    expect(paceColumnOf('best 60 minutes')).toEqual(paceList(TRENDS[SIXTY_MIN_S]))
    expect(paceColumnOf('best 60 minutes')).not.toEqual(paceList(TRENDS[TWENTY_MIN_S]))
  })
})

describe('SportPage distance records', () => {
  const at = (day: number) => new Date(2026, 0, day, 9).getTime()
  const parkrun = makeActivity({
    id: 'parkrun',
    name: 'Parkrun',
    sport: 'run',
    startMs: at(12),
    distanceBests: [
      { distanceM: 1000, seconds: 240 },
      { distanceM: 5000, seconds: 1260 },
    ],
  })

  /** The run page's Best efforts section, where the distance records sit. */
  function bestEfforts(): HTMLElement {
    const section = screen.getByRole('heading', { name: 'Best efforts' }).closest('section')
    if (!section) throw new Error('No Best efforts section')
    return section
  }

  it('lists the fastest run at each record distance, with its time, pace and activity', () => {
    renderPage('run', makeResult({ activities: [parkrun, morningRun] }))
    const section = within(bestEfforts())
    expect(section.getByText('Best 1 km')).toBeTruthy()
    expect(section.getByText('4:00')).toBeTruthy()
    expect(section.getByText('4:00 /km')).toBeTruthy()
    expect(section.getByText('Best 5 km')).toBeTruthy()
    expect(section.getByText('21:00')).toBeTruthy()
    expect(section.getByText('4:12 /km')).toBeTruthy()
    // Both distance bests were set in the same run, so the run is named once under the list.
    expect(section.getAllByRole('link', { name: /Parkrun/ })).toHaveLength(1)
    expect(section.getByText('All set on')).toBeInTheDocument()
  })

  it('grades each distance record it has a standard for, and says in words where it has none', () => {
    renderPage('run', makeResult({ activities: [parkrun, morningRun] }), 'metric', MAN_BORN_1986)

    const records = bestEfforts()
    expect(recordNamed(records, 'Best 5 km').querySelector('.records__grade')?.textContent).toMatch(
      /^(Recreational|Local|Regional|National|World) · \d+%$/,
    )
    expect(recordNamed(records, 'Best 1 km').querySelector('.records__grade')?.textContent).toBe(
      'No age standard under 1 mile',
    )
    expect(records).toHaveTextContent(/Age grades for a man use the/)
  })

  it('says the distance records may not be the fastest when some runs predate distance bests', () => {
    renderPage('run', makeResult({ activities: [parkrun, morningRun] }))
    expect(
      within(bestEfforts()).getByText(
        'Runs added before distance bests were recorded don’t have them yet, so these may not be the fastest. Add those runs again to include them.',
      ),
    ).toBeTruthy()
  })

  it('shows no distance records and no line when no run in scope has them', () => {
    renderPage('run', makeResult({ activities: [morningRun] }))
    expect(screen.queryByText('Best 1 km')).toBeNull()
    expect(screen.queryByText(/since distance records were introduced/)).toBeNull()
  })
})

describe('SportPage method link', () => {
  it('links to How sure is this? from the head of the page, so the evidence is one tap away', () => {
    renderPage('run', makeResult())
    expect(screen.getByRole('link', { name: 'How sure is this?' })).toHaveAttribute(
      'href',
      '#/method',
    )
  })
})

describe('SportPage cycling figures without a weight', () => {
  const ride = makeActivity({
    id: 'ride-1',
    sport: 'ride',
    name: 'Hill ride',
    powerSource: 'virtual',
  })
  const rideResult = () =>
    makeResult({
      activities: [ride],
      rideCurve: [curvePoint(HEADLINE_DURATION_S, 400, 'ride-1')],
      equivalents: [
        makeEquivalence({
          durationS: HEADLINE_DURATION_S,
          runSpeed: interval(3.9, 5000 / HEADLINE_DURATION_S, 4.4),
        }),
      ],
    })

  it('holds the threshold, the records, the trend and the curve, and asks for the weight', () => {
    renderPage('ride', rideResult(), 'metric', MAN_BORN_1986, null, null, NO_TRENDS, false)

    expect(screen.queryByRole('region', { name: 'Threshold power, estimated' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Best efforts' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Best 20 min, week by week' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Every duration' })).toBeNull()
    expect(screen.queryByText('400 W')).toBeNull()
    expect(screen.queryByText(/W\/kg/)).toBeNull()
    expect(screen.getByText(/Add your weight on/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '#/profile')
  })

  it('shows the cycling records once a weight is entered', () => {
    renderPage('ride', rideResult(), 'metric', MAN_BORN_1986, null, null, NO_TRENDS, true)

    expect(screen.getByRole('region', { name: 'Threshold power, estimated' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Best efforts' })).toBeInTheDocument()
    expect(screen.queryByText(/Add your weight on/)).not.toBeInTheDocument()
  })

  it('leaves the run page as it is, because a run does not need the weight', () => {
    renderPage(
      'run',
      makeResult({
        activities: [morningRun],
        runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
      }),
      'metric',
      MAN_BORN_1986,
      null,
      null,
      NO_TRENDS,
      false,
    )

    expect(screen.getByRole('region', { name: 'Threshold pace, estimated' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Best efforts' })).toBeInTheDocument()
    expect(screen.queryByText(/Add your weight on/)).not.toBeInTheDocument()
  })

  it('tags a cycling record estimated when its watts came from virtual power, and not when measured', () => {
    const { unmount } = renderPage('ride', rideResult())
    expect(
      within(screen.getByRole('region', { name: 'Best efforts' })).getByText('Estimated'),
    ).toBeInTheDocument()
    unmount()

    renderPage(
      'ride',
      makeResult({
        activities: [{ ...ride, powerSource: 'measured' }],
        rideCurve: [curvePoint(HEADLINE_DURATION_S, 400, 'ride-1')],
      }),
    )
    expect(
      within(screen.getByRole('region', { name: 'Best efforts' })).queryByText('Estimated'),
    ).toBeNull()
  })

  it('shows the profile footnote at the foot of the page', () => {
    renderPage(
      'run',
      makeResult({ activities: [morningRun] }),
      'metric',
      null,
      null,
      null,
      NO_TRENDS,
      true,
      <p>Based on 75 kg, age 40, man. Change on Profile</p>,
    )
    expect(screen.getByText('Based on 75 kg, age 40, man. Change on Profile')).toBeInTheDocument()
  })
})

describe('SportPage depth', () => {
  it('draws the level ladder under the threshold, graded on the best 20 minutes', () => {
    renderPage(
      'run',
      makeResult({
        activities: [morningRun],
        runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
      }),
      'metric',
      MAN_BORN_1986,
    )

    const threshold = screen.getByRole('region', { name: 'Threshold pace, estimated' })
    expect(
      within(threshold).getByRole('img', { name: /Age grade 67%, Local, from your best 20 min/ }),
    ).toBeInTheDocument()
    expect(threshold.querySelector('.age-grade__line')).toHaveTextContent(
      'Local · 67% · on your best 20 min, 4:00 /km',
    )
  })

  it('asks once for the year of birth and sex, under the best efforts, when they are missing', () => {
    renderPage('run', makeResult({ activities: [morningRun] }))

    expect(screen.getByText('Age grades need your year of birth and sex.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add year of birth and sex' })).toHaveAttribute(
      'href',
      '#/profile',
    )
    expect(screen.queryByRole('img', { name: /Age grade/ })).toBeNull()
  })

  it('names a record with no standard in words, in the grade slot of its row', () => {
    renderPage(
      'run',
      makeResult({
        activities: [morningRun],
        // 60 s at 8 m/s covers 480 m, under a mile.
        runCurve: [curvePoint(60, flatWkg(8), 'run-1')],
      }),
      'metric',
      MAN_BORN_1986,
    )

    const records = screen.getByRole('region', { name: 'Best efforts' })
    expect(
      within(recordNamed(records, 'Best 1 min')).getByText('No age standard under 1 mile'),
    ).toBeInTheDocument()
  })

  it('says a run’s pace is a flat pace once on the page, under the best efforts', () => {
    renderPage(
      'run',
      makeResult({
        activities: [morningRun],
        runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
      }),
      'metric',
      MAN_BORN_1986,
    )

    const note = 'Flat pace: your pace allowing for hills, as if on level ground.'
    expect(screen.getAllByText(note)).toHaveLength(1)
    expect(
      within(screen.getByRole('heading', { name: 'Best efforts' }).closest('section')!).getByText(
        note,
      ),
    ).toBeInTheDocument()
  })

  it('says the grades are a level, not a ranking', () => {
    renderPage(
      'run',
      makeResult({
        activities: [morningRun],
        runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
      }),
      'metric',
      MAN_BORN_1986,
    )

    expect(screen.getByText(/A level, not a ranking\./)).toBeInTheDocument()
  })

  it('lists the half marathon among the distance records, with its time', () => {
    const half = makeActivity({
      id: 'half',
      name: 'Spring half',
      sport: 'run',
      startMs: new Date(2026, 0, 18, 9).getTime(),
      distanceBests: [{ distanceM: 21097.5, seconds: 5274 }],
    })
    renderPage('run', makeResult({ activities: [half] }))

    const section = within(
      screen.getByRole('heading', { name: 'Best efforts' }).closest('section')!,
    )
    expect(section.getByText('Best half marathon')).toBeInTheDocument()
    expect(section.getByText('1:27:54')).toBeInTheDocument()
  })

  it('says how each record moved on the period before, in words', () => {
    const ride = makeActivity({ id: 'ride-1', sport: 'ride', name: 'Hill ride' })
    const previous: SportCurves = {
      runCurve: [],
      rideCurve: [curvePoint(60, 250, 'ride-0')],
    }
    renderPage(
      'ride',
      makeResult({ activities: [ride], rideCurve: [curvePoint(60, 258, 'ride-1')] }),
      'metric',
      null,
      previous,
      'Previous 6 weeks',
    )

    const records = screen.getByRole('region', { name: 'Best efforts' })
    expect(
      within(recordNamed(records, 'Best 1 min')).getByText('8 W more than previous 6 weeks'),
    ).toBeInTheDocument()
  })

  it('gives the recent form in one line: the last run, the runs and their distance', () => {
    const run = makeActivity({
      id: 'run-1',
      sport: 'run',
      name: 'Morning run',
      startMs: morningRun.startMs,
      distanceM: 10000,
    })
    renderPage('run', makeResult({ activities: [run] }))

    expect(screen.getByText('Last run Mon 5 Jan · 1 run · 10.00 km')).toBeInTheDocument()
  })

  it('says which watts are estimated when no power meter measured the rides', () => {
    const ride = makeActivity({
      id: 'ride-1',
      sport: 'ride',
      name: 'Hill ride',
      powerSource: 'virtual',
    })
    renderPage(
      'ride',
      makeResult({ activities: [ride], rideCurve: [curvePoint(60, 400, 'ride-1')] }),
    )

    expect(
      screen.getByText('Power meters measured 0 of 1 ride. Watts for the rest are estimated.'),
    ).toBeInTheDocument()
  })

  it('links the power note to How sure is this?', () => {
    const ride = makeActivity({
      id: 'ride-1',
      sport: 'ride',
      name: 'Hill ride',
      powerSource: 'virtual',
    })
    renderPage(
      'ride',
      makeResult({ activities: [ride], rideCurve: [curvePoint(60, 400, 'ride-1')] }),
    )

    const records = screen.getByRole('region', { name: 'Best efforts' })
    expect(within(records).getByRole('link', { name: 'How sure is this?' })).toHaveAttribute(
      'href',
      '#/method',
    )
  })

  it('names the trend "Week by week" and the curve by sport', () => {
    renderPage('ride', makeResult({ activities: [makeActivity({ id: 'ride-1', sport: 'ride' })] }))

    expect(screen.getByRole('heading', { name: 'Week by week' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Power curve' })).toBeInTheDocument()
  })
})
