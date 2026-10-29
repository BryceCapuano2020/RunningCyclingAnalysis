// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SameHeartRate, SportCurves, TrendPoint } from '@rca/core/digest'
import { NO_LATE_EVIDENCE } from '@rca/core/digest/lateEvidenceTypes'
import { NO_SAME_HEART_RATE } from '@rca/core/digest/sameHeartRateTypes'
import { EFFORT_LENGTHS_S, NO_TRENDS } from '@rca/core/digest/trendPoints'
import type { EffortLengthS } from '@rca/core/digest/trendPoints'
import type { AnalysisResult } from '@rca/core/pipeline'
import { FLAT_RUN_COST, HEADLINE_DURATION_S, RESTING_W_PER_KG } from '@rca/core/constants'
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
import type { AgeGap, AgeProfile } from '../grades'
import { THRESHOLD_FLOOR_LABEL, THRESHOLD_LABEL, THRESHOLD_MEANING } from '../sports'
import { RangePicker } from '../components/RangePicker'
import { closedRow, openSection } from '../test/openSection'
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
  missingAge: AgeGap | null = profile === null ? 'year of birth and sex' : null,
  sameHeartRate: SameHeartRate = NO_SAME_HEART_RATE[sport],
) {
  return render(
    <SportPage
      sport={sport}
      result={result}
      previous={previous}
      previousLabel={previousLabel}
      trends={trends}
      sameHeartRate={sameHeartRate}
      lateEvidence={NO_LATE_EVIDENCE[sport]}
      windowDays={14}
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

/** The range track's two printed ends and the word between them, as the answer draws the range. */
function rangeTrack(section: HTMLElement) {
  const spans = Array.from(section.querySelectorAll('.range-track__ends > span'))
  return { ends: [spans[0]?.textContent, spans[2]?.textContent], label: spans[1]?.textContent }
}

/** The record list item for one duration, found by its eyebrow such as "20 min". */
function recordNamed(records: HTMLElement, eyebrow: string): HTMLElement {
  const list = records.querySelector<HTMLElement>('ul.records')
  if (list === null) throw new Error('No record list')
  const item = within(list).getByText(eyebrow).closest('li')
  if (item === null) throw new Error(`No record named ${eyebrow}`)
  return item
}

describe('SportPage', () => {
  it('is the sport’s own page heading, with the period control under the answer, not in the heading row', () => {
    renderPage('run', makeResult({ activities: [morningRun] }))

    const heading = screen.getByRole('heading', { level: 1, name: 'Run' })
    expect(heading).toHaveAttribute('id', 'page-heading')
    expect(heading).toHaveAttribute('tabindex', '-1')
    const picker = screen.getByText('Period picker')
    const answer = screen.getByRole('region', { name: 'Threshold pace, estimated' })
    expect(answer.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(heading.closest('.page-head')?.contains(picker)).toBe(false)
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
    const prompt = screen.getByText('No runs between 12 May and 3 Aug 2025.')
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
        windowDays={14}
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

  it('names the threshold with a second-level heading, as the sections below it are named', () => {
    renderPage('run', makeResult({ activities: [morningRun] }))

    expect(
      screen.getByRole('heading', { level: 2, name: 'Threshold pace, estimated' }),
    ).toBeInTheDocument()
  })

  it('shows the running threshold as a named pace estimate, with no run count beside it', () => {
    renderPage('run', makeResult({ activities: [morningRun] }))

    const section = screen.getByRole('region', { name: 'Threshold pace, estimated' })
    expect(heroFigure(section)).toEqual({ number: '23:23', unit: '/km' })
    // The count was the runs in the period, not the efforts the threshold is fitted from.
    expect(within(section).queryByText(/Based on/)).not.toBeInTheDocument()
  })

  it('shows the running threshold’s range, from the fit’s standard error, under its figure', () => {
    renderPage('run', makeResult({ activities: [morningRun] }))

    const section = screen.getByRole('region', { name: 'Threshold pace, estimated' })
    expect(rangeTrack(section)).toEqual({ ends: ['22:58', '23:49'], label: 'fit spread, /km' })
  })

  it('shows the cycling threshold’s range in watts under its figure', () => {
    const ride = makeActivity({ id: 'ride-1', sport: 'ride' })
    renderPage('ride', makeResult({ activities: [ride] }))

    const section = screen.getByRole('region', { name: THRESHOLD_LABEL.ride })
    expect(rangeTrack(section)).toEqual({ ends: ['48', '49'], label: 'fit spread, W' })
  })

  it('says under the range that the best 15 and 20 min were uneven, when the threshold has an uneven fit', () => {
    const ride = makeActivity({ id: 'ride-1', sport: 'ride' })
    const uneven = {
      fit: { cp: 3.6, wPrime: 15, cpSe: 0.04, r2: 0.98, nPoints: 5 },
      leftOutS: [900, 1200],
      floor: 3.2,
    }
    renderPage('ride', makeResult({ activities: [ride], rideCpUneven: uneven }))

    const section = screen.getByRole('region', { name: THRESHOLD_LABEL.ride })
    // Between two fits, not one fit's spread, so it is a range.
    expect(rangeTrack(section)).toEqual({ ends: ['48', '58'], label: 'range, W' })
    expect(
      within(section).getByText(
        'Your best 15 min and 20 min were uneven: each held a hard burst inside easier riding, so the range stays wide. A steady all-out 20 min would narrow it.',
      ),
    ).toBeInTheDocument()
  })

  it('shows the floor as the figure, with its range and note, when the threshold is refused', () => {
    const ride = makeActivity({ id: 'ride-1', sport: 'ride' })
    const uneven = {
      fit: { cp: 3.6, wPrime: 15, cpSe: 0.04, r2: 0.98, nPoints: 5 },
      leftOutS: [900, 1200],
      floor: 3.2,
    }
    renderPage(
      'ride',
      makeResult({
        activities: [ride],
        rideCp: null,
        rideCpRefusal: 'shape',
        rideCpUneven: uneven,
      }),
    )

    const section = screen.getByRole('region', { name: THRESHOLD_FLOOR_LABEL.ride })
    expect(heroFigure(section)).toEqual({ number: '52', unit: 'W' })
    expect(rangeTrack(section)).toEqual({ ends: ['52', '58'], label: 'range, W' })
    expect(within(section).queryByText(/Needs a harder effort/)).not.toBeInTheDocument()
    expect(within(section).getByText(/were uneven: each held a hard burst/)).toBeInTheDocument()
    // A floor is a held best, not an estimate, so the estimate's meaning is not said under it.
    expect(within(section).queryByText(THRESHOLD_MEANING.ride)).not.toBeInTheDocument()
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
    expect(screen.queryByText(/Based on/)).not.toBeInTheDocument()
  })

  it('does not count the rides a cycling threshold rests on', () => {
    const ride = makeActivity({ id: 'ride-1', sport: 'ride' })
    renderPage(
      'ride',
      makeResult({ activities: [ride, makeActivity({ id: 'ride-2', sport: 'ride' })] }),
    )

    expect(screen.queryByText(/Based on/)).not.toBeInTheDocument()
    expect(heroFigure(screen.getByRole('region', { name: THRESHOLD_LABEL.ride }))).toEqual({
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

  it('tags each record with how long ago it was set, in days from today', () => {
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
        runCurve: [curvePoint(1200, 3.6, 'run-june')],
      }),
    )

    // June is the newest and only activity, but today is 10 June, so the best was set nine days ago.
    const records = openSection('All best efforts')
    expect(within(recordNamed(records, '20 min')).getByText('9 days ago')).toBeInTheDocument()
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
      makeResult({ activities: [fortnight], runCurve: [curvePoint(1200, 3.6, 'run-fortnight')] }),
    )

    const records = openSection('All best efforts')
    const tag = within(recordNamed(records, '20 min')).getByText('2 weeks ago')
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
    renderPage(
      'run',
      makeResult({
        activities: [january, older],
        runCurve: [curvePoint(1200, 3.6, 'run-jan'), curvePoint(300, 4.1, 'run-older')],
      }),
    )

    const records = openSection('All best efforts')
    expect(within(recordNamed(records, '20 min')).getByText('17 months ago')).toBeInTheDocument()
    expect(within(recordNamed(records, '5 min')).getByText('2 years ago')).toBeInTheDocument()
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
      makeResult({ activities: [tomorrow], runCurve: [curvePoint(300, 5.5, 'run-tomorrow')] }),
    )

    const records = openSection('All best efforts')
    expect(within(recordNamed(records, '5 min')).getByText('today')).toBeInTheDocument()
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
      makeResult({ activities: [today], runCurve: [curvePoint(300, 5.5, 'run-today')] }),
    )

    const records = openSection('All best efforts')
    expect(within(recordNamed(records, '5 min')).getByText('today')).toBeInTheDocument()
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
          runCurve: [curvePoint(1200, 3.6, 'run-june')],
        })}
        previous={null}
        previousLabel={null}
        trends={NO_TRENDS}
        sameHeartRate={NO_SAME_HEART_RATE.run}
        lateEvidence={NO_LATE_EVIDENCE.run}
        windowDays={14}
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
    expect(within(recordNamed(records, '20 min')).getByText('9 days ago')).toBeInTheDocument()
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

  it('shows the cycling threshold in watts with its W/kg', () => {
    renderPage('ride', makeResult({ activities: [makeActivity({ id: 'ride-1', sport: 'ride' })] }))

    const section = screen.getByRole('region', { name: THRESHOLD_LABEL.ride })
    expect(heroFigure(section)).toEqual({ number: '48', unit: 'W' })
    expect(within(section).getByText('0.6 W/kg')).toBeInTheDocument()
    // The estimate is a chip with a ring, as well as in the heading's words.
    expect(within(section).getByText('Estimated', { selector: '.stat-tile__basis' })).toHaveClass(
      'stat-tile__basis--estimated',
    )
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

  it('names the longest effort held when none is as long as the threshold needs', () => {
    const short = [{ durationS: 300, value: 6, activityId: morningRun.id, startIndex: 0 }]
    renderPage('run', makeResult({ activities: [morningRun], runCp: null, runCurve: short }))

    expect(
      screen.getByText('Needs an effort of about 20 min. Your longest so far is 5 min.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Needs efforts between/)).not.toBeInTheDocument()
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

    const section = openSection('All best efforts')
    const records = within(section.querySelector<HTMLElement>('ul.records')!)
    // A run lists no best shorter than 5 minutes, though its curve holds a 1 minute point.
    expect(records.queryByText('1 min')).not.toBeInTheDocument()
    expect(records.getByText('5 min')).toBeInTheDocument()
    expect(records.getByText('20 min')).toBeInTheDocument()
    expect(records.getByText('60 min')).toBeInTheDocument()
    expect(within(section).getAllByRole('link', { name: 'Morning run, 5 Jan' })[0]).toHaveAttribute(
      'href',
      '#/activities/run-1',
    )
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

  it('shows every duration as a chart under the records, with no heading of its own', () => {
    renderPage('run', makeResult({ activities: [morningRun] }))

    const records = screen.getByRole('region', { name: 'Best efforts' })
    expect(
      within(records).getByRole('figure', { name: /^Run flat pace .* by duration$/ }),
    ).toBeInTheDocument()
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
    expect(recordNamed(records, '20 min').textContent).toContain('Local · 67%')
  })

  it('says the distance a duration grade is taken at, after the grade', () => {
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
    expect(recordNamed(records, '20 min').textContent).toContain('Local · 67% · 5.0 km in 20 min')
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

    const records = openSection('All best efforts')
    // The lead is said once under the list, so the row reads only its level, range and percent.
    expect(recordNamed(records, '20 min').querySelector('.records__grade')?.textContent).toBe(
      'Local to Regional · 67% (63–71%)',
    )
    expect(
      within(records).getByText('Estimated through its running equivalent'),
    ).toBeInTheDocument()
  })

  it('names the standard in the grade’s caption, linked to the age grades on How sure is this?', () => {
    renderPage(
      'run',
      makeResult({
        activities: [morningRun],
        runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
      }),
      'metric',
      MAN_BORN_1986,
    )

    const caption = screen.getByText(/graded at age 40, on the/)
    expect(caption).toHaveTextContent(
      '4:00 /km on your best 20 min, graded at age 40, on the USATF road standards. A level, not a ranking.',
    )
    expect(within(caption).getByRole('link', { name: 'USATF road standards' })).toHaveAttribute(
      'href',
      '#/method',
    )
  })

  it('says the grades are a level, not a ranking, at the end of the caption', () => {
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
    expect(screen.getByText(/graded at age 40, on the/)).toHaveTextContent(
      /on the USATF road standards\. A level, not a ranking\.$/,
    )
  })

  it('leaves the full standards credit to How sure is this?, with no source paragraph under Best efforts', () => {
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

  it('says a ride’s grade is estimated, and leaves its bracketed range to the key under the ladder', () => {
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
    const caption = screen.getByText(/graded through its running equivalent, at age 40, on the/)
    expect(caption).toHaveTextContent(
      '400 W (estimated) on your best 20 min, graded through its running equivalent, at age 40, on the USATF road standards. A level, not a ranking.',
    )
    expect(within(caption).getByRole('link', { name: 'USATF road standards' })).toHaveAttribute(
      'href',
      '#/method',
    )
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

    expect(
      screen.getByRole('figure', { name: 'Run flat pace per kilometre by duration' }),
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
      screen.getByText(/^Run flat pace per kilometre, best 20 min, trailing/),
    ).toBeInTheDocument()
  })

  it('draws the trend of the effort length chosen, with the length in its name', () => {
    renderPage('run', makeResult({ activities: [morningRun] }), 'metric', null, null, null, TRENDS)
    const choice = screen.getByRole('group', { name: 'Effort length' })

    fireEvent.click(within(choice).getByRole('radio', { name: '5 min' }))
    expect(
      screen.getByText(/^Run flat pace per kilometre, best 5 min, trailing/),
    ).toBeInTheDocument()
    expect(paceColumnOf('best 5 min')).toEqual(paceList(TRENDS[FIVE_MIN_S]))
    expect(screen.queryByText(/best 20 min, trailing/)).toBeNull()

    fireEvent.click(within(choice).getByRole('radio', { name: '60 min' }))
    expect(screen.getByText(/best 60 min, trailing/)).toBeInTheDocument()
    expect(paceColumnOf('best 60 min')).toEqual(paceList(TRENDS[SIXTY_MIN_S]))
    expect(paceColumnOf('best 60 min')).not.toEqual(paceList(TRENDS[TWENTY_MIN_S]))
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

  /** The run page's Best efforts section, where the distance records sit as tiles under the curve. */
  function bestEfforts(): HTMLElement {
    const section = screen.getByRole('heading', { name: 'Best efforts' }).closest('section')
    if (!section) throw new Error('No Best efforts section')
    return section
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
    expect(section.getByText('1 mi')).toBeTruthy()
    expect(section.getByText('6:40')).toBeTruthy()
    expect(section.queryByText(/\/mi/)).toBeNull()
  })

  it('lists the fastest run at each record distance, with its time, pace and activity', () => {
    renderPage('run', makeResult({ activities: [parkrun, morningRun] }))
    const section = within(bestEfforts())
    expect(section.getByText('1 km')).toBeTruthy()
    expect(section.getByText('4:00')).toBeTruthy()
    // The 1 km pace is its time, so the row shows the time alone.
    expect(section.queryByText('4:00 /km')).toBeNull()
    expect(section.getByText('5 km')).toBeTruthy()
    expect(section.getByText('21:00')).toBeTruthy()
    expect(section.getByText('4:12 /km')).toBeTruthy()
    // Both distance bests were set in the same run, so the run is named once under the list.
    expect(section.getAllByRole('link', { name: /Parkrun/ })).toHaveLength(1)
    expect(section.getByText('All set on')).toBeInTheDocument()
  })

  it('grades each distance record it has a standard for, and says in words where it has none', () => {
    renderPage('run', makeResult({ activities: [parkrun, morningRun] }), 'metric', MAN_BORN_1986)

    const records = openSection('All best efforts')
    expect(recordNamed(records, '5 km').querySelector('.records__grade')?.textContent).toMatch(
      /^(Recreational|Local|Regional|National|World) · \d+%$/,
    )
    // The 1 km row has no grade of its own: the list says once that no standard covers under a mile.
    expect(recordNamed(records, '1 km').querySelector('.records__grade')).toBeNull()
    expect(within(records).getAllByText('No age standard under 1 mile')).toHaveLength(1)
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
    expect(screen.queryByText('1 km')).toBeNull()
    expect(screen.queryByText(/since distance records were introduced/)).toBeNull()
  })
})

describe('SportPage method link', () => {
  it('has no lone How sure is this? link under the head, since the grade links to How is this graded?', () => {
    renderPage(
      'run',
      makeResult({
        activities: [morningRun],
        runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
      }),
      'metric',
      MAN_BORN_1986,
    )
    expect(screen.queryByRole('link', { name: 'How sure is this?' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'How is this graded?' })).toHaveAttribute(
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
    expect(screen.queryByRole('region', { name: /of your best 20 min, trailing/ })).toBeNull()
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
      <p>Based on 75 kg, man and your age at each effort. Change on Profile</p>,
    )
    expect(
      screen.getByText('Based on 75 kg, man and your age at each effort. Change on Profile'),
    ).toBeInTheDocument()
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

    // The level sits beside the threshold, in the same card, as its own named section.
    const level = screen.getByRole('region', { name: 'Level of your best 20 min' })
    expect(
      within(level).getByRole('img', { name: /Age grade 67%, Local, on your best 20 min/ }),
    ).toBeInTheDocument()
    expect(level.querySelector('.sport-hero__level-name')).toHaveTextContent('Local')
    expect(level.querySelector('.sport-hero__level-value')).toHaveTextContent('67%')
    expect(level.querySelector('.sport-hero__grades')).toHaveTextContent(
      /^4:00 \/km on your best 20 min, graded at age 40/,
    )
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

  it('keeps the age and the standard under a sport page’s grade', () => {
    renderPage(
      'run',
      makeResult({
        activities: [morningRun],
        runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
      }),
      'metric',
      MAN_BORN_1986,
    )

    const caption = screen.getByText(/graded at age \d+, on the/)
    expect(caption).toHaveTextContent(
      /graded at age \d+, on the USATF road standards\. A level, not a ranking\.$/,
    )
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
    expect(within(records).getByText('No age standard under 1 mile')).toBeInTheDocument()
  })

  it('puts the flat pace note under the record tiles, not above them', () => {
    renderPage(
      'run',
      makeResult({
        activities: [morningRun],
        runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
      }),
    )

    const records = screen.getByRole('region', { name: 'Best efforts' })
    const tiles = records.querySelector('ul.record-tiles')!
    const note = within(records).getByText(
      'Flat pace: your pace allowing for hills, as if on level ground.',
    )
    expect(tiles.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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
    expect(section.getByText('1:27:54')).toBeInTheDocument()
  })

  it('says distance times are as run, once, under the best efforts, where a distance is listed', () => {
    const fiveK = makeActivity({
      id: 'five-k',
      name: 'Five K',
      sport: 'run',
      startMs: new Date(2026, 0, 18, 9).getTime(),
      distanceBests: [{ distanceM: 5000, seconds: 1245 }],
    })
    renderPage('run', makeResult({ activities: [fiveK] }))

    const section = within(openSection('All best efforts'))
    expect(
      section.getAllByText(
        'Distance times are as run. The pace curve allows for hills, so they can differ.',
      ),
    ).toHaveLength(1)
  })

  it('leaves the distance note out when no run has a distance best', () => {
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

    expect(screen.getByText('Last run 5 Jan · 1 run · 10.0 km')).toBeInTheDocument()
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

  it('puts a ride’s heart-rate line in its threshold section, apart from its watts', () => {
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

    const threshold = screen.getByRole('region', { name: THRESHOLD_LABEL.ride })
    // 80% is not a hard effort, so the line is a plain note and not the check a hard effort gets.
    expect(
      within(threshold)
        .getByText(
          'Your best 20 min on the bike reached 80% of your cycling reference heart rate (set from your highest heart rates on file). A hard 20 min effort would raise this.',
        )
        .closest('p'),
    ).toHaveClass('sport-hero__check--soft')
    expect(
      screen.getByText('Power meters measured 0 of 1 ride. Watts for the rest are estimated.'),
    ).toBeInTheDocument()
  })

  it('puts a run’s heart-rate line under its threshold meaning', () => {
    renderPage(
      'run',
      makeResult({
        activities: [morningRun],
        effort: [{ durationS: HEADLINE_DURATION_S, runHrFraction: 0.7, rideHrFraction: null }],
      }),
    )

    const line = screen
      .getByText(
        'Your best 20 min running reached 70% of your running reference heart rate (set from your highest heart rates on file). A hard 20 min effort would raise this.',
      )
      .closest('p')!
    expect(line).toHaveClass('sport-hero__check--soft')
    expect(line.previousElementSibling).toHaveTextContent(THRESHOLD_MEANING.run)
  })

  it('shows no heart-rate line when heart rate is not on file for the sport', () => {
    renderPage(
      'run',
      makeResult({
        activities: [morningRun],
        effort: [{ durationS: HEADLINE_DURATION_S, runHrFraction: null, rideHrFraction: 0.8 }],
      }),
    )

    expect(screen.queryByText(/reference heart rate/)).not.toBeInTheDocument()
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

      expect(screen.queryByText(/reference heart rate/)).not.toBeInTheDocument()
    },
  )

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

  it('names the trend "Week by week" and draws the curve in the sport’s unit under the records', () => {
    renderPage('ride', makeResult({ activities: [makeActivity({ id: 'ride-1', sport: 'ride' })] }))

    expect(screen.getByRole('heading', { name: 'Week by week' })).toBeInTheDocument()
    const records = screen.getByRole('region', { name: 'Best efforts' })
    expect(
      within(records).getByRole('figure', { name: 'Ride power in watts by duration' }),
    ).toBeInTheDocument()
  })

  describe('at the same heart rate', () => {
    const WEEK_MS = 7 * 86_400_000
    const fitted = (index: number, output: number): SameHeartRate['weeks'][number] => ({
      endMs: Date.UTC(2025, 0, 12, 23, 59, 59, 999) + index * WEEK_MS,
      fit: { output, low: output * 0.97, high: output * 1.03 },
      lacks: null,
      blocks: 14,
      activities: 5,
    })
    const reading = (from: number, to: number, real: boolean): SameHeartRate => ({
      referenceHeartRate: 145,
      // Eight weeks, so a steady rise is a trend the line's band can tell from flat.
      weeks: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => fitted(i, from + ((to - from) * i) / 7)),
      change: {
        fromEndMs: fitted(0, from).endMs,
        toEndMs: fitted(7, to).endMs,
        from,
        to,
        weeksApart: 7,
        relative: to / from - 1,
        real,
      },
      lacks: null,
      latestWeekEndMs: fitted(7, to).endMs,
    })
    const rideActivity = () =>
      makeResult({ activities: [makeActivity({ id: 'r', sport: 'ride' })] })

    it('is a closed section that follows the week-by-week trend', () => {
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
        reading(198, 214, true),
      )
      const names = screen
        .getAllByRole('region')
        .map(
          (region) => region.getAttribute('aria-label') ?? region.querySelector('h2')?.textContent,
        )
      expect(names.indexOf('Week by week')).toBeGreaterThan(-1)
      expect(names.indexOf('At the same heart rate')).toBeGreaterThan(names.indexOf('Week by week'))
    })

    it('says a real change, and draws the chart with the heart rate in its title', () => {
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
        reading(198, 214, true),
      )
      // The closed row says the finding: 16 W more than in the month the first week's window is in.
      expect(closedRow('At the same heart rate')).toBe(
        'At the same heart rateAt the same heart rate you put out 16 W more than in December (145 bpm)',
      )
      const section = openSection('At the same heart rate')
      // The note says the rule: both the end weeks' ranges and the trend must say so.
      expect(
        within(section).getByText(
          /A change is named only when the first and last weeks’ 90% ranges don’t overlap and the trend is clear of zero\./,
        ),
      ).toBeInTheDocument()
      const figure = within(section).getByRole('figure', { name: /Your output at 145 bpm/ })
      expect(figure).toHaveAccessibleDescription(
        'At the same heart rate you put out 16 W more than in December',
      )
    })

    it('quotes the first and last values, and says no clear change, when the ranges overlap', () => {
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
        reading(204, 207, false),
      )
      expect(closedRow('At the same heart rate')).toMatch(
        /At the same heart rate: no clear change since December \(145 bpm\)$/,
      )
      const figure = within(openSection('At the same heart rate')).getByRole('figure')
      expect(figure).toHaveAccessibleDescription(
        'At the same heart rate: no clear change since December',
      )
    })

    it('leaves the section out, and says what is missing in the list at the end, with too little data', () => {
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
      expect(screen.queryByRole('region', { name: 'At the same heart rate' })).toBeNull()
      const list = screen.getByRole('region', { name: 'Not enough yet' })
      expect(
        within(list).getByText(
          'At the same heart rate: needs steady stretches from at least 6 rides in 4 weeks.',
        ),
      ).toBeInTheDocument()
    })

    it('is not on a sport page with nothing in the period', () => {
      renderPage('run', makeResult({ activities: [] }))
      expect(screen.queryByRole('heading', { name: 'At the same heart rate' })).toBeNull()
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
        windowDays={14}
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
        windowDays={14}
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
        windowDays={14}
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
        windowDays={14}
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
