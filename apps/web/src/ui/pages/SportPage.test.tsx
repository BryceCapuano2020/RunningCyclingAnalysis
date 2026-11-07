// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SameHeartRate, SportCurves, TrendPoint } from '@rca/core/digest'
import { NO_LATE_EVIDENCE } from '@rca/core/digest/lateEvidenceTypes'
import { NO_SAME_HEART_RATE } from '@rca/core/digest/sameHeartRateTypes'
import { EFFORT_LENGTHS_S, NO_TRENDS } from '@rca/core/digest/trendPoints'
import type { EffortLengthS } from '@rca/core/digest/trendPoints'
import type { EffortMilestones, LookBack } from '@rca/core/lookback'
import type { AnalysisResult } from '@rca/core/pipeline'
import { FLAT_RUN_COST, HEADLINE_DURATION_S, RESTING_W_PER_KG } from '@rca/core/constants'
import { formatPace } from '@rca/core/units'
import { curvePoint } from '../charts/fixtures'
import { HARD, UNKNOWN } from '../effortGateFixtures'
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
} from '../components/fixtures'
import type { AgeGap, AgeProfile } from '../grades'
import { formatDayMonth } from '../format/date'
import { THRESHOLD_HEADING } from '../sports'
import { RangePicker } from '../components/RangePicker'
import { closedRow, openSection } from '../test/openSection'
import { SportPage } from './SportPage'
import { changeOf } from '../charts/changeFixtures'
import { YEARS_LOOKBACK } from '../yearsFixtures'
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
  trends: Readonly<Record<EffortLengthS, readonly TrendPoint[]>> = NO_TRENDS,
  weighted = true,
  footnote: ReactNode = null,
  rangeDays: number | null = 42,
  emptyText = 'Nothing in this period.',
  missingAge: AgeGap | null = profile === null ? 'year of birth and sex' : null,
  sameHeartRate: SameHeartRate = NO_SAME_HEART_RATE[sport],
  lookBack?: LookBack,
) {
  return render(
    <SportPage
      sport={sport}
      result={result}
      previous={previous}
      previousLabel={previousLabel}
      trends={trends}
      sameHeartRate={sameHeartRate}
      lookBack={lookBack}
      lateEvidence={NO_LATE_EVIDENCE[sport]}
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

/** The record list item for one duration, found by its eyebrow such as "20 min". */
function recordNamed(records: HTMLElement, eyebrow: string): HTMLElement {
  const list = records.querySelector<HTMLElement>('ol.records')
  if (list === null) throw new Error('No record list')
  const item = within(list).getByText(eyebrow).closest('li')
  if (item === null) throw new Error(`No record named ${eyebrow}`)
  return item
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
      NO_TRENDS,
      true,
      null,
      42,
      'Nothing.',
      null,
      NO_SAME_HEART_RATE.run,
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
      NO_TRENDS,
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
        trends={NO_TRENDS}
        sameHeartRate={NO_SAME_HEART_RATE.run}
        lateEvidence={NO_LATE_EVIDENCE.run}
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
      NO_TRENDS,
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
      NO_TRENDS,
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

  it('counts how long ago the records were set, in days from today, on the line that names their one activity', () => {
    const june = makeActivity({
      id: 'run-june',
      name: 'Late run',
      sport: 'run',
      startMs: new Date(2026, 5, 1, 7).getTime(),
    })
    renderPage(
      'run',
      makeResult({
        activities: [june],
        runCurve: [curvePoint(300, 4.1, 'run-june'), curvePoint(1200, 3.6, 'run-june')],
      }),
    )

    // June is the newest and only activity, but today is 10 June, so the bests were set nine days ago. A row
    // keeps one meta line, its date; the count is said once, on the shared line.
    const records = openSection('All best efforts')
    expect(
      within(records)
        .getByText(/All set on/)
        .closest('p'),
    ).toHaveTextContent('All set on Late run, 1 Jun · 9 days ago')
    expect(within(recordNamed(records, '20 min')).queryByText(/ago/)).toBeNull()
  })

  it('counts a record set a fortnight ago in weeks, as quiet text rather than a chip', () => {
    const fortnight = makeActivity({
      id: 'run-fortnight',
      name: 'Fortnight run',
      sport: 'run',
      startMs: new Date(2026, 4, 27, 7).getTime(),
    })
    renderPage(
      'run',
      makeResult({
        activities: [fortnight],
        runCurve: [curvePoint(300, 4.1, 'run-fortnight'), curvePoint(1200, 3.6, 'run-fortnight')],
      }),
    )

    const records = openSection('All best efforts')
    const tag = within(records).getByText(wholeText('2 weeks ago'))
    expect(tag).toHaveClass('records__set')
    expect(tag).not.toHaveClass('chip')
  })

  it('counts a record set months before in months, and one set two years back in years', () => {
    // 1 January 2025 is 525 days before 10 June 2026, which is 17 months; 1 January 2024 is 891 days.
    const january = makeActivity({
      id: 'run-jan',
      name: 'Early run',
      sport: 'run',
      startMs: new Date(2025, 0, 1, 7).getTime(),
    })
    const older = makeActivity({
      id: 'run-older',
      name: 'Older run',
      sport: 'run',
      startMs: new Date(2024, 0, 1, 7).getTime(),
    })
    for (const [activity, ago] of [
      [january, '17 months ago'],
      [older, '2 years ago'],
    ] as const) {
      renderPage(
        'run',
        makeResult({
          activities: [activity],
          runCurve: [curvePoint(300, 4.1, activity.id), curvePoint(1200, 3.6, activity.id)],
        }),
      )
      const records = openSection('All best efforts')
      expect(within(records).getByText(wholeText(ago))).toBeInTheDocument()
      cleanup()
    }
    // Records from two activities each keep their own date, and no count of days ago.
    renderPage(
      'run',
      makeResult({
        activities: [january, older],
        runCurve: [curvePoint(1200, 3.6, 'run-jan'), curvePoint(300, 4.1, 'run-older')],
      }),
    )
    const records = openSection('All best efforts')
    expect(recordNamed(records, '20 min').querySelector('.records__date')).toHaveTextContent(
      /^1 Jan 2025$/,
    )
    expect(within(records).queryByText(/ago/)).toBeNull()
  })

  it('says when every record was set in one activity on the shared line, with its count', () => {
    renderPage(
      'run',
      makeResult({
        activities: [morningRun],
        runCurve: [curvePoint(300, 5.5, 'run-1'), curvePoint(1200, 3.6, 'run-1')],
      }),
    )

    // 5 January is 156 days before 10 June 2026: five months.
    const records = openSection('All best efforts')
    expect(
      within(records)
        .getByText(/All set on/)
        .closest('p'),
    ).toHaveTextContent('All set on Morning run, 5 Jan · 5 months ago')
    expect(within(records).queryByText(/^Set /)).not.toBeInTheDocument()
  })

  it('says a record dated after the page opened was set today, not a negative number of days ago', () => {
    const tomorrow = makeActivity({
      id: 'run-tomorrow',
      name: 'Tomorrow run',
      sport: 'run',
      startMs: new Date(2026, 5, 11, 7).getTime(),
    })
    renderPage(
      'run',
      makeResult({
        activities: [tomorrow],
        runCurve: [curvePoint(300, 5.5, 'run-tomorrow'), curvePoint(1200, 3.6, 'run-tomorrow')],
      }),
    )

    const records = openSection('All best efforts')
    expect(within(records).getByText('today')).toHaveClass('records__set')
  })

  it('says a record was set today when its activity is from today', () => {
    const today = makeActivity({
      id: 'run-today',
      name: 'Today run',
      sport: 'run',
      startMs: new Date(2026, 5, 10, 7).getTime(),
    })
    renderPage(
      'run',
      makeResult({
        activities: [today],
        runCurve: [curvePoint(300, 5.5, 'run-today'), curvePoint(1200, 3.6, 'run-today')],
      }),
    )

    const records = openSection('All best efforts')
    expect(within(records).getByText('today')).toHaveClass('records__set')
  })

  it('reads the clock once when the page opens, so a later render does not move the count', () => {
    const june = makeActivity({
      id: 'run-june',
      name: 'Late run',
      sport: 'run',
      startMs: new Date(2026, 5, 1, 7).getTime(),
    })
    const page = () => (
      <SportPage
        sport="run"
        result={makeResult({
          activities: [june],
          runCurve: [curvePoint(300, 4.1, 'run-june'), curvePoint(1200, 3.6, 'run-june')],
        })}
        previous={null}
        previousLabel={null}
        trends={NO_TRENDS}
        sameHeartRate={NO_SAME_HEART_RATE.run}
        lateEvidence={NO_LATE_EVIDENCE.run}
        change={null}
        units="metric"
        massKg={75}
        weighted
        profile={null}
        missingAge="year of birth and sex"
        controls={<span>Period picker</span>}
        rangeDays={42}
        inLibrary={1}
        library={[]}
        emptyText="Nothing in this period."
        onAddFiles={vi.fn()}
      />
    )
    const { rerender } = render(page())
    vi.setSystemTime(NOW + 2 * 24 * 60 * 60 * 1000)
    rerender(page())

    const records = openSection('All best efforts')
    expect(within(records).getByText(wholeText('9 days ago'))).toBeInTheDocument()
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

    const section = openSection('All best efforts')
    const records = within(section.querySelector<HTMLElement>('ol.records')!)
    // A run lists no best shorter than 5 minutes, though its curve holds a 1 minute point.
    expect(records.queryByText(wholeText('1 min'))).not.toBeInTheDocument()
    expect(records.getByText(wholeText('5 min'))).toBeInTheDocument()
    expect(records.getByText(wholeText('20 min'))).toBeInTheDocument()
    expect(records.getByText(wholeText('60 min'))).toBeInTheDocument()
    // A duration's figure is a pace, so only a distance's time is marked as a finish time.
    expect(records.queryByText('Finish time')).not.toBeInTheDocument()
    expect(within(section).getAllByRole('link', { name: 'Morning run, 5 Jan' })[0]).toHaveAttribute(
      'href',
      '#/activities/run-1',
    )
  })

  it('says once, in the list’s Details, that a run’s paces are GAP, with its meaning one press away, and on no row', () => {
    renderPage(
      'run',
      makeResult({
        activities: [morningRun],
        runCurve: [curvePoint(300, 4.1, 'run-1'), curvePoint(1200, 3.6, 'run-1')],
      }),
    )
    const section = openSection('All best efforts')
    const marks = within(section).getAllByRole('button', { name: 'GAP' })
    expect(marks).toHaveLength(1)
    const details = marks[0]!.closest('details')!
    expect(details.querySelector('summary')).toHaveTextContent(/^Details/)
    expect(details).toHaveTextContent(/^Details.*Paces are grade-adjusted \(GAP/)
    expect(marks[0]!.parentElement).toHaveTextContent(
      /GAP.*Grade-adjusted pace: your pace allowing for hills, as if on level ground\./,
    )
    expect(section.querySelector('ol.records')?.textContent).not.toMatch(/GAP/)
  })

  it('shows the best cycling efforts in watts with W/kg', () => {
    renderPage(
      'ride',
      makeResult({
        activities: [makeActivity({ id: 'ride-1', sport: 'ride', name: 'Hill ride' })],
        rideCurve: [curvePoint(60, 400, 'ride-1')],
      }),
    )

    const records = openSection('All best efforts')
    expect(within(records).getByText(wholeText('400 W'))).toBeInTheDocument()
    expect(within(records).getByText(wholeText('5.3 W/kg'))).toBeInTheDocument()
  })

  it('leaves GAP off the cycling page', () => {
    renderPage('ride', makeResult({ activities: [makeActivity({ id: 'ride-1', sport: 'ride' })] }))

    expect(screen.queryByRole('button', { name: 'GAP' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Grade-adjusted pace/)).not.toBeInTheDocument()
  })

  it('shows every duration as a chart under the records, with no heading of its own', () => {
    renderPage('run', makeResult({ activities: [morningRun] }))

    const records = screen.getByRole('region', { name: 'Best efforts' })
    expect(within(records).getByRole('figure', { name: 'Best efforts' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Pace curve' })).not.toBeInTheDocument()
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

    const records = openSection('All best efforts')
    expect(recordNamed(records, '20 min').querySelector('.records__grade')?.textContent).toBe(
      'Local\u00a067%',
    )
  })

  it('leaves the distance a duration grade is taken at to the activity: the row says its level and percent only', () => {
    renderPage(
      'run',
      makeResult({
        activities: [morningRun],
        runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
      }),
      'metric',
      MAN_BORN_1986,
    )

    const records = openSection('All best efforts')
    expect(recordNamed(records, '20 min').querySelector('.records__grade')?.textContent).toBe(
      'Local\u00a067%',
    )
    expect(recordNamed(records, '20 min').textContent).not.toMatch(/km in 20 min/)
  })

  it('shows no grade for a run record that covers under a mile', () => {
    renderPage(
      'run',
      makeResult({
        activities: [morningRun],
        // 300 s at 5 m/s covers 1,500 m.
        runCurve: [curvePoint(300, flatWkg(5), 'run-1')],
      }),
      'metric',
      MAN_BORN_1986,
    )

    const records = openSection('All best efforts')
    expect(recordNamed(records, '5 min').textContent).not.toMatch(/Estimated age grade/)
  })

  it('shows a ride record’s level and percent, its range left to the threshold’s ladder', () => {
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

    const records = openSection('All best efforts')
    // The row reads only its level and percent: no lead, no range, and no note under the list.
    expect(recordNamed(records, '20 min').querySelector('.records__grade')?.textContent).toBe(
      'Local\u00a067%',
    )
    expect(records.textContent).not.toMatch(/running equivalent/)
  })

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

    const level = screen.getByRole('region', { name: 'Age grade at threshold' })
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
    const level = screen.getByRole('region', { name: 'Age grade at threshold' })
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
    const level = screen.getByRole('region', { name: 'Age grade at threshold' })
    expect(level.querySelector('.sport-hero__grades')).toBeNull()
    expect(level).not.toHaveTextContent(/at age/)
    expect(level.querySelector('.level-ladder__ring')).not.toBeNull()
    expect(level.querySelector('.level-ladder__range')).toBeNull()
    expect(level.textContent).not.toMatch(/estimated/i)
    expect(level.querySelector('.level-ladder__key')).toBeNull()
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

    expect(screen.getByRole('figure', { name: 'Best efforts' })).toBeInTheDocument()
    const legend = screen.getByRole('list', { name: 'Legend' })
    expect(within(legend).getByText(wholeText('Previous 6 weeks'))).toBeInTheDocument()
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
  })
  const TRENDS: Record<EffortLengthS, TrendPoint[]> = {
    [FIVE_MIN_S]: [week(0, 16), week(1, 16.2)],
    [TWENTY_MIN_S]: [week(0, 15), week(1, 15.2)],
    [SIXTY_MIN_S]: [week(0, 14), week(1, 14.2)],
  }

  /** The pace of a running value, as the trend table shows it, for the given metabolic W/kg. */
  const paceOf = (wkg: number | null) =>
    formatPace(wkg === null ? NaN : (wkg - RESTING_W_PER_KG) / FLAT_RUN_COST, 'metric')

  /** The pace column of the dated bests chart named by `label`, one entry per dot. */
  const paceColumnOf = (label: string): (string | null | undefined)[] => {
    const figure = screen.getByRole('figure', { name: new RegExp(label) })
    return Array.from(figure?.querySelectorAll('tbody tr') ?? [], (row) => {
      return row.querySelectorAll('th, td')[1]?.textContent
    })
  }

  const paceList = (points: TrendPoint[]) => points.map((point) => paceOf(point.runWkg))

  it('shows the 20-minute dated bests first, with an effort length choice', () => {
    renderPage('run', makeResult({ activities: [morningRun] }), 'metric', null, null, null, TRENDS)
    const choice = screen.getByRole('group', { name: 'Effort length' })
    expect(within(choice).getByRole('radio', { name: '20 min' })).toBeChecked()
    expect(screen.getByRole('heading', { name: 'Best efforts by day' })).toBeInTheDocument()
    expect(screen.getByRole('figure', { name: 'Best 20 min' })).toBeInTheDocument()
  })

  it('draws the dated bests of the effort length chosen, with the length in its name', () => {
    renderPage('run', makeResult({ activities: [morningRun] }), 'metric', null, null, null, TRENDS)
    const choice = screen.getByRole('group', { name: 'Effort length' })

    fireEvent.click(within(choice).getByRole('radio', { name: '5 min' }))
    expect(screen.getByRole('figure', { name: 'Best 5 min' })).toBeInTheDocument()
    expect(paceColumnOf('Best 5 min')).toEqual(paceList(TRENDS[FIVE_MIN_S]))
    expect(screen.queryByRole('figure', { name: 'Best 20 min' })).toBeNull()

    fireEvent.click(within(choice).getByRole('radio', { name: '60 min' }))
    expect(screen.getByRole('figure', { name: 'Best 60 min' })).toBeInTheDocument()
    expect(paceColumnOf('Best 60 min')).toEqual(paceList(TRENDS[SIXTY_MIN_S]))
    expect(paceColumnOf('Best 60 min')).not.toEqual(paceList(TRENDS[TWENTY_MIN_S]))
  })

  it('spells GAP out once on the page, on the best efforts axis, and writes it short on the others', () => {
    renderPage(
      'run',
      makeResult({
        activities: [morningRun],
        runCurve: [
          curvePoint(300, FIVE_K_IN_20_MIN_WKG, 'run-1'),
          curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG * 0.9, 'run-1'),
        ],
      }),
      'metric',
      null,
      null,
      null,
      TRENDS,
    )

    const axisTitles = Array.from(
      document.querySelectorAll('svg text'),
      (n) => n.textContent ?? '',
    ).filter((text) => /faster up$/.test(text))
    expect(axisTitles).toEqual(['Grade-adjusted pace (/km), faster up', 'GAP (/km), faster up'])
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

  /** The run page's All best efforts section, where the distance records are listed. */
  function bestEfforts(): HTMLElement {
    return openSection('All best efforts')
  }

  it('shows no pace on the 1 mi row in miles, where the pace is the time itself', () => {
    const mile = makeActivity({
      id: 'mile',
      name: 'Mile repeat',
      sport: 'run',
      startMs: at(12),
      distanceBests: [{ distanceM: 1609.344, seconds: 400 }],
    })
    renderPage('run', makeResult({ activities: [mile] }), 'imperial')

    const section = within(bestEfforts())
    expect(section.getByText(wholeText('1 mi'))).toBeTruthy()
    expect(section.getByText(wholeText('6:40'))).toBeTruthy()
    expect(section.queryByText(/\/mi/)).toBeNull()
  })

  it('lists the fastest run at each record distance, with its finish time alone in the figure column, and its activity', () => {
    renderPage('run', makeResult({ activities: [parkrun, morningRun] }))
    const section = within(bestEfforts())
    expect(section.getByText(wholeText('1 km'))).toBeTruthy()
    expect(section.getByText(wholeText('4:00'))).toBeTruthy()
    // The 1 km pace is its time, so the row shows the time alone.
    expect(section.queryByText(wholeText('4:00 /km'))).toBeNull()
    expect(section.getByText(wholeText('5 km'))).toBeTruthy()
    expect(section.getByText(wholeText('21:00'))).toBeTruthy()
    // One figure column: a distance row's pace is on its activity, and no row carries a Finish time tag.
    expect(section.queryByText(wholeText('4:12 /km'))).toBeNull()
    for (const name of ['1 km', '5 km']) {
      expect(recordNamed(bestEfforts(), name).querySelector('.records__sub')).toBeNull()
    }
    expect(section.queryByText('Finish time')).toBeNull()
    // Both distance bests were set in the same run, so the run is named once under the list.
    expect(section.getAllByRole('link', { name: /Parkrun/ })).toHaveLength(1)
    expect(section.getByText('All set on')).toBeInTheDocument()
  })

  it('grades each distance record it has a standard for, and says in words where it has none', () => {
    renderPage('run', makeResult({ activities: [parkrun, morningRun] }), 'metric', MAN_BORN_1986)

    const records = openSection('All best efforts')
    expect(recordNamed(records, '5 km').querySelector('.records__grade')?.textContent).toMatch(
      /^(Recreational|Local|Regional|National|World)\u00a0\d+%$/,
    )
    // The 1 km row has no grade of its own: the list says once that no standard covers under a mile.
    expect(recordNamed(records, '1 km').querySelector('.records__grade')).toBeNull()
    expect(
      within(records).getAllByText(wholeText('No age standard under 1 mile, for the 1 km')),
    ).toHaveLength(1)
  })

  it('says the distance records may not be the fastest when some runs predate distance bests', () => {
    renderPage('run', makeResult({ activities: [parkrun, morningRun] }))
    expect(
      within(openSection('All best efforts')).getByText(
        'Runs added before distance bests were recorded don’t have them yet, so these may not be the fastest. Add those runs again to include them.',
      ),
    ).toBeTruthy()
  })

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
    renderPage('ride', rideResult(), 'metric', MAN_BORN_1986, null, null, NO_TRENDS, false)

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
    renderPage('ride', rideResult(), 'metric', MAN_BORN_1986, null, null, NO_TRENDS, true)

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
      NO_TRENDS,
      false,
    )

    expect(screen.getByRole('region', { name: THRESHOLD_HEADING.run })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Best efforts' })).toBeInTheDocument()
    expect(screen.queryByText(/Add your weight on/)).not.toBeInTheDocument()
  })

  it('shows a cycling record’s watts plainly: no Estimated chip on the row, virtual power or measured', () => {
    const { unmount } = renderPage('ride', rideResult())
    const virtual = openSection('All best efforts')
    expect(within(virtual).getByText(wholeText('400 W'))).toBeInTheDocument()
    expect(within(virtual).queryByText('Estimated')).toBeNull()
    // The section says once that the watts are estimated.
    expect(
      screen.getByText('Power meters measured 0 of 1 ride. Watts for the rest are estimated.'),
    ).toBeInTheDocument()
    unmount()

    renderPage(
      'ride',
      makeResult({
        activities: [{ ...ride, powerSource: 'measured' }],
        rideCurve: [curvePoint(HEADLINE_DURATION_S, 400, 'ride-1')],
      }),
    )
    const measured = openSection('All best efforts')
    expect(within(measured).getByText(wholeText('400 W'))).toBeInTheDocument()
    expect(within(measured).queryByText('Estimated')).toBeNull()
    expect(screen.queryByText(/Power meters measured/)).toBeNull()
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
      <p>Based on your age, sex and 75 kg. Edit</p>,
    )
    expect(
      screen.getByText(wholeText('Based on your age, sex and 75 kg. Edit')),
    ).toBeInTheDocument()
  })
})

describe('SportPage depth', () => {
  it('draws the level ladder under the threshold, graded at threshold', () => {
    renderPage(
      'run',
      makeResult({
        activities: [morningRun],
        runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
      }),
      'metric',
      MAN_BORN_1986,
    )

    // The level sits beside the threshold, in the same card, as its own named section.
    const level = screen.getByRole('region', { name: 'Age grade at threshold' })
    expect(
      within(level).getByRole('img', { name: /Age grade 67%, Local, at threshold/ }),
    ).toBeInTheDocument()
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
      NO_TRENDS,
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

    expect(screen.getByRole('region', { name: 'Age grade at threshold' })).toBeInTheDocument()
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

  it('names a record with no standard once, under the full list, and leaves its row without a grade', () => {
    renderPage(
      'run',
      makeResult({
        activities: [morningRun],
        // 300 s at 5 m/s covers 1,500 m, under a mile.
        runCurve: [curvePoint(300, flatWkg(5), 'run-1')],
      }),
      'metric',
      MAN_BORN_1986,
    )

    const records = openSection('All best efforts')
    expect(recordNamed(records, '5 min').querySelector('.records__grade')).toBeNull()
    expect(
      within(records).getByText(wholeText('No age standard under 1 mile, for the 5 min')),
    ).toBeInTheDocument()
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

    const section = within(openSection('All best efforts'))
    expect(section.getByText('Half marathon')).toBeInTheDocument()
    expect(section.getByText(wholeText('1:27:54'))).toBeInTheDocument()
  })

  it('says nothing about distance times being as run, where a distance is listed or not', () => {
    const fiveK = makeActivity({
      id: 'five-k',
      name: 'Five K',
      sport: 'run',
      startMs: new Date(2026, 0, 18, 9).getTime(),
      distanceBests: [{ distanceM: 5000, seconds: 1245 }],
    })
    renderPage('run', makeResult({ activities: [fiveK] }))

    const section = within(openSection('All best efforts'))
    expect(section.getByText(wholeText('5 km'))).toBeInTheDocument()
    expect(section.queryByText(/Distance times are as run|allows for hills/)).toBeNull()
    cleanup()
    renderPage('run', makeResult({ activities: [morningRun] }))
    expect(screen.queryByText(/Distance times are as run/)).toBeNull()
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

    expect(screen.getByText(wholeText('Last run 5 Jan · 1 run · 10.0 km'))).toBeInTheDocument()
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

  it('names the dated bests "Best efforts by day" and draws the curve in the sport’s unit under the records', () => {
    renderPage(
      'ride',
      makeResult({
        activities: [makeActivity({ id: 'ride-1', sport: 'ride' })],
        rideCurve: [curvePoint(300, 300, 'ride-1'), curvePoint(1200, 250, 'ride-1')],
      }),
    )

    expect(screen.getByRole('heading', { name: 'Best efforts by day' })).toBeInTheDocument()
    const records = screen.getByRole('region', { name: 'Best efforts' })
    const figure = within(records).getByRole('figure', { name: 'Best efforts' })
    expect(figure.querySelector('svg')?.textContent).toContain('Power (W)')
  })

  describe('the weekly same heart rate', () => {
    const WEEK_MS = 7 * 86_400_000
    const fitted = (index: number, output: number): SameHeartRate['weeks'][number] => ({
      endMs: Date.UTC(2025, 0, 12, 23, 59, 59, 999) + index * WEEK_MS,
      fit: { output, low: output * 0.97, high: output * 1.03 },
      lacks: null,
      blocks: 14,
      activities: 5,
    })
    const reading = (from: number, to: number): SameHeartRate => ({
      referenceHeartRate: 145,
      // Eight weeks, so a steady rise is a trend the line's band can tell from flat.
      weeks: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => fitted(i, from + ((to - from) * i) / 7)),
      reportedWeeks: 8,
      lacks: null,
      latestWeekEndMs: fitted(7, to).endMs,
    })
    const rideActivity = () =>
      makeResult({ activities: [makeActivity({ id: 'r', sport: 'ride' })] })

    it('is a closed section that follows the dated bests', () => {
      renderPage(
        'ride',
        rideActivity(),
        'metric',
        null,
        null,
        null,
        NO_TRENDS,
        true,
        null,
        42,
        '',
        null,
        reading(198, 214),
      )
      const names = screen
        .getAllByRole('region')
        .map(
          (region) => region.getAttribute('aria-label') ?? region.querySelector('h2')?.textContent,
        )
      expect(names.indexOf('Best efforts by day')).toBeGreaterThan(-1)
      // The section is headed by what its chart plots, the heart rate a number.
      expect(names.indexOf('Power at 145 bpm, by week')).toBeGreaterThan(
        names.indexOf('Best efforts by day'),
      )
    })

    it.each([
      ['a steady rise', reading(198, 214)],
      ['a flat reading', reading(204, 207)],
    ])(
      'claims no change for %s: the row says what is drawn, and the chart carries the heart rate in its name',
      (_name, data) => {
        renderPage(
          'ride',
          rideActivity(),
          'metric',
          null,
          null,
          null,
          NO_TRENDS,
          true,
          null,
          42,
          '',
          null,
          data,
        )
        expect(closedRow('Power at 145 bpm, by week')).toBe('Power at 145 bpm, by week')
        const section = openSection('Power at 145 bpm, by week')
        const figure = within(section).getByRole('figure', { name: 'Power at 145 bpm, by week' })
        expect(section.textContent).not.toMatch(
          /no clear change|more than|less than|clear of zero/i,
        )
        expect(figure.querySelector('.chart-frame__takeaway')).toBeNull()
        expect(figure.querySelector('[data-testid="same-hr-trend"]')).toBeNull()
      },
    )

    it('is one line in its own place that says what the library has, with too little data', () => {
      const none: SameHeartRate = { ...NO_SAME_HEART_RATE.ride, lacks: 'activities' }
      renderPage(
        'ride',
        rideActivity(),
        'metric',
        null,
        null,
        null,
        NO_TRENDS,
        true,
        null,
        42,
        '',
        null,
        none,
      )
      const line = screen.getByRole('region', { name: 'Power at heart rate' })
      expect(line.querySelector('figure')).toBeNull()
      expect(line.closest('details')).toBeNull()
      expect(
        within(line).getByText(wholeText('0 of 6 rides with steady stretches in 8 weeks.')),
      ).toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Not enough yet' })).toBeNull()
    })

    it('is not on a sport page with nothing in the period', () => {
      renderPage('run', makeResult({ activities: [] }))
      expect(screen.queryByRole('heading', { name: 'Pace at heart rate' })).toBeNull()
    })
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
        trends={NO_TRENDS}
        sameHeartRate={NO_SAME_HEART_RATE.run}
        lateEvidence={NO_LATE_EVIDENCE.run}
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
        trends={NO_TRENDS}
        sameHeartRate={NO_SAME_HEART_RATE.run}
        lateEvidence={NO_LATE_EVIDENCE.run}
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
        trends={NO_TRENDS}
        sameHeartRate={NO_SAME_HEART_RATE.run}
        lateEvidence={NO_LATE_EVIDENCE.run}
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
        trends={NO_TRENDS}
        sameHeartRate={NO_SAME_HEART_RATE.run}
        lateEvidence={NO_LATE_EVIDENCE.run}
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
    expect(screen.queryByTestId('indoor-split')).toBeNull()
    expect(screen.queryByText(/indoors|power counts/)).toBeNull()
  })

  it('says how many treadmill runs a mixed run library leaves out, once, under the answer', () => {
    const runs = Array.from({ length: 6 }, (_, i) =>
      makeActivity({ id: `run-${i}`, sport: 'run', indoor: i < 2 }),
    )
    renderPage('run', makeResult({ activities: runs }))
    expect(screen.getByTestId('indoor-split')).toHaveTextContent('2 treadmill runs: pace not used.')
  })

  it('says nothing of the split when no ride was indoors', () => {
    renderPage('ride', makeResult({ activities: rides(0, 5) }))
    expect(screen.queryByTestId('indoor-split')).toBeNull()
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
