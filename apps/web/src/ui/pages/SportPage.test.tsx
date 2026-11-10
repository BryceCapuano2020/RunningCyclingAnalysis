// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SportCurves } from '@rca/core/digest'
import type { EffortMilestones, LookBack } from '@rca/core/lookback'
import type { AnalysisResult } from '@rca/core/pipeline'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import { curvePoint } from '../charts/test/fixtures'
import { HARD, UNKNOWN } from '../test/effortGateFixtures'
import {
  FIVE_K_IN_20_MIN_WKG,
  MAN_BORN_1986,
  flatWkg,
  interval,
  makeActivity,
  makeEquivalence,
  makeResult,
  makeRideThreshold,
  makeRunThreshold,
} from '../components/test/fixtures'
import type { AgeGap, AgeProfile } from '../grades'
import { formatDayMonth } from '../format/date'
import { THRESHOLD_HEADING } from '../sports'
import { RangePicker } from '../components/RangePicker'
import { SportPage } from './SportPage'
import { changeOf } from '../charts/test/changeFixtures'
import { YEARS_LOOKBACK } from '../test/yearsFixtures'
import { openDetail } from '../test/openDetail'
import { rowValue } from '../test/propertyRows'
import { wholeText } from '../test/wholeText'

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
  weighted = true,
  footnote: ReactNode = null,
  rangeDays: number | null = 42,
  emptyText = 'Nothing in this period.',
  missingAge: AgeGap | null = profile === null ? 'year of birth and sex' : null,
  lookBack?: LookBack,
) {
  return render(
    <SportPage
      sport={sport}
      result={result}
      previous={previous}
      previousLabel={previousLabel}
      lookBack={lookBack}
      change={previous === null ? null : changeOf('higher')}
      units={units}
      massKg={75}
      weighted={weighted}
      profile={profile}
      missingAge={missingAge}
      rangeDays={rangeDays}
      controls={<span>Period picker</span>}
      footnote={footnote}
      emptyText={emptyText}
      inLibrary={result.activities.filter((activity) => activity.sport === sport).length}
      library={result.activities}
      onAddFiles={vi.fn()}
    />,
  )
}

/** The threshold's figure in the answer, as the number and the unit set beside it. */
function heroFigure(section: HTMLElement) {
  return {
    number: section.querySelector('.sport-hero__number')?.textContent,
    unit: section.querySelector('.sport-hero__unit')?.textContent,
  }
}

describe('SportPage: history', () => {
  const result = makeResult({ activities: [morningRun] })
  const page = (lookBack?: LookBack) =>
    renderPage(
      'run',
      result,
      'metric',
      null,
      null,
      null,
      true,
      null,
      42,
      'Nothing.',
      null,
      lookBack,
    )

  it('is the first row after the answer: its finding and a link to the History tab, with no body of its own', () => {
    page(YEARS_LOOKBACK)
    const years = screen.getByRole('region', { name: 'History' })
    expect(years).toHaveTextContent('Slipped in 2021, then came back. See History')
    expect(within(years).getByRole('link', { name: 'See History' })).toHaveAttribute(
      'href',
      '#/history',
    )
    // One line: no fold, no list of episodes, no picture. Those are the History tab's.
    expect(years.closest('details')).toBeNull()
    expect(years.querySelector('details')).toBeNull()
    expect(within(years).queryByRole('region', { name: 'Episodes' })).toBeNull()
    expect(within(years).queryByRole('figure')).toBeNull()
    const [first] = Array.from(document.querySelectorAll('.sport-row'))
    expect(first).toContainElement(years)
  })

  it('lists no bests by year, and no year against the one before it', () => {
    const run = YEARS_LOOKBACK.sports.run
    const best: EffortMilestones = {
      effort: { kind: 'duration', durationS: 1200 },
      unit: 'm/s',
      best: { value: 3.5, atMs: Date.UTC(2021, 4, 1), id: 'a' },
      years: [
        { year: 2020, partial: false, value: 3.2, id: 'b', n: 30 },
        { year: 2021, partial: false, value: 3.5, id: 'a', n: 40 },
      ],
      omittedYears: 0,
      steps: [],
      verdicts: [
        { year: 2020, verdict: 'none' },
        { year: 2021, verdict: 'higher' },
      ],
    }
    page({
      ...YEARS_LOOKBACK,
      sports: { ...YEARS_LOOKBACK.sports, run: { ...run, milestones: [best] } },
    })
    const years = screen.getByRole('region', { name: 'History' })
    expect(years).toHaveTextContent('Slipped in 2021, then came back.')
    expect(years.textContent).not.toMatch(/By year|Bests by year|No clear change|Faster in|stood/i)
    expect(screen.queryByRole('region', { name: 'Bests by year' })).toBeNull()
  })

  it('names a sport that only has bests by them, and still links to the History tab', () => {
    const run = YEARS_LOOKBACK.sports.run
    const best: EffortMilestones = {
      effort: { kind: 'duration', durationS: 1200 },
      unit: 'm/s',
      best: { value: 3.5, atMs: Date.UTC(2021, 4, 1), id: 'a' },
      years: [],
      omittedYears: 0,
      steps: [],
      verdicts: [],
    }
    page({
      ...YEARS_LOOKBACK,
      sports: {
        ...YEARS_LOOKBACK.sports,
        run: { ...run, fitness: { kind: 'unavailable' }, milestones: [best] },
      },
    })
    const years = screen.getByRole('region', { name: 'History' })
    expect(years).toHaveTextContent('Best efforts by year. See History')
    expect(within(years).getByRole('link', { name: 'See History' })).toHaveAttribute(
      'href',
      '#/history',
    )
  })

  it('says a sport too short for its years lacks steady runs, in one line with no counts and no link', () => {
    const run = YEARS_LOOKBACK.sports.run
    page({
      ...YEARS_LOOKBACK,
      sports: {
        ...YEARS_LOOKBACK.sports,
        run: {
          ...run,
          milestones: [],
          fitness: { kind: 'too-short', steady: 0, weeks: 0, needSteady: 40, needWeeks: 52 },
        },
      },
    })
    const years = screen.getByRole('region', { name: 'History' })
    expect(years.querySelector('p.muted')?.textContent).toBe(
      'Not enough steady runs for a fitness history.',
    )
    expect(years.textContent).not.toMatch(/\d/)
    expect(within(years).queryByRole('link')).toBeNull()
  })

  it('says what it needs, in its own place, when there are no years to tell', () => {
    page(undefined)
    const years = screen.getByRole('region', { name: 'History' })
    expect(years).toHaveTextContent('Needs a year of runs.')
    expect(years.closest('details')).toBeNull()
  })
})

describe('SportPage', () => {
  it('is the sport’s own page heading, with the period’s line under it and before the answer', () => {
    renderPage('run', makeResult({ activities: [morningRun] }))

    const heading = screen.getByRole('heading', { level: 1, name: 'Run' })
    expect(heading).toHaveAttribute('id', 'page-heading')
    expect(heading).toHaveAttribute('tabindex', '-1')
    const picker = screen.getByText('Period picker')
    const answer = screen.getByRole('region', { name: THRESHOLD_HEADING.run })
    expect(picker.compareDocumentPosition(answer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(heading.closest('.sport-page__head')?.contains(picker)).toBe(true)
    // The title is the sport's word alone, with no icon.
    expect(heading.querySelector('svg')).toBeNull()
  })

  it('offers the guides beside the add action, in the one section with the prompt, as a secondary action', () => {
    renderPage(
      'run',
      makeResult({ activities: [makeActivity({ id: 'ride', sport: 'ride' })] }),
      'metric',
      null,
      null,
      null,
      true,
      null,
      42,
      'No runs between 12 May and 3 Aug 2025.',
    )
    const prompt = screen.getByText(wholeText('No runs between 12 May and 3 Aug 2025.'))
    const section = prompt.closest('section')!
    expect(section).toHaveClass('section')
    const add = within(section).getByRole('button', { name: 'Add runs' })
    const guides = within(section).getByRole('button', { name: 'How to get your files' })
    expect(guides).toHaveClass('btn')
    expect(guides).not.toHaveClass('btn-primary')
    // Both actions sit in one row, beside each other.
    expect(add.closest('.sport-page__actions')).not.toBeNull()
    expect(add.closest('.sport-page__actions')).toBe(guides.closest('.sport-page__actions'))
  })

  it("offers the sport's files from its empty page, as a secondary action that hands them on", () => {
    const onAddFiles = vi.fn()
    render(
      <SportPage
        sport="run"
        result={makeResult({ activities: [makeActivity({ id: 'ride', sport: 'ride' })] })}
        previous={null}
        previousLabel={null}
        change={null}
        units="metric"
        massKg={75}
        profile={null}
        missingAge="year of birth and sex"
        controls={<span>Period picker</span>}
        weighted
        rangeDays={42}
        inLibrary={0}
        library={[]}
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
      true,
      null,
      42,
      'No runs between 12 May and 3 Aug 2025. You have 1 run in All time.',
    )

    expect(
      screen.getByText(
        wholeText('No runs between 12 May and 3 Aug 2025. You have 1 run in All time.'),
      ),
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
      true,
      null,
      42,
      'Your files have no rides yet. Add rides to see your records.',
    )

    expect(
      screen.getByText('Your files have no rides yet. Add rides to see your records.'),
    ).toBeInTheDocument()
  })

  it('names the threshold with a second-level heading, as the sections below it are named', () => {
    renderPage('run', makeResult({ activities: [morningRun] }))

    expect(
      screen.getByRole('heading', { level: 2, name: THRESHOLD_HEADING.run }),
    ).toBeInTheDocument()
  })

  it('shows the running threshold as one pace under its name, with the runs it rests on in its detail’s rows', () => {
    renderPage('run', makeResult({ activities: [morningRun] }))

    const section = screen.getByRole('region', { name: THRESHOLD_HEADING.run })
    expect(heroFigure(section)).toEqual({ number: '23:23', unit: '/km' })
    // The line counts the runs the estimate rests on, as a ride's counts its rides, not the runs in the period.
    expect(rowValue(section, 'Runs used')).toBe('3')
    expect(rowValue(section, 'Strongest effort')).toBe(
      `20 min, ${formatDayMonth(morningRun.startMs)}`,
    )
    expect(within(section).queryByText(wholeText(/Based on/))).not.toBeInTheDocument()
    expect(within(section).queryByText(/Estimated|At least/)).toBeNull()
  })

  it('says the running threshold’s range in pace one tap down, with no track beside the figure', () => {
    renderPage('run', makeResult({ activities: [morningRun] }))

    const section = screen.getByRole('region', { name: THRESHOLD_HEADING.run })
    expect(section.querySelector('.sport-hero__figure')?.children).toHaveLength(2)
    openDetail(section)
    expect(rowValue(section, 'Range')).toBe('21:49\u201325:12 /km')
  })

  it('says the cycling threshold’s range in watts one tap down, with no track beside the figure', () => {
    const ride = makeActivity({ id: 'ride-1', sport: 'ride' })
    renderPage('ride', makeResult({ activities: [ride] }))

    const section = screen.getByRole('region', { name: THRESHOLD_HEADING.ride })
    expect(section.querySelector('.sport-hero__figure')?.children).toHaveLength(3)
    openDetail(section)
    expect(rowValue(section, 'Range')).toBe('46\u201351 W')
  })

  it('leaves a run’s uneven fit out: its figure and range are the estimate’s', () => {
    const run = makeActivity({ id: 'run-1', sport: 'run' })
    const uneven = {
      fit: { cp: 4.4, wPrime: 15, cpSe: 0.04, r2: 0.98, nPoints: 5 },
      leftOutS: [900, 1200],
      floor: 3.2,
    }
    renderPage('run', makeResult({ activities: [run], runCpUneven: uneven }))

    const section = screen.getByRole('region', { name: THRESHOLD_HEADING.run })
    expect(heroFigure(section)).toEqual({ number: '23:23', unit: '/km' })
    openDetail(section)
    // The range is the estimate's own, not a run up to the uneven fit's 20:26.
    expect(rowValue(section, 'Range')).not.toMatch(/20:26/)
    expect(within(section).queryByText(/mixed hard and easy|uneven/)).toBeNull()
  })

  it('leaves a ride’s uneven fit out: its figure and range are the estimate’s', () => {
    const ride = makeActivity({ id: 'ride-1', sport: 'ride' })
    const uneven = {
      fit: { cp: 3.6, wPrime: 15, cpSe: 0.04, r2: 0.98, nPoints: 5 },
      leftOutS: [900, 1200],
      floor: 3.2,
    }
    renderPage('ride', makeResult({ activities: [ride], rideCpUneven: uneven }))

    const section = screen.getByRole('region', { name: THRESHOLD_HEADING.ride })
    expect(heroFigure(section)).toEqual({ number: '48', unit: 'W' })
    expect(within(section).queryByText(/uneven|The top end uses estimated watts/)).toBeNull()
  })

  it('shows a run’s estimate as the figure when its fit is refused, with no floor or note in its place', () => {
    const run = makeActivity({ id: 'run-1', sport: 'run' })
    const uneven = {
      fit: { cp: 4.4, wPrime: 15, cpSe: 0.04, r2: 0.98, nPoints: 5 },
      leftOutS: [900, 1200],
      floor: 3.2,
    }
    renderPage(
      'run',
      makeResult({
        activities: [run],
        runCp: null,
        runCpRefusal: 'shape',
        runCpUneven: uneven,
        runThreshold: makeRunThreshold(16),
      }),
    )

    const section = screen.getByRole('region', { name: THRESHOLD_HEADING.run })
    expect(heroFigure(section)).toEqual({ number: '4:24', unit: '/km' })
    expect(within(section).queryByText(/Needs|At least|Estimated/)).not.toBeInTheDocument()
    expect(within(section).queryByText(/From your best/)).not.toBeInTheDocument()
    expect(within(section).queryByText(/mixed hard and easy/)).not.toBeInTheDocument()
  })

  it('names the period by its control under the answer, not with a count under the threshold', () => {
    renderPage(
      'run',
      makeResult({ activities: [morningRun] }),
      'metric',
      null,
      null,
      null,
      true,
      null,
      null,
    )

    expect(screen.getByText('Period picker')).toBeInTheDocument()
    expect(screen.queryByText(wholeText(/Based on/))).not.toBeInTheDocument()
  })

  it('does not count the rides a cycling threshold rests on', () => {
    const ride = makeActivity({ id: 'ride-1', sport: 'ride' })
    renderPage(
      'ride',
      makeResult({ activities: [ride, makeActivity({ id: 'ride-2', sport: 'ride' })] }),
    )

    expect(screen.queryByText(wholeText(/Based on/))).not.toBeInTheDocument()
    expect(heroFigure(screen.getByRole('region', { name: THRESHOLD_HEADING.ride }))).toEqual({
      number: '48',
      unit: 'W',
    })
  })

  it('links to the sport’s own activities, filtered to it in the address', () => {
    renderPage('run', makeResult({ activities: [morningRun] }))

    expect(screen.getByRole('link', { name: 'See your runs' })).toHaveAttribute(
      'href',
      '#/activities?sport=run',
    )
  })

  it('gives the threshold its figure and its basis line and no sentence about what a threshold is', () => {
    renderPage('run', makeResult({ activities: [morningRun] }))

    const section = screen.getByRole('region', { name: THRESHOLD_HEADING.run })
    expect(heroFigure(section)).toEqual({ number: '23:23', unit: '/km' })
    expect(rowValue(section, 'Runs used')).toBe('3')
    expect(within(section).queryByText(/you could hold/)).not.toBeInTheDocument()
    expect(within(section).queryByText(/estimated from your/)).not.toBeInTheDocument()
  })

  it('shows the cycling threshold in watts with its W/kg', () => {
    renderPage('ride', makeResult({ activities: [makeActivity({ id: 'ride-1', sport: 'ride' })] }))

    const section = screen.getByRole('region', { name: THRESHOLD_HEADING.ride })
    expect(heroFigure(section)).toEqual({ number: '48', unit: 'W' })
    expect(within(section).getByText(wholeText('0.6 W/kg'))).toBeInTheDocument()
    // A ride’s threshold is one best estimate: the name says so, and no chip does.
    expect(section.querySelector('.chip')).toBeNull()
    expect(within(section).queryByText(/Estimated|At least/)).toBeNull()
  })

  it('says what the cycling threshold rests on in one line, from the rides and the strongest effort', () => {
    const ride = makeActivity({
      id: 'ride-1',
      sport: 'ride',
      startMs: new Date(2026, 2, 4, 12).getTime(),
    })
    const rideThreshold = makeRideThreshold(15.5, {
      efforts: {
        value: 15,
        relativeError: 0.025,
        rides: 5,
        strongest: { activityId: 'ride-1', durationS: 720, estimated: false },
      },
    })
    renderPage('ride', makeResult({ activities: [ride], rideThreshold }))

    const section = screen.getByRole('region', { name: THRESHOLD_HEADING.ride })
    expect(heroFigure(section)).toEqual({ number: '250', unit: 'W' })
    expect(rowValue(section, 'Rides used')).toBe('5')
    expect(rowValue(section, 'Strongest effort')).toBe(`12 min, ${formatDayMonth(ride.startMs)}`)
  })

  it('shows no floor, and asks for nothing, when the fit is refused and the efforts are not all-out', () => {
    renderPage(
      'run',
      makeResult({
        activities: [morningRun],
        runCp: null,
        runCpRefusal: 'shape',
        runThreshold: makeRunThreshold(16),
        effortGate: { run: HARD, ride: UNKNOWN },
      }),
    )

    const section = screen.getByRole('region', { name: THRESHOLD_HEADING.run })
    expect(heroFigure(section).number).toBe('4:24')
    expect(
      within(section).queryByText(wholeText(/At least|From your best 30 min/)),
    ).not.toBeInTheDocument()
    // The answer asks for nothing; the sections below say their own needs, each in its own place.
    expect(within(section).queryByText(/Needs/)).not.toBeInTheDocument()
    expect(screen.queryByText(/About the pace/)).not.toBeInTheDocument()
  })

  it('asks for one effort of 8 min or longer, with no number, when the sport holds no effort', () => {
    renderPage('run', makeResult({ activities: [morningRun], runCp: null }))

    expect(screen.getByText(wholeText('Needs an effort of 8 min or longer'))).toBeInTheDocument()
    expect(screen.queryByText(/\/km$/)).not.toBeInTheDocument()
  })

  it('names the strongest effort it rests on, with no best label, when none is as long as 20 min', () => {
    const short = [{ durationS: 720, value: 6, activityId: morningRun.id, startIndex: 0 }]
    const runThreshold = makeRunThreshold(16, {
      efforts: {
        value: 16,
        relativeError: 0.03,
        rides: 1,
        strongest: { activityId: morningRun.id, durationS: 720, estimated: false },
      },
    })
    renderPage(
      'run',
      makeResult({ activities: [morningRun], runCp: null, runCurve: short, runThreshold }),
    )

    const section = screen.getByRole('region', { name: THRESHOLD_HEADING.run })
    expect(heroFigure(section).number).toBe('4:24')
    expect(rowValue(section, 'Runs used')).toBe('1')
    expect(rowValue(section, 'Strongest effort')).toMatch(/^12 min, /)
    expect(
      within(section).queryByText(wholeText(/At least|Best 12 min|From your best/)),
    ).not.toBeInTheDocument()
    expect(within(section).queryByText(/Needs/)).not.toBeInTheDocument()
  })

  it('asks for an effort of 8 min or longer, with no number, when the longest best is under 8 min', () => {
    const brief = [{ durationS: 420, value: 6, activityId: morningRun.id, startIndex: 0 }]
    renderPage('run', makeResult({ activities: [morningRun], runCp: null, runCurve: brief }))

    expect(screen.getByText(wholeText('Needs an effort of 8 min or longer'))).toBeInTheDocument()
    expect(screen.queryByText(/\/km$/)).not.toBeInTheDocument()
  })

  it('leaves no sentence under the best efforts about run paces allowing for hills', () => {
    renderPage('run', makeResult({ activities: [morningRun] }))

    const records = screen.getByRole('region', { name: 'Best efforts' })
    expect(records.querySelector('p.muted')).toBeNull()
  })

  it('leaves GAP off the cycling page', () => {
    renderPage('ride', makeResult({ activities: [makeActivity({ id: 'ride-1', sport: 'ride' })] }))

    expect(screen.queryByRole('button', { name: 'GAP' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Grade-adjusted pace/)).not.toBeInTheDocument()
  })

  it('shows every duration as a chart under the records, with no heading of its own', () => {
    renderPage('run', makeResult({ activities: [morningRun] }))

    const records = screen.getByRole('region', { name: 'Best efforts' })
    expect(
      within(records).getByRole('figure', { name: 'Best effort by duration' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Pace curve' })).not.toBeInTheDocument()
  })
})

describe('SportPage age grades', () => {
  it('puts no line under the level that repeats the threshold, and no link to how it is graded', () => {
    renderPage(
      'run',
      makeResult({
        activities: [morningRun],
        runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
      }),
      'metric',
      MAN_BORN_1986,
    )

    const level = screen.getByTestId('hero-level')
    expect(level.querySelector('.sport-hero__level')).toHaveTextContent(/^Local · \d+%$/)
    expect(level.querySelector('.sport-hero__grades')).toBeNull()
    expect(level).not.toHaveTextContent(/at age 40|\/km/)
    expect(within(level).queryByRole('link')).toBeNull()
  })

  it('says no standard and no line about a ranking under the grade', () => {
    renderPage(
      'run',
      makeResult({
        activities: [morningRun],
        runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
      }),
      'metric',
      MAN_BORN_1986,
    )

    expect(screen.queryByText(/not a ranking/)).not.toBeInTheDocument()
    const level = screen.getByTestId('hero-level')
    expect(level).not.toHaveTextContent(/USATF|standards|graded at/)
  })

  it('leaves the full standards credit to Method, with no source paragraph under Best efforts', () => {
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
    expect(within(records).queryByText(/Age grades for a/)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'USATF road age standards (2025)' }),
    ).not.toBeInTheDocument()
  })

  it('writes a ride’s watts plain and draws its range on the ladder, with no chip beside the level and no key under it', () => {
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
    const level = screen.getByTestId('hero-level')
    expect(level.querySelector('.sport-hero__grades')).toBeNull()
    expect(level).not.toHaveTextContent(/at age/)
    expect(level.querySelector('.level-ladder__range')).toBeNull()
    expect(level.textContent).not.toMatch(/estimated/i)
    expect(screen.queryByText(/model range/)).not.toBeInTheDocument()
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
        runCurve: [curvePoint(300, flatWkg(5), 'run-1')],
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
      runCurve: [curvePoint(180, flatWkg(5), 'run-1'), curvePoint(1200, flatWkg(4), 'run-1')],
    })
    const previous: SportCurves = {
      runCurve: [curvePoint(180, flatWkg(4.8), 'run-0'), curvePoint(1200, flatWkg(3.8), 'run-0')],
      rideCurve: [],
    }
    renderPage('run', result, 'metric', null, previous, 'Previous 6 weeks')

    expect(screen.getByRole('figure', { name: 'Best effort by duration' })).toBeInTheDocument()
    const legend = screen.getByRole('list', { name: 'Legend' })
    expect(within(legend).getByText(wholeText('Previous 6 weeks'))).toBeInTheDocument()
  })

  it('draws no comparison for all time', () => {
    renderPage('run', makeResult({ activities: [morningRun] }))
    expect(screen.queryByRole('list', { name: 'Legend' })).toBeNull()
  })
})

describe('SportPage distance records', () => {
  it('shows no distance records and no line when no run in scope has them', () => {
    renderPage('run', makeResult({ activities: [morningRun] }))
    expect(screen.queryByText(wholeText('1 km'))).toBeNull()
    expect(screen.queryByText(/since distance records were introduced/)).toBeNull()
  })
})

describe('SportPage method link', () => {
  it('links Method only from a detail panel’s one Method link, and has no How is this graded? link', () => {
    renderPage(
      'run',
      makeResult({
        activities: [morningRun],
        runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
      }),
      'metric',
      MAN_BORN_1986,
    )
    const links = Array.from(document.querySelectorAll('a[href^="#/method"]'))
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) expect(link).toHaveClass('props__method')
    expect(screen.queryByRole('link', { name: 'How is this graded?' })).not.toBeInTheDocument()
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
    renderPage('ride', rideResult(), 'metric', MAN_BORN_1986, null, null, false)

    expect(screen.queryByRole('region', { name: 'Threshold power, estimated' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Best efforts' })).toBeNull()
    expect(screen.queryByRole('region', { name: /of your best 20 min, trailing/ })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Every duration' })).toBeNull()
    expect(screen.queryByText(wholeText('400 W'))).toBeNull()
    expect(screen.queryByText(/W\/kg/)).toBeNull()
    expect(screen.getByText(/Add your weight on/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '#/profile')
  })

  it('shows the cycling records once a weight is entered', () => {
    renderPage('ride', rideResult(), 'metric', MAN_BORN_1986, null, null, true)

    expect(screen.getByRole('region', { name: THRESHOLD_HEADING.ride })).toBeInTheDocument()
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
      false,
    )

    expect(screen.getByRole('region', { name: THRESHOLD_HEADING.run })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Best efforts' })).toBeInTheDocument()
    expect(screen.queryByText(/Add your weight on/)).not.toBeInTheDocument()
  })

  it('shows the profile footnote at the foot of the page', () => {
    renderPage(
      'run',
      makeResult({ activities: [morningRun] }),
      'metric',
      null,
      null,
      null,
      true,
      <p>Based on your age, sex and 75 kg. Edit</p>,
    )
    expect(
      screen.getByText(wholeText('Based on your age, sex and 75 kg. Edit')),
    ).toBeInTheDocument()
  })
})

describe('SportPage depth', () => {
  it('says the level in words beside the threshold, graded at threshold', () => {
    renderPage(
      'run',
      makeResult({
        activities: [morningRun],
        runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
      }),
      'metric',
      MAN_BORN_1986,
    )

    // The level is the second figure of the hero's row, in words.
    const level = screen.getByTestId('hero-level')
    expect(level.querySelector('.sport-hero__level-name')).toHaveTextContent('Local')
    expect(level.querySelector('.sport-hero__level-value')).toHaveTextContent('67%')
    expect(level.querySelector('.sport-hero__grades')).toBeNull()
  })

  it('names only the field that is missing, in the note and on its link', () => {
    renderPage(
      'run',
      makeResult({ activities: [morningRun] }),
      'metric',
      null,
      null,
      null,
      true,
      null,
      42,
      'Nothing in this period.',
      'sex',
    )

    expect(screen.getByText('Age grades need your sex.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add your sex' })).toHaveAttribute('href', '#/profile')
  })

  it('puts no line under a sport page’s grade that repeats the threshold with the age', () => {
    renderPage(
      'run',
      makeResult({
        activities: [morningRun],
        runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
      }),
      'metric',
      MAN_BORN_1986,
    )

    expect(screen.getByTestId('hero-level')).toBeInTheDocument()
    expect(screen.queryByText(wholeText(/ at age \d+\.$/))).toBeNull()
  })

  it('asks once for the year of birth and sex, under the best efforts, when they are missing', () => {
    renderPage('run', makeResult({ activities: [morningRun] }))

    expect(screen.getByText('Age grades need your year of birth and sex.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add your year of birth and sex' })).toHaveAttribute(
      'href',
      '#/profile',
    )
    expect(screen.queryByRole('img', { name: /Age grade/ })).toBeNull()
  })

  it('gives the recent form as rows: the last run and its distance', () => {
    const run = makeActivity({
      id: 'run-1',
      sport: 'run',
      name: 'Morning run',
      startMs: morningRun.startMs,
      distanceM: 10000,
    })
    renderPage('run', makeResult({ activities: [run] }))

    expect(rowValue(document.body, 'Last run')).toBe('5 Jan')
    expect(rowValue(document.body, 'Distance')).toBe('10.0 km')
  })

  it('groups the power-meter count and the ride count from a thousand on', () => {
    const measured = Array.from({ length: 1005 }, (_, i) =>
      makeActivity({
        id: `ride-measured-${i}`,
        sport: 'ride',
        name: `Meter ride ${i}`,
        startMs: morningRun.startMs + i * 1000,
        powerSource: 'measured',
      }),
    )
    const virtual = makeActivity({
      id: 'ride-1',
      sport: 'ride',
      name: 'Hill ride',
      powerSource: 'virtual',
    })
    renderPage(
      'ride',
      makeResult({
        activities: [...measured, virtual],
        rideCurve: [curvePoint(60, 400, 'ride-1')],
      }),
    )

    expect(
      screen.getByText(
        'Power meters measured 1,005 of 1,006 rides. Watts for the rest are estimated.',
      ),
    ).toBeInTheDocument()
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

  it('says nothing of the best 20 min’s heart rate in a ride’s threshold: the estimate does not read it', () => {
    const ride = makeActivity({
      id: 'ride-1',
      sport: 'ride',
      name: 'Hill ride',
      powerSource: 'virtual',
    })
    renderPage(
      'ride',
      makeResult({
        activities: [ride],
        rideCurve: [curvePoint(60, 400, 'ride-1')],
        effort: [{ durationS: HEADLINE_DURATION_S, runHrFraction: null, rideHrFraction: 0.8 }],
      }),
    )

    const threshold = screen.getByRole('region', { name: THRESHOLD_HEADING.ride })
    expect(within(threshold).queryByRole('button', { name: /Not all-out|Hard effort/ })).toBeNull()
    expect(threshold.querySelector('.chip')).toBeNull()
    openDetail(threshold)
    expect(threshold.querySelector('.props')).not.toHaveTextContent(/max heart rate|all-out/)
    expect(
      screen.getByText('Power meters measured 0 of 1 ride. Watts for the rest are estimated.'),
    ).toBeInTheDocument()
  })

  it('says nothing of heart rate in a run’s threshold detail, whatever the best 20 min reached', () => {
    renderPage(
      'run',
      makeResult({
        activities: [morningRun],
        effort: [{ durationS: HEADLINE_DURATION_S, runHrFraction: 0.7, rideHrFraction: null }],
      }),
    )

    const threshold = screen.getByRole('region', { name: THRESHOLD_HEADING.run })
    expect(within(threshold).queryByRole('button', { name: /Not all-out|Hard effort/ })).toBeNull()
    expect(threshold.querySelector('.chip')).toBeNull()
    openDetail(threshold)
    expect(threshold.querySelector('.props')).not.toHaveTextContent(/heart rate|not used|raise/i)
    expect(
      screen.queryAllByText(wholeText(/reached 70% of your running max heart rate/)),
    ).toHaveLength(0)
  })

  it('shows no heart-rate line when heart rate is not on file for the sport', () => {
    renderPage(
      'run',
      makeResult({
        activities: [morningRun],
        effort: [{ durationS: HEADLINE_DURATION_S, runHrFraction: null, rideHrFraction: 0.8 }],
      }),
    )

    expect(
      screen.queryByText(wholeText(/reached \d+% of your \w+ max heart rate/)),
    ).not.toBeInTheDocument()
  })

  it.each(['run', 'ride'] as const)(
    'shows no heart-rate line on the %s page when the library has no 20 min best in both sports',
    (sport) => {
      const ride = makeActivity({
        id: 'ride-1',
        sport: 'ride',
        name: 'Hill ride',
        powerSource: 'measured',
      })
      renderPage(
        sport,
        makeResult({
          activities: [morningRun, ride],
          rideCurve: [curvePoint(60, 400, 'ride-1')],
          effort: [],
        }),
      )

      expect(
        screen.queryByText(wholeText(/reached \d+% of your \w+ max heart rate/)),
      ).not.toBeInTheDocument()
    },
  )

  it('says the power note with no link: the method is the header’s', () => {
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
    expect(
      within(records).getByText(
        /^Power meters measured \d+ of \d+ rides?\. Watts for the rest are estimated\.$/,
      ),
    ).toBeInTheDocument()
    expect(within(records).queryByRole('link', { name: 'Method' })).toBeNull()
  })
})

describe('SportPage with nothing to show', () => {
  /** A run page with no runs in its result, and the given count of runs in the library. */
  function renderEmptyRuns(inLibrary: number, onShowAll = vi.fn()) {
    return render(
      <SportPage
        sport="run"
        result={makeResult({ activities: [makeActivity({ id: 'ride', sport: 'ride' })] })}
        previous={null}
        previousLabel={null}
        change={null}
        units="metric"
        massKg={75}
        profile={null}
        missingAge="year of birth and sex"
        controls={<span>Period picker</span>}
        weighted
        rangeDays={42}
        inLibrary={inLibrary}
        library={[]}
        emptyText="No runs between 12 May and 3 Aug 2025. You have 3 runs in All time."
        onShowAll={onShowAll}
        onAddFiles={vi.fn()}
      />,
    )
  }

  it('drops the period control and the empty curve when the files hold no runs at all', () => {
    render(
      <SportPage
        sport="run"
        result={makeResult({ activities: [makeActivity({ id: 'ride', sport: 'ride' })] })}
        previous={null}
        previousLabel={null}
        change={null}
        units="metric"
        massKg={75}
        profile={null}
        missingAge="year of birth and sex"
        controls={<span>Period picker</span>}
        weighted
        rangeDays={42}
        inLibrary={0}
        library={[]}
        emptyText="Your files have no runs yet. Add runs to see your records."
        onAddFiles={vi.fn()}
      />,
    )

    expect(screen.queryByText('Period picker')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Pace curve' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add runs' })).toBeInTheDocument()
  })

  it('offers All time, not files, when the period holds no runs but the library has some', () => {
    const onShowAll = vi.fn()
    renderEmptyRuns(3, onShowAll)

    expect(screen.getByText('Period picker')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add runs' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Pace curve' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show all time' }))
    expect(onShowAll).toHaveBeenCalledTimes(1)
  })

  it('offers no All time button once the page already shows all time', () => {
    render(
      <SportPage
        sport="run"
        result={makeResult({ activities: [makeActivity({ id: 'ride', sport: 'ride' })] })}
        previous={null}
        previousLabel={null}
        change={null}
        units="metric"
        massKg={75}
        profile={null}
        missingAge="year of birth and sex"
        controls={<span>Period picker</span>}
        weighted
        rangeDays={null}
        inLibrary={3}
        library={[]}
        emptyText="No runs. You have 3 runs in All time."
        onShowAll={vi.fn()}
        onAddFiles={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Show all time' })).not.toBeInTheDocument()
  })
})

describe('SportPage period focus', () => {
  it('keeps the period control, and the focus on its pick, when a pick leaves the sport with nothing in the period', () => {
    const page = (activities: AnalysisResult['activities']) => (
      <SportPage
        sport="run"
        result={makeResult({ activities })}
        previous={null}
        previousLabel={null}
        change={null}
        units="metric"
        massKg={75}
        weighted
        profile={null}
        missingAge={null}
        rangeDays={42}
        controls={
          <RangePicker choice={42} shown={activities.length} total={1} onChange={vi.fn()} />
        }
        emptyText="Nothing in this period."
        inLibrary={1}
        library={[morningRun]}
        onAddFiles={vi.fn()}
      />
    )
    const view = render(page([morningRun]))
    const pick = view.container.querySelector<HTMLInputElement>('.range-picker input[type="radio"]')
    if (pick === null) throw new Error('the period control has no pick')
    pick.focus()

    view.rerender(page([]))

    expect(pick.isConnected).toBe(true)
    expect(document.activeElement).toBe(pick)
  })
})

describe('SportPage with activities held indoors', () => {
  const rides = (indoor: number, total: number) =>
    Array.from({ length: total }, (_, i) =>
      makeActivity({ id: `ride-${i}`, sport: 'ride', indoor: i < indoor }),
    )

  it('says nothing of indoor rides, whose power counts like any other', () => {
    renderPage('ride', makeResult({ activities: rides(6, 40) }))
    expect(rowValue(document.body, 'Treadmill runs')).toBeNull()
    expect(screen.queryByText(/indoors|power counts/)).toBeNull()
  })

  it('says how many treadmill runs a mixed run library leaves out, once, in the Details', () => {
    const runs = Array.from({ length: 6 }, (_, i) =>
      makeActivity({ id: `run-${i}`, sport: 'run', indoor: i < 2 }),
    )
    renderPage('run', makeResult({ activities: runs }))
    expect(rowValue(document.body, 'Treadmill runs')).toBe('2, pace not used')
  })

  it('says nothing of the split when no ride was indoors', () => {
    renderPage('ride', makeResult({ activities: rides(0, 5) }))
    expect(rowValue(document.body, 'Treadmill runs')).toBeNull()
  })

  it('tells a runner with only treadmill runs how many, not to add efforts', () => {
    const treadmill = Array.from({ length: 4 }, (_, i) =>
      makeActivity({ id: `run-${i}`, sport: 'run', indoor: true }),
    )
    renderPage('run', makeResult({ activities: treadmill, runCp: null, runCurve: [] }))
    expect(
      screen.getByText(wholeText(/^All 4 of your runs were on a treadmill\./)),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Needs an effort/)).toBeNull()
  })
})
