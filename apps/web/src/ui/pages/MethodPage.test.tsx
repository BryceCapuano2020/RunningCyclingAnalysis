// @vitest-environment jsdom
import { wholeText } from '../test/wholeText'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { AnalysisResult } from '@rca/core/pipeline'
import { NO_HEART_RATE_JUDGEMENT } from '@rca/core/digest/setAsideTypes'
import type { HeartRateJudgement } from '@rca/core/digest/setAsideTypes'
import type { Period } from '@rca/core/period'
import type { EffortCheck } from '@rca/core/types'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import {
  curvePoint,
  hrFixture,
  rideCurveFixture,
  rideMetabolicCurveFixture,
  runCurveFixture,
} from '../charts/test/fixtures'
import {
  FIVE_K_IN_20_MIN_WKG,
  MAN_BORN_1986,
  comparisonPoint,
  interval,
  makeActivity,
  makeEquivalence,
  makeResult,
} from '../components/test/fixtures'
import type { AgeProfile } from '../grades'
import { MethodPage } from './MethodPage'
import { requestMethodSection } from '../components/methodSection'
import { SECTION_ID } from '../components/methodTopics'

afterEach(() => {
  cleanup()
})

/** A six-week period from 12 May to 3 August 2025, dated in the viewer's zone. */
const DATED_SIX_WEEKS: Period = {
  choice: 42,
  startMs: new Date(2025, 4, 12, 12).getTime(),
  endMs: new Date(2025, 7, 3, 12).getTime(),
  days: 42,
  fellBack: false,
}

/** The page's facts about the comparison: the list that holds the model range fact. */
function factsOf(): HTMLElement {
  const list = screen.getByText(wholeText(/^The 90% range for Run against Ride/)).closest('ul')
  if (!list) throw new Error('No facts list')
  return list
}

function renderPage(
  result: AnalysisResult | null = makeResult(),
  profile: AgeProfile | null = null,
  period: Period | null = DATED_SIX_WEEKS,
  weightKnown = true,
  restoring = false,
  judgement: HeartRateJudgement = NO_HEART_RATE_JUDGEMENT,
) {
  return render(
    <MethodPage
      result={result}
      heartRateJudgement={judgement}
      profile={profile}
      period={period ?? undefined}
      weightKnown={weightKnown}
      restoring={restoring}
    />,
  )
}

/** A result whose comparison is the 20 minute point, with the given effort check. */
function withEffort(effort: EffortCheck, overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return makeResult({ effort: [effort], ...overrides })
}

/** Curves with one best effort each by the default run and ride, so each one contributes. */
const CONTRIBUTING = {
  runCurve: [curvePoint(HEADLINE_DURATION_S, 4, 'run-1')],
  rideCurve: [curvePoint(HEADLINE_DURATION_S, 250, 'ride-1')],
}

/** A result graded for both sports at the headline length: a run curve, and a ride's own best effort and equivalent. */
const GRADED: AnalysisResult = makeResult({
  runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
  rideCurve: [curvePoint(HEADLINE_DURATION_S, 250, 'ride-1')],
  equivalents: [makeEquivalence({ durationS: HEADLINE_DURATION_S })],
})

/** The one line shown under the heading. */
function answerLine(): HTMLElement {
  return screen
    .getByRole('group', { name: 'The short answer' })
    .querySelector('.method__answer-text') as HTMLElement
}

/** The value beside a label in the answer's Details, which is closed and so read by text. */
function answerRow(label: string): HTMLElement | null {
  const group = within(screen.getByRole('group', { name: 'The short answer' }))
  return (
    (group
      .queryByText(wholeText(label), { selector: 'dt, dt *' })
      ?.closest('div')
      ?.querySelector('dd') as HTMLElement | null | undefined) ?? null
  )
}

describe('MethodPage answer', () => {
  it('is the page heading, with nothing above it', () => {
    renderPage()

    expect(screen.getByRole('heading', { level: 1, name: 'Method' })).toHaveAttribute(
      'id',
      'page-heading',
    )
    expect(screen.queryByRole('link', { name: /Back to Balance/ })).toBeNull()
  })

  it('opens with one line, the balance verdict, and keeps what is recorded and how far to trust it behind Details', () => {
    renderPage(makeResult(CONTRIBUTING))

    expect(
      screen.getByRole('group', { name: 'The short answer' }).querySelectorAll(':scope > p'),
    ).toHaveLength(1)
    expect(screen.getByText(wholeText('Details')).closest('details')).not.toHaveAttribute('open')
    expect(answerLine()).toHaveTextContent('Your balance leans toward running.')
    expect(answerLine()).not.toHaveTextContent('are estimates')
    expect(answerRow('Recorded')).toHaveTextContent('Running efforts, ride power from a meter')
    expect(answerRow('Checks below')).toHaveTextContent('How far to trust them')
    expect(answerRow('Estimated')).toHaveTextContent(
      'Thresholds, ride levels, the balance and ride power without a meter',
    )
    expect(answerRow('Runs with a usable effort')).toHaveTextContent(/^1$/)
    expect(answerRow('Rides with a usable effort')).toHaveTextContent(/^1$/)
  })

  it('states the lean and its lead in the line, and where the range sits against level as a row', () => {
    // The fixture's ratio puts running 5% to 20% higher, so the range never reaches even: the balance
    // leans toward running. A reversed lean would read toward cycling and fail here.
    renderPage(makeResult(CONTRIBUTING))

    expect(answerLine()).toHaveTextContent(
      'Your balance leans toward running. Running 12% higher in energy (5% to 20%).',
    )
    expect(answerLine()).not.toHaveTextContent('leans toward cycling')
    // The lean is not taken back: no dead heat that "could go either way", and no sentence about the range.
    expect(answerLine()).not.toHaveTextContent(/dead heat|either way|crosses level|one side/)
    expect(answerRow('Range crosses level')).toHaveTextContent(/^No$/)
  })

  it('shows the range crossing level as a row, after the lean and its lead in the line', () => {
    // Running 10% higher at best, but a ratio of one sits inside the range, so the range crosses level.
    renderPage(
      makeResult({
        ...CONTRIBUTING,
        comparison: {
          prior: [comparisonPoint({ ratio: interval(0.9, 1.1, 1.3) })],
          calibrated: null,
        },
      }),
    )

    expect(answerLine()).toHaveTextContent(
      'Your balance leans toward running. Running 10% higher in energy (-11% to +30%).',
    )
    expect(answerRow('Range crosses level')).toHaveTextContent(/^Yes$/)
    expect(answerLine().textContent).not.toMatch(
      /dead heat|either way|stays on one side|treat this/,
    )
  })

  it('says the balance waits for the weight, and keeps the run estimate on its own', () => {
    renderPage(makeResult(CONTRIBUTING), null, DATED_SIX_WEEKS, false)

    expect(answerLine()).toHaveTextContent('Your balance waits for your weight.')
  })

  it('names each chip by its word and where it goes, and moves focus there', () => {
    renderPage(makeResult(CONTRIBUTING))
    const answer = within(screen.getByRole('group', { name: 'The short answer' }))

    // A run's grade is read as recorded, in the age grades section.
    fireEvent.click(answer.getByRole('button', { name: 'Recorded: see Age grades and levels' }))
    expect(screen.getByRole('heading', { name: 'Age grades and levels' })).toHaveFocus()
    expect(screen.getByRole('heading', { name: 'Age grades and levels' })).toHaveFocus()
    fireEvent.click(answer.getByRole('button', { name: 'Checks below: see Heart-rate check' }))
    expect(screen.getByRole('heading', { name: 'Heart-rate check' })).toHaveFocus()
  })

  it('counts only the runs and rides that set an effort, not every activity on file', () => {
    renderPage(
      makeResult({
        activities: [
          makeActivity({ id: 'run-1', sport: 'run' }),
          makeActivity({ id: 'run-2', sport: 'run' }),
          makeActivity({ id: 'run-3', sport: 'run' }),
          makeActivity({ id: 'ride-1', sport: 'ride' }),
          makeActivity({ id: 'ride-2', sport: 'ride' }),
        ],
        runCurve: [curvePoint(HEADLINE_DURATION_S, 4, 'run-1'), curvePoint(300, 4.5, 'run-2')],
        rideCurve: [curvePoint(HEADLINE_DURATION_S, 250, 'ride-2')],
      }),
    )

    expect(answerRow('Runs with a usable effort')).toHaveTextContent(/^2$/)
    expect(answerRow('Rides with a usable effort')).toHaveTextContent(/^1$/)
  })

  it('says no run has a usable effort when none sets one, rather than counting the files', () => {
    renderPage(makeResult({ runCurve: [], rideCurve: [] }))

    expect(answerRow('Runs with a usable effort')).toHaveTextContent('None yet')
    expect(document.body.textContent).not.toMatch(/estimates from 0 runs/)
  })

  it('says no run has a usable effort when the weight is not known either', () => {
    renderPage(makeResult({ runCurve: [], rideCurve: [] }), null, DATED_SIX_WEEKS, false)

    expect(answerLine()).toHaveTextContent('No run has a usable effort yet.')
  })

  it('names only the run estimate for a run-only library, even with the weight known', () => {
    renderPage(
      makeResult({ runCurve: [curvePoint(HEADLINE_DURATION_S, 4, 'run-1')], rideCurve: [] }),
      null,
      DATED_SIX_WEEKS,
    )

    expect(answerRow('Estimated')).toHaveTextContent(/^Run thresholds$/)
    expect(answerRow('Runs with a usable effort')).toHaveTextContent(/^1$/)
    expect(answerRow('Rides with a usable effort')).toBeNull()
    expect(document.body.textContent).not.toMatch(/ride levels|ride power without a meter/)
  })

  it('names the ride estimates for a ride-only library, since the estimated chip needs something to name', () => {
    renderPage(
      makeResult({ runCurve: [], rideCurve: [curvePoint(HEADLINE_DURATION_S, 250, 'ride-1')] }),
      null,
      DATED_SIX_WEEKS,
    )

    expect(answerRow('Estimated')).toHaveTextContent(/^Ride levels and ride power without a meter$/)
    expect(answerRow('Rides with a usable effort')).toHaveTextContent(/^1$/)
    expect(document.body.textContent).not.toMatch(/No run has a usable effort/)
  })

  it('dates the period once, as a Counted over row, so the estimates do not repeat it', () => {
    renderPage(makeResult(CONTRIBUTING), null, DATED_SIX_WEEKS)
    expect(answerRow('Counted over')).toHaveTextContent('12 May – 3 Aug 2025')
    expect(document.body.textContent).not.toMatch(/\(12 May – 3 Aug 2025\)|\(this period\)/)
  })

  it('keeps the dated period behind Details, not as a line under the heading', () => {
    renderPage(makeResult(CONTRIBUTING), null, DATED_SIX_WEEKS)

    expect(answerRow('Counted over')?.closest('details')).not.toBeNull()
  })

  it('sets the page on the method class, which holds its paragraphs to a 68 character measure', () => {
    const { container } = renderPage()

    expect(container.firstElementChild).toHaveClass('page-stack', 'method')
  })

  it('states the dated period as one row, with no period control', () => {
    renderPage(makeResult(CONTRIBUTING), null, DATED_SIX_WEEKS)
    expect(answerRow('Counted over')).toHaveTextContent('12 May – 3 Aug 2025')
    expect(screen.queryByRole('group', { name: 'Period' })).not.toBeInTheDocument()
  })

  it('with no weight, names only the runs, and holds the balance and ride power out of the estimate', () => {
    renderPage(makeResult(CONTRIBUTING), null, DATED_SIX_WEEKS, false)

    expect(answerRow('Runs with a usable effort')).toHaveTextContent(/^1$/)
    expect(answerRow('Rides with a usable effort')).toBeNull()
    expect(answerRow('Estimated')?.textContent).toBe('Run thresholds')
  })

  it('no longer says every number is an estimate', () => {
    const { container } = renderPage()

    expect(container.textContent).not.toMatch(/Every number in the app/)
  })
})

describe('MethodPage sections', () => {
  it('lists the sections in the contents, in page order, and moves focus to the one chosen', () => {
    renderPage(makeResult({ virtualAccuracy: { nSegments: 3, mape: 0.06, bias: 0, segments: [] } }))

    const nav = screen.getByRole('navigation', { name: 'On this page' })
    const names = within(nav)
      .getAllByRole('button')
      .map((button) => button.textContent)
    expect(names).toEqual([
      'Thresholds and race times',
      'Age grades and levels',
      'The energy view',
      'Lifting',
      'Lift age grade',
      'Heart-rate check',
      'Virtual power meter',
      'How this works',
    ])
    // Each entry names a section heading, in the same order down the page.
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(names)

    fireEvent.click(within(nav).getByRole('button', { name: 'Age grades and levels' }))
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { level: 2, name: 'Age grades and levels' }),
    )
  })

  it('gives every section the id its links name, on a heading that takes focus', () => {
    renderPage()

    for (const id of Object.values(SECTION_ID)) {
      const heading = document.getElementById(id)
      expect(heading?.tagName, id).toBe('H2')
      expect(heading).toHaveAttribute('tabindex', '-1')
    }
  })

  it('leads each section with one line, then its facts as a list', () => {
    const { container } = renderPage()

    const sections = Array.from(container.querySelectorAll('section.band'))
    expect(sections.length).toBe(Object.keys(SECTION_ID).length)
    for (const section of sections.filter((node) => !node.classList.contains('how'))) {
      expect(section.querySelector('.method__lead'), section.id).not.toBeNull()
      expect(section.querySelectorAll('.method__facts li').length).toBeGreaterThan(2)
    }
  })

  it('leaves out the virtual power meter when there is no accuracy to show', () => {
    renderPage(makeResult({ virtualAccuracy: null }))

    const nav = screen.getByRole('navigation', { name: 'On this page' })
    expect(within(nav).queryByRole('button', { name: 'Virtual power meter' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Virtual power meter' })).toBeNull()
  })

  it('keeps every heading in order: one h1, then no level skipped', () => {
    const { container } = renderPage(makeResult(CONTRIBUTING))

    const levels = Array.from(container.querySelectorAll('h1, h2, h3, h4')).map((heading) =>
      Number(heading.tagName.slice(1)),
    )
    expect(levels.filter((level) => level === 1)).toHaveLength(1)
    expect(levels[0]).toBe(1)
    levels.forEach((level, index) => {
      if (index > 0) expect(level).toBeLessThanOrEqual(levels[index - 1]! + 1)
    })
  })

  it('opens a request from another page by focusing its section heading, after the page mounts', async () => {
    requestMethodSection(SECTION_ID.thresholds)
    renderPage()

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('heading', { level: 2, name: 'Thresholds and race times' }),
      ),
    )
  })

  it('puts How this works last, in three states', () => {
    renderPage(null)

    const how = screen.getByRole('region', { name: 'How this works' })
    expect(how.nextElementSibling).toBeNull()
    expect(
      within(how)
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual([
      'Calculated by this app',
      'Recorded in your files',
      'Not available from activity files',
    ])
  })
})

describe('MethodPage thresholds and race times', () => {
  it('says what a threshold is, how each sport scales its best, and what the half marathon rests on', () => {
    renderPage()

    const section = screen.getByRole('region', { name: 'Thresholds and race times' })
    expect(section).toHaveTextContent(
      'A threshold is what you could hold for about an hour: a pace for a run, functional threshold power for a ride.',
    )
    expect(section).toHaveTextContent('from 3 min for a ride, or 8 min for a run')
    expect(section).toHaveTextContent('A ride’s threshold from a 20 min best is 95% of it')
    expect(section).toHaveTextContent('Heart rate can raise a ride’s threshold, never lower it.')
    expect(section).toHaveTextContent('Balance’s run row leads with your predicted half marathon')
    expect(section).toHaveTextContent('Riegel’s formula (exponent 1.07)')
    expect(section).toHaveTextContent('a 5.5% spread for the half')
  })
})

describe('MethodPage energy view', () => {
  it('says how both sports reach one scale, with the method’s numbers, with or without files', () => {
    renderPage(null)

    const section = screen.getByRole('region', { name: 'The energy view' })
    expect(section).toHaveTextContent('21.5% gross efficiency')
    expect(section).toHaveTextContent('3.9 J/kg/m (Minetti et al. 2002, plus 0.3)')
    expect(section).toHaveTextContent('in efficiency by about 7% and in running economy by 8%')
  })

  it('says a run-only library needs a ride to compare, with no range', () => {
    const { container } = renderPage(
      makeResult({ runCurve: [curvePoint(HEADLINE_DURATION_S, 4, 'run-1')], rideCurve: [] }),
      null,
      DATED_SIX_WEEKS,
    )

    const section = screen.getByRole('region', { name: 'The energy view' })
    expect(
      within(section).getByText(wholeText('Needs a ride to compare with running.')),
    ).toBeInTheDocument()
    expect(section.textContent).not.toMatch(/cross-check|The 90% range for|range does not/)
    expect(container.querySelector('figure')).toBeNull()
  })

  it('says a ride-only library needs a run to compare', () => {
    renderPage(
      makeResult({ runCurve: [], rideCurve: [curvePoint(HEADLINE_DURATION_S, 250, 'ride-1')] }),
      null,
      DATED_SIX_WEEKS,
    )

    const section = screen.getByRole('region', { name: 'The energy view' })
    expect(
      within(section).getByText(wholeText('Needs a run to compare with cycling.')),
    ).toBeInTheDocument()
    expect(section.textContent).not.toMatch(/cross-check|The 90% range for/)
  })

  it('holds the comparison when a sport has no 20 min effort, with Balance’s reason', () => {
    const metered = makeResult().activities.map((a) =>
      Object.assign({}, a, a.sport === 'ride' ? { powerSource: 'measured' as const } : {}),
    )
    renderPage(
      makeResult({
        activities: metered,
        runCp: null,
        rideCp: null,
        rideThreshold: null,
        runCurve: [curvePoint(300, 4, 'run-1')],
        rideCurve: [curvePoint(300, 250, 'ride-1')],
      }),
      null,
      DATED_SIX_WEEKS,
    )

    const section = screen.getByRole('region', { name: 'The energy view' })
    expect(
      within(section).getByText(
        wholeText('The comparison is held. Your running and cycling have no 20 min effort yet.'),
      ),
    ).toBeInTheDocument()
    expect(section.textContent).not.toMatch(/cross-check|The 90% range for/)
  })

  it('names the climb a ride needs when its rides have no power meter', () => {
    renderPage(
      makeResult({
        runCp: null,
        rideCp: null,
        rideThreshold: null,
        runCurve: [curvePoint(1200, 4, 'run-1')],
        rideCurve: [curvePoint(300, 250, 'ride-1')],
      }),
      null,
      DATED_SIX_WEEKS,
    )

    expect(
      within(screen.getByRole('region', { name: 'The energy view' })).getByText(
        wholeText(
          'The comparison is held. Your rides have no power meter, so a ride compares only on a climb of 3% or steeper that holds for 20 min without a break.',
        ),
      ),
    ).toBeInTheDocument()
  })

  it('names the activities a sport lacks in the period when that is why the comparison is held', () => {
    const activities = [
      makeActivity({ id: 'run-1', sport: 'run' }),
      ...[1, 2, 3].map((n) => makeActivity({ id: `ride-${n}`, sport: 'ride' })),
    ]
    renderPage(makeResult({ activities, ...CONTRIBUTING }), null, DATED_SIX_WEEKS)

    expect(
      within(screen.getByRole('region', { name: 'The energy view' })).getByText(
        wholeText('The comparison is held. Needs 2 more runs in this period.'),
      ),
    ).toBeInTheDocument()
  })

  it('is a cross-check of the age-grade gap when Balance shows one, in grade points there', () => {
    renderPage(GRADED, MAN_BORN_1986)

    const section = screen.getByRole('region', { name: 'The energy view' })
    expect(section).toHaveTextContent('It cross-checks the age-grade gap on Balance')
    expect(section).toHaveTextContent('Balance gives the same range in grade points')
    expect(section.textContent).not.toMatch(/With no age-grade gap/)
  })

  it('is the ratio Balance shows when Balance has no age-grade gap, as when one sport is graded', () => {
    renderPage(makeResult(CONTRIBUTING), MAN_BORN_1986)

    const section = screen.getByRole('region', { name: 'The energy view' })
    expect(section).toHaveTextContent(
      'With no age-grade gap, Balance shows this ratio: running’s energy rate as a percentage of cycling’s.',
    )
    expect(section.textContent).not.toMatch(/cross-checks|grade points/)
  })

  it('states the 90% range once, its basis, and what it leaves out', () => {
    const { container } = renderPage(makeResult(CONTRIBUTING))

    const facts = within(factsOf())
    expect(
      facts.getByText(wholeText('The 90% range for Run against Ride is 5% to 20%.')),
    ).toBeInTheDocument()
    expect(
      facts.getByText(wholeText('Model range based on population assumptions.')),
    ).toBeInTheDocument()
    expect(
      facts.getByText(wholeText('The range does not include every source of error.')),
    ).toBeInTheDocument()
    expect(container.textContent?.match(/every source of error/g)).toHaveLength(1)
  })

  it('says the range was informed by heart rate when the calibrated comparison is used', () => {
    const point = comparisonPoint()
    renderPage(makeResult({ ...CONTRIBUTING, comparison: { prior: [point], calibrated: [point] } }))

    expect(
      within(factsOf()).getByText(
        wholeText('Model range informed by the heart-rate data across all your activities.'),
      ),
    ).toBeInTheDocument()
  })

  it('says when heart rate could not support an adjustment', () => {
    const point = comparisonPoint()
    renderPage(
      makeResult({
        ...CONTRIBUTING,
        comparison: {
          prior: [point],
          calibrated: null,
          calibration: { effectiveSamples: 1, draws: 4000, accepted: false },
        },
      }),
    )

    expect(
      within(factsOf()).getByText(
        wholeText('The heart-rate check could not support a reliable adjustment.'),
      ),
    ).toBeInTheDocument()
  })

  it('shows no range when there is no comparison to check', () => {
    renderPage(makeResult({ comparison: { prior: [], calibrated: null } }))

    const section = screen.getByRole('region', { name: 'The energy view' })
    expect(within(section).queryByText(wholeText(/^The 90% range for/))).not.toBeInTheDocument()
  })
})

describe('MethodPage heart-rate check', () => {
  it('says what heart rate is for, defines the max in place, and states the hard line', () => {
    const { container } = renderPage()

    const section = screen.getByRole('region', { name: 'Heart-rate check' })
    expect(section).toHaveTextContent(
      'Heart rate says whether a best effort was hard. It does not measure fitness.',
    )
    expect(section.querySelector('.definition')).toHaveTextContent('max heart rate')
    expect(section).toHaveTextContent('A best counts as hard at 90% of your max heart rate')
    expect(container.querySelectorAll('.definition')).toHaveLength(1)
  })

  it('says how the max is set, the cycling offset, the age fallback and what cannot be trusted', () => {
    renderPage()

    const section = screen.getByRole('region', { name: 'Heart-rate check' })
    expect(section).toHaveTextContent('several separate days reached in the last three years')
    expect(section).toHaveTextContent('the higher of its own and 6 bpm under running’s')
    expect(section).toHaveTextContent('With under 12 days of heart rate, it is the usual max')
    expect(section).toHaveTextContent('25 bpm over its usual max')
    expect(section).toHaveTextContent(
      'Heart rate is read in 5 min steady blocks, after each activity’s first 10 min.',
    )
  })

  it('names the maxima this library’s best efforts were judged against', () => {
    renderPage(
      makeResult({
        runMaxHeartRate: 188,
        runObservedMaxHeartRate: 188,
        rideMaxHeartRate: 182,
        rideObservedMaxHeartRate: 182,
      }),
    )

    expect(
      screen.getByText(
        wholeText('Best efforts are judged against running 188 bpm and cycling 182 bpm.'),
      ),
    ).toBeInTheDocument()
  })

  it('says both best efforts reached the hard line, and what heart rate cannot tell', () => {
    renderPage(withEffort({ durationS: 1200, runHrFraction: 0.9, rideHrFraction: 0.95 }))

    expect(
      screen.getByText(
        wholeText('Both best efforts reached at least 90% of each sport’s max heart rate.'),
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(wholeText('Heart rate cannot tell a hard 20 min from an all-out one.')),
    ).toBeInTheDocument()
  })

  it('leaves out the hard-efforts fact when either best effort was below 90%', () => {
    renderPage(withEffort({ durationS: 1200, runHrFraction: 0.7, rideHrFraction: 0.95 }))

    expect(
      screen.queryByText(wholeText(/Both best efforts reached at least 90%/)),
    ).not.toBeInTheDocument()
  })
})

describe('MethodPage virtual power meter', () => {
  it('says how its watts are made and checked, and how many climbs the accuracy rests on', () => {
    renderPage()

    const section = screen.getByRole('region', { name: 'Virtual power meter' })
    expect(section).toHaveTextContent('Rides without a power meter get estimated watts on climbs')
    expect(section).toHaveTextContent('estimated watts count 40% as much as measured ones')
    expect(
      within(section).getByText(
        wholeText('On 3 climbs, estimated power was within 6% of your power meter on average.'),
      ),
    ).toBeInTheDocument()
  })

  it('uses the singular for one climb', () => {
    renderPage(makeResult({ virtualAccuracy: { nSegments: 1, mape: 0.06, bias: 0, segments: [] } }))

    expect(
      screen.getByText(
        wholeText('On 1 climb, estimated power was within 6% of your power meter on average.'),
      ),
    ).toBeInTheDocument()
  })

  it('keeps the section but leaves out the sentence when no climb was scored', () => {
    renderPage(makeResult({ virtualAccuracy: { nSegments: 0, mape: 0, bias: 0, segments: [] } }))

    expect(screen.getByRole('region', { name: 'Virtual power meter' })).toBeInTheDocument()
    expect(screen.queryByText(wholeText(/estimated power was within/))).not.toBeInTheDocument()
  })
})

describe('MethodPage copy', () => {
  it('writes durations one way: min for minutes, s for seconds', () => {
    const { container } = renderPage()
    const text = container.textContent ?? ''

    expect(text).not.toMatch(/\bminutes\b|\bseconds\b/)
    expect(text).toMatch(/\b5 min\b/)
  })

  it('spells British throughout', () => {
    const { container } = renderPage()

    expect(container.textContent).not.toMatch(/\b(analyze|centered|summarizes|color|kilometer)\w*/i)
  })

  it('never uses the words the app avoids, a hedge or an em dash', () => {
    const { container } = renderPage(makeResult(CONTRIBUTING))

    expect(container.textContent).not.toMatch(
      /\b(ahead|limiter|weak|weakness|strength|quietly|because|caused)\b/i,
    )
    expect(container.textContent).not.toMatch(/holding you back|important to note|may be|might/i)
    expect(container.textContent).not.toContain('—')
  })

  it('does not put one sentence on the page twice', () => {
    const { container } = renderPage(makeResult(CONTRIBUTING), MAN_BORN_1986)

    const sentences = Array.from(container.querySelectorAll('p, li, h2, h3, dt'))
      .filter((node) => !node.closest('nav'))
      .flatMap((node) => {
        const lines = Array.from(node.querySelectorAll(':scope > .method__line'))
        return lines.length > 0 ? lines.map((line) => line.textContent) : [node.textContent]
      })
      .map((text) => text?.trim() ?? '')
      .filter((text) => text.length > 0)
    expect(sentences.length).toBeGreaterThan(80)
    expect(new Set(sentences).size).toBe(sentences.length)
  })
})

describe('MethodPage without a weight', () => {
  it('asks for the weight once, in the energy view, in the one prompt Balance uses', () => {
    const { container } = renderPage(makeResult(CONTRIBUTING), null, DATED_SIX_WEEKS, false)

    const links = screen.getAllByRole('link', { name: 'Profile' })
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', '#/profile')
    expect(links[0]?.closest('p')).toHaveTextContent(
      'Waits for your weight, as Balance does. Add your weight on Profile to grade your rides and compare them with your runs.',
    )
    expect(container.textContent?.match(/Add your weight on Profile/g)).toHaveLength(1)
    expect(screen.getByRole('region', { name: 'The energy view' }).contains(links[0] ?? null)).toBe(
      true,
    )
  })

  it('holds the energy view: the method reads, with no range and no cross-check', () => {
    renderPage(makeResult(CONTRIBUTING), null, DATED_SIX_WEEKS, false)

    const section = screen.getByRole('region', { name: 'The energy view' })
    expect(section.textContent).not.toMatch(/The 90% range for|cross-check/)
    expect(section).toHaveTextContent('21.5% gross efficiency')
  })

  it('says a one-run library needs a ride to compare, and asks for no weight', () => {
    renderPage(
      makeResult({
        runCurve: [curvePoint(HEADLINE_DURATION_S, 4, 'run-1')],
        virtualAccuracy: null,
      }),
      null,
      DATED_SIX_WEEKS,
      false,
    )

    expect(
      within(screen.getByRole('region', { name: 'The energy view' })).getByText(
        wholeText('Needs a ride to compare with running.'),
      ),
    ).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/[Ww]aits for your weight/)
    expect(screen.queryByRole('link', { name: 'Profile' })).toBeNull()
  })

  it('gives the heart-rate check its reference and hard-efforts facts with no weight', () => {
    renderPage(
      withEffort(
        { durationS: 1200, runHrFraction: 0.9, rideHrFraction: 0.95 },
        {
          hr: hrFixture,
          runMaxHeartRate: 188,
          runObservedMaxHeartRate: 188,
          rideMaxHeartRate: 182,
          rideObservedMaxHeartRate: 182,
        },
      ),
      null,
      DATED_SIX_WEEKS,
      false,
    )

    const section = screen.getByRole('region', { name: 'Heart-rate check' })
    expect(
      within(section).getByText(wholeText(/Best efforts are judged against running 188 bpm/)),
    ).toBeInTheDocument()
    expect(
      within(section).getByText(wholeText(/Both best efforts reached at least 90%/)),
    ).toBeInTheDocument()
  })

  it('with no weight, takes the sex from a run grade only, never from a ride grade on the placeholder', () => {
    renderPage(
      makeResult({
        runThreshold: null,
        rideCurve: [curvePoint(HEADLINE_DURATION_S, 250, 'ride-1')],
        equivalents: [makeEquivalence({ durationS: HEADLINE_DURATION_S })],
      }),
      MAN_BORN_1986,
      DATED_SIX_WEEKS,
      false,
    )

    expect(screen.queryByText(wholeText(/^Your grades are for a man\./))).toBeNull()
  })

  it('with a weight, takes the sex from a ride grade when only a ride is graded', () => {
    renderPage(
      makeResult({
        runThreshold: null,
        rideCurve: [curvePoint(HEADLINE_DURATION_S, 250, 'ride-1')],
        equivalents: [makeEquivalence({ durationS: HEADLINE_DURATION_S })],
      }),
      MAN_BORN_1986,
      DATED_SIX_WEEKS,
      true,
    )

    expect(screen.getByText(wholeText(/^Your grades are for a man\./))).toBeInTheDocument()
  })

  it('keeps the run grades: the age grading still names the sex when a run is graded', () => {
    renderPage(
      makeResult({ runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')] }),
      MAN_BORN_1986,
      DATED_SIX_WEEKS,
      false,
    )

    const section = screen.getByRole('region', { name: 'Age grades and levels' })
    expect(within(section).getByText(wholeText(/^Your grades are for a man\./))).toBeInTheDocument()
  })

  it('holds the virtual power check: no accuracy sentence, but the method still reads', () => {
    renderPage(makeResult(), null, DATED_SIX_WEEKS, false)

    const section = screen.getByRole('region', { name: 'Virtual power meter' })
    expect(within(section).queryByText(wholeText(/estimated power was within/))).toBeNull()
    expect(section).toHaveTextContent('Rides without a power meter get estimated watts')
    expect(
      within(section).getByText(wholeText('Waits for your weight, as the energy view does.')),
    ).toBeInTheDocument()
  })

  it('shows the energy range once the weight is known, with no prompt', () => {
    renderPage(
      makeResult({
        ...CONTRIBUTING,
        runCurve: runCurveFixture,
        rideMetabolicCurve: rideMetabolicCurveFixture,
        rideCurve: rideCurveFixture,
      }),
      null,
      DATED_SIX_WEEKS,
      true,
    )

    const section = screen.getByRole('region', { name: 'The energy view' })
    expect(
      within(section).getByText(wholeText(/^The 90% range for Run against Ride/)),
    ).toBeInTheDocument()
    expect(within(section).queryByText(wholeText(/Add your weight on Profile/))).toBeNull()
  })
})

describe('MethodPage without a result', () => {
  it('shows every section’s method, with no period line', () => {
    renderPage(null)

    expect(screen.getByRole('heading', { level: 1, name: 'Method' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Thresholds and race times' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Lifting' })).toBeInTheDocument()
    expect(answerLine()).toHaveTextContent('Thresholds, ride levels and the balance are estimates.')
    expect(document.body.textContent).not.toMatch(/\(last 6 weeks\)|\(all time\)|estimates from \d/)
  })

  it('says once, in the energy view, that the files bring the figures', () => {
    const { container } = renderPage(null)

    expect(container.querySelector('figure')).toBeNull()
    expect(
      within(screen.getByRole('region', { name: 'The energy view' })).getByText(
        wholeText('Add your files to see your own figures here.'),
      ),
    ).toBeInTheDocument()
    expect(
      screen.getAllByText(wholeText('Add your files to see your own figures here.')),
    ).toHaveLength(1)
  })

  it('says saved results are loading once while a kept library restores', () => {
    renderPage(null, null, DATED_SIX_WEEKS, true, true)

    expect(screen.getAllByText(wholeText('Your saved results are loading.'))).toHaveLength(1)
    expect(screen.queryByText(wholeText('Add your files to see your own figures here.'))).toBeNull()
  })

  it('keeps the virtual power meter in the contents, with no results too', () => {
    renderPage(null)

    const nav = screen.getByRole('navigation', { name: 'On this page' })
    expect(within(nav).getByRole('button', { name: 'Virtual power meter' })).toBeInTheDocument()
  })
})

describe('MethodPage with a ride at the top of the age tables', () => {
  const rideSpeed = (speedMs: number) =>
    makeResult({
      ...CONTRIBUTING,
      equivalents: [
        makeEquivalence({
          durationS: HEADLINE_DURATION_S,
          runSpeed: { p05: speedMs, p50: speedMs, p95: speedMs },
        }),
      ],
    })

  it('states no balance, as Balance does not, while an ordinary ride gets one', () => {
    renderPage(rideSpeed(4), MAN_BORN_1986)
    expect(answerRow('Range crosses level')).not.toBeNull()
    cleanup()
    // 9 m/s over 20 min is faster than the running record for a man of 40.
    renderPage(rideSpeed(9), MAN_BORN_1986)
    expect(answerRow('Range crosses level')).toBeNull()
  })
})
