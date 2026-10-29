// @vitest-environment jsdom
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
} from '../charts/fixtures'
import {
  FIVE_K_IN_20_MIN_WKG,
  MAN_BORN_1986,
  comparisonPoint,
  makeActivity,
  makeEquivalence,
  makeResult,
} from '../components/fixtures'
import type { AgeProfile } from '../grades'
import { MethodPage } from './MethodPage'
import { requestMethodSection } from '../components/methodSection'
import { TWENTY_MINUTE_ID } from './TwentyMinuteEffort'

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
  const list = screen.getByText(/^Run against Ride, 90% range/).closest('ul')
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
      units="metric"
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

/** The evidence disclosure for one section of the page, found by its summary's words. */
function disclosureFor(section: string): HTMLDetailsElement {
  const disclosure = Array.from(
    document.querySelectorAll<HTMLDetailsElement>('details.method__evidence'),
  ).find((details) => details.querySelector('summary')?.textContent?.includes(section))
  if (!disclosure) throw new Error(`No evidence disclosure for ${section}`)
  return disclosure
}

/** Opens one evidence disclosure as a reader does, and waits for its chart to mount. */
async function openEvidence(disclosure: HTMLDetailsElement): Promise<void> {
  fireEvent.click(disclosure.querySelector('summary')!)
  await waitFor(() => expect(disclosure).toHaveAttribute('open'))
  await waitFor(() => expect(disclosure.querySelector('figure')).not.toBeNull())
}

/** Opens every evidence disclosure, so their charts are in the page for the copy checks. */
async function openAllEvidence(container: HTMLElement): Promise<void> {
  for (const disclosure of Array.from(
    container.querySelectorAll<HTMLDetailsElement>('details.method__evidence'),
  )) {
    await openEvidence(disclosure)
  }
}

describe('MethodPage answer', () => {
  it('is the page heading, with a link back to Balance', () => {
    renderPage()

    expect(screen.getByRole('heading', { level: 1, name: 'How sure is this?' })).toHaveAttribute(
      'id',
      'page-heading',
    )
    expect(screen.getByRole('link', { name: 'Back to Balance' })).toHaveAttribute('href', '#/')
  })

  it('opens with three lines: what is recorded, the balance verdict, and how far to trust it', () => {
    renderPage(makeResult(CONTRIBUTING))

    const lines = within(screen.getByRole('list', { name: 'The short answer' })).getAllByRole(
      'listitem',
    )
    expect(lines).toHaveLength(3)
    expect(lines[0]).toHaveTextContent(
      'Running efforts, and ride power from a power meter, are recorded.',
    )
    expect(lines[1]).toHaveTextContent(
      'Thresholds, ride levels, the balance and ride power without a meter are estimates from 1 run and 1 ride with a usable effort.',
    )
    expect(lines[2]).toHaveTextContent('These checks show how far to trust them.')
  })

  it('states the lean the comparison gives, with even outside its range, in the second line', () => {
    // The fixture's ratio puts running 5% to 20% ahead, so the range never reaches even: the balance
    // leans toward running. A reversed lean would read toward cycling and fail here.
    renderPage(makeResult(CONTRIBUTING))

    const line = within(screen.getByRole('list', { name: 'The short answer' })).getAllByRole(
      'listitem',
    )[1]
    expect(line).toHaveTextContent('Your balance leans toward running. Even is outside its range.')
    expect(line).not.toHaveTextContent('leans toward cycling')
  })

  it('says the balance waits for the weight, and keeps the run estimate on its own', () => {
    renderPage(makeResult(CONTRIBUTING), null, DATED_SIX_WEEKS, false)

    const line = within(screen.getByRole('list', { name: 'The short answer' })).getAllByRole(
      'listitem',
    )[1]
    expect(line).toHaveTextContent('Your balance waits for your weight.')
  })

  it('names each chip by its word and where it goes, and moves focus there', () => {
    renderPage(makeResult(CONTRIBUTING))
    const answer = within(screen.getByRole('list', { name: 'The short answer' }))

    // A run's grade is read as recorded, and a ride's as an estimate, both in the same section.
    fireEvent.click(answer.getByRole('button', { name: 'Recorded: see Age grades and levels' }))
    expect(screen.getByRole('heading', { name: 'Age grades and levels' })).toHaveFocus()
    fireEvent.click(answer.getByRole('button', { name: 'Estimated: see Age grades and levels' }))
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

    expect(
      screen.getByText(/estimates from 2 runs and 1 ride with a usable effort/),
    ).toBeInTheDocument()
  })

  it('says no run has a usable effort when none sets one, rather than counting the files', () => {
    renderPage(makeResult({ runCurve: [], rideCurve: [] }))

    expect(screen.getByText('No run has a usable effort yet.')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/estimates from 0 runs/)
  })

  it('says no run has a usable effort when the weight is not known either', () => {
    renderPage(makeResult({ runCurve: [], rideCurve: [] }), null, DATED_SIX_WEEKS, false)

    expect(screen.getByText('No run has a usable effort yet.')).toBeInTheDocument()
  })

  it('names only the run estimate for a run-only library, even with the weight known', () => {
    renderPage(
      makeResult({ runCurve: [curvePoint(HEADLINE_DURATION_S, 4, 'run-1')], rideCurve: [] }),
      null,
      DATED_SIX_WEEKS,
    )

    expect(
      screen.getByText('Run thresholds are estimates from 1 run with a usable effort.'),
    ).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/ride levels|ride power without a meter/)
  })

  it('names the ride estimates for a ride-only library, since the estimated chip needs something to name', () => {
    renderPage(
      makeResult({ runCurve: [], rideCurve: [curvePoint(HEADLINE_DURATION_S, 250, 'ride-1')] }),
      null,
      DATED_SIX_WEEKS,
    )

    expect(
      screen.getByText(
        'Ride levels and ride power without a meter are estimates from 1 ride with a usable effort.',
      ),
    ).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/No run has a usable effort/)
  })

  it('dates the period once, in Counted over, so the estimates line does not repeat it', () => {
    renderPage(makeResult(CONTRIBUTING), null, DATED_SIX_WEEKS)
    expect(screen.getByText('Counted over 12 May – 3 Aug 2025.')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/\(12 May – 3 Aug 2025\)|\(this period\)/)
  })

  it('sets the dated period in the page head, beside the heading', () => {
    renderPage(makeResult(CONTRIBUTING), null, DATED_SIX_WEEKS)

    expect(
      screen.getByText('Counted over 12 May – 3 Aug 2025.').closest('.page-head'),
    ).not.toBeNull()
  })

  it('sets the page on the method class, which holds its paragraphs to a 68 character measure', () => {
    const { container } = renderPage()

    expect(container.firstElementChild).toHaveClass('page-stack', 'method')
  })

  it('states the dated period on one line, with no period control', () => {
    renderPage(makeResult(CONTRIBUTING), null, DATED_SIX_WEEKS)
    expect(screen.getByText('Counted over 12 May – 3 Aug 2025.')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Period' })).not.toBeInTheDocument()
  })

  it('with no weight, names only the runs, and holds the balance and ride power out of the estimate', () => {
    renderPage(makeResult(CONTRIBUTING), null, DATED_SIX_WEEKS, false)

    const line = screen.getByText(/estimates from 1 run with a usable effort/)
    expect(line).toHaveTextContent('Run thresholds are estimates from 1 run with a usable effort.')
    expect(line.textContent).not.toMatch(/balance|ride power|ride|levels/)
  })

  it('no longer says every number is an estimate', () => {
    const { container } = renderPage()

    expect(container.textContent).not.toMatch(/Every number in the app/)
  })
})

describe('MethodPage what is calculated', () => {
  it('lists what the app shows in three states, under one heading in the contents', () => {
    renderPage(null)

    const section = screen.getByRole('region', { name: 'What is calculated' })
    expect(
      within(section)
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual([
      'Calculated by this app',
      'Read from your files',
      'Not available from activity files',
    ])
    const unavailable = screen.getByRole('region', { name: 'Not available from activity files' })
    expect(within(unavailable).getByText('Readiness and recovery scores')).toBeInTheDocument()
    expect(within(unavailable).getByText('Vendor tests such as 4DP')).toBeInTheDocument()
    const calculated = screen.getByRole('region', { name: 'Calculated by this app' })
    expect(within(calculated).getByText('Race predictions')).toBeInTheDocument()
    expect(within(calculated).getByText('Heart-rate set-aside')).toBeInTheDocument()
  })

  it('moves focus to the section from the contents', () => {
    renderPage(null)

    const nav = screen.getByRole('navigation', { name: 'On this page' })
    fireEvent.click(within(nav).getByRole('button', { name: 'What is calculated' }))
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { level: 2, name: 'What is calculated' }),
    )
  })

  it('sits before How this works, with the results or without them', () => {
    renderPage(makeResult())

    const section = screen.getByRole('region', { name: 'What is calculated' })
    const how = screen.getByRole('region', { name: 'How this works and what it assumes' })
    expect(section.compareDocumentPosition(how) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('MethodPage contents', () => {
  it('lists the sections on the page, and moves focus to the one chosen', async () => {
    renderPage(makeResult({ virtualAccuracy: { nSegments: 3, mape: 0.06, bias: 0, segments: [] } }))

    const nav = screen.getByRole('navigation', { name: 'On this page' })
    expect(
      within(nav)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual([
      'The energy view',
      'Age grades and levels',
      'Heart-rate check',
      'Virtual power meter accuracy',
      'What is calculated',
      'How this works and what it assumes',
    ])

    fireEvent.click(within(nav).getByRole('button', { name: 'Age grades and levels' }))
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { level: 2, name: 'Age grades and levels' }),
    )
  })

  it('leaves out the accuracy entry when there is no virtual power accuracy', () => {
    renderPage(makeResult({ virtualAccuracy: null }))

    const nav = screen.getByRole('navigation', { name: 'On this page' })
    expect(within(nav).queryByRole('button', { name: 'Virtual power meter accuracy' })).toBeNull()
  })

  it('keeps every heading in order: one h1, then no level skipped', async () => {
    const { container } = renderPage(makeResult(CONTRIBUTING))
    await openAllEvidence(container)

    const levels = Array.from(container.querySelectorAll('h1, h2, h3, h4')).map((heading) =>
      Number(heading.tagName.slice(1)),
    )
    expect(levels.filter((level) => level === 1)).toHaveLength(1)
    expect(levels[0]).toBe(1)
    levels.forEach((level, index) => {
      if (index > 0) expect(level).toBeLessThanOrEqual(levels[index - 1]! + 1)
    })
  })

  it('opens an age-grading request by focusing its section heading, after the page mounts', async () => {
    requestMethodSection('method-grades')
    renderPage()

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('heading', { level: 2, name: 'Age grades and levels' }),
      ),
    )
  })
})

describe('MethodPage energy view', () => {
  it('says a run-only library needs a ride to compare, with no ratio, facts or evidence', () => {
    const { container } = renderPage(
      makeResult({ runCurve: [curvePoint(HEADLINE_DURATION_S, 4, 'run-1')], rideCurve: [] }),
      null,
      DATED_SIX_WEEKS,
    )

    const section = screen.getByRole('region', { name: 'The energy view' })
    expect(within(section).getByText('Needs a ride to compare with running.')).toBeInTheDocument()
    expect(section.textContent).not.toMatch(
      /energy ratio|cross-check|90% model range|range does not/,
    )
    expect(section.querySelector('details.method__evidence')).toBeNull()
    expect(container.querySelector('figure')).toBeNull()
  })

  it('holds the comparison when a sport has no 20 min effort or threshold, with no ratio chart or fallback copy', () => {
    const short = [curvePoint(300, 4, 'run-1')]
    const { container } = renderPage(
      makeResult({
        runCp: null,
        rideCp: null,
        runCurve: short,
        rideCurve: [curvePoint(300, 250, 'ride-1')],
      }),
      null,
      DATED_SIX_WEEKS,
    )

    const section = screen.getByRole('region', { name: 'The energy view' })
    expect(
      within(section).getByText(
        'The comparison is held until there is an effort of 20 min or more in each sport.',
      ),
    ).toBeInTheDocument()
    expect(section.textContent).not.toMatch(/this view is that ratio|cross-check|90% model range/)
    expect(screen.queryByText(/^Run against Ride, 90% range/)).not.toBeInTheDocument()
    expect(section.querySelector('details.method__evidence')).toBeNull()
    expect(container.querySelector('figure')).toBeNull()
  })

  it('says a ride-only library needs a run to compare, with no ratio, facts or evidence', () => {
    const { container } = renderPage(
      makeResult({ runCurve: [], rideCurve: [curvePoint(HEADLINE_DURATION_S, 250, 'ride-1')] }),
      null,
      DATED_SIX_WEEKS,
    )

    const section = screen.getByRole('region', { name: 'The energy view' })
    expect(within(section).getByText('Needs a run to compare with cycling.')).toBeInTheDocument()
    expect(section.textContent).not.toMatch(
      /energy ratio|cross-check|90% model range|range does not/,
    )
    expect(section.querySelector('details.method__evidence')).toBeNull()
    expect(container.querySelector('figure')).toBeNull()
  })

  it('is a cross-check of the age-grade gap when Balance shows one', () => {
    renderPage(GRADED, MAN_BORN_1986)

    const section = screen.getByRole('region', { name: 'The energy view' })
    expect(
      within(section).getByText(
        'The energy view is a cross-check of the age-grade gap on Balance. Near even, the energy check can lean the other way from the age-grade gap.',
      ),
    ).toBeInTheDocument()
    expect(section.textContent).not.toMatch(/energy ratio/)
  })

  it('falls back to the energy ratio, in neutral words, when Balance has no age-grade gap', () => {
    renderPage(makeResult(CONTRIBUTING), null)

    const section = screen.getByRole('region', { name: 'The energy view' })
    expect(section.textContent).not.toMatch(/cross-check of the age-grade gap/)
    expect(
      within(section).getByText(
        'When Balance has no age-grade gap to show, it shows the energy ratio instead: running’s energy rate as a percentage of cycling’s. This view is that ratio.',
      ),
    ).toBeInTheDocument()
  })

  it('falls back when only one sport is graded', () => {
    renderPage(makeResult({ ...CONTRIBUTING, runCurve: CONTRIBUTING.runCurve }), MAN_BORN_1986)

    expect(screen.getByRole('region', { name: 'The energy view' }).textContent).not.toMatch(
      /cross-check of the age-grade gap/,
    )
  })

  it('states the 90% range, the basis and what the range leaves out', () => {
    renderPage(makeResult(CONTRIBUTING))

    const facts = within(factsOf())
    expect(facts.getByText('Run against Ride, 90% range: 5% to 20%.')).toBeInTheDocument()
    expect(facts.getByText('Model range based on population assumptions.')).toBeInTheDocument()
    expect(facts.getByText('The range does not include every source of error.')).toBeInTheDocument()
  })

  it('reuses the headline range text rather than writing its own', () => {
    renderPage(makeResult(CONTRIBUTING))

    expect(screen.getAllByText(/^Run against Ride, 90% range/)).toHaveLength(1)
  })

  it('says the range was adjusted when the heart-rate comparison is used', () => {
    const point = comparisonPoint()
    renderPage(makeResult({ ...CONTRIBUTING, comparison: { prior: [point], calibrated: [point] } }))

    expect(
      within(factsOf()).getByText(
        'Model range adjusted using the heart-rate data across all your activities.',
      ),
    ).toBeInTheDocument()
  })

  it('says the heart-rate check could not support an adjustment, and shows the population range', () => {
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
        'The heart-rate check could not support a reliable adjustment; showing the population-based model range.',
      ),
    ).toBeInTheDocument()
  })

  it('names the heart-rate maxima the best efforts were judged against', () => {
    renderPage(
      makeResult({
        runMaxHeartRate: 188,
        runObservedMaxHeartRate: 188,
        rideMaxHeartRate: 182,
        rideObservedMaxHeartRate: 182,
      }),
    )

    expect(
      screen.getByText('Best efforts are judged against running 188 bpm; cycling 182 bpm.'),
    ).toBeInTheDocument()
  })

  it('says both best efforts were hard, but not that either was your hardest', () => {
    renderPage(withEffort({ durationS: 1200, runHrFraction: 0.9, rideHrFraction: 0.95 }))

    expect(
      screen.getByText(
        'Both best efforts reached at least 90% of each sport’s reference heart rate. That makes them hard, but does not prove either was your hardest.',
      ),
    ).toBeInTheDocument()
  })

  it('leaves out the hard-efforts fact when either best effort was below 90%', () => {
    renderPage(withEffort({ durationS: 1200, runHrFraction: 0.7, rideHrFraction: 0.95 }))

    expect(screen.queryByText(/does not prove either was your hardest/)).not.toBeInTheDocument()
  })

  it('shows no facts when there is no comparison to check', () => {
    renderPage(makeResult({ comparison: { prior: [], calibrated: null } }))

    const section = screen.getByRole('region', { name: 'The energy view' })
    expect(within(section).queryByRole('list')).not.toBeInTheDocument()
    expect(within(section).queryByText(/90% range/)).not.toBeInTheDocument()
  })

  it('defines the 90% range once, and what the range leaves out once', async () => {
    const { container } = renderPage(
      makeResult({
        runCurve: runCurveFixture,
        rideMetabolicCurve: rideMetabolicCurveFixture,
        rideCurve: rideCurveFixture,
      }),
    )
    await openAllEvidence(container)
    const text = container.textContent ?? ''

    expect(text.match(/The 90% range is the spread the model gives/g)).toHaveLength(1)
    expect(text.match(/does not include every source of error/g)).toHaveLength(1)
    // Paraphrases of the same limit are caught too: the sentence is named once, the rest refer back.
    expect(
      text.match(/every source of|sensor error|error in virtual power|other errors/g),
    ).toHaveLength(1)
  })

  it('keeps the explanation of how the energy rate is worked out in a More detail disclosure', () => {
    renderPage()

    const section = screen.getByRole('region', { name: 'The energy view' })
    const detail = section.querySelector('details.methodology__detail')
    expect(detail).toHaveTextContent('Gross efficiency averages about 21.5%.')
    expect(detail).toHaveTextContent('Minetti et al. (2002)')
  })
})

describe('MethodPage evidence disclosures', () => {
  it('starts every disclosure closed, and mounts its chart only once it is opened', async () => {
    const { container } = renderPage(
      makeResult({
        runCurve: runCurveFixture,
        rideMetabolicCurve: rideMetabolicCurveFixture,
        rideCurve: rideCurveFixture,
      }),
    )

    const disclosures = Array.from(container.querySelectorAll('details.method__evidence'))
    expect(disclosures).toHaveLength(3)
    for (const disclosure of disclosures) {
      expect(disclosure).not.toHaveAttribute('open')
    }
    expect(
      screen.queryByRole('figure', { name: /^Run compared with Ride by duration$/ }),
    ).toBeNull()

    const energy = disclosureFor('energy view')
    await openEvidence(energy)
    expect(
      within(energy).getByRole('figure', { name: 'Run compared with Ride by duration' }),
    ).toBeInTheDocument()
    expect(
      within(energy).getByRole('figure', {
        name: 'Run and Ride energy rate (metabolic W/kg) by duration',
      }),
    ).toBeInTheDocument()
  })

  it('names its summary by the action it takes: Show while closed, and Hide while open', async () => {
    renderPage(makeResult(CONTRIBUTING))

    const energy = disclosureFor('energy view')
    expect(energy.querySelector('summary')).toHaveTextContent(
      'Show the evidence for the energy view',
    )
    await openEvidence(energy)
    expect(energy.querySelector('summary')).toHaveTextContent(
      'Hide the evidence for the energy view',
    )
    fireEvent.click(energy.querySelector('summary')!)
    await waitFor(() => expect(energy).not.toHaveAttribute('open'))
    expect(energy.querySelector('summary')).toHaveTextContent(
      'Show the evidence for the energy view',
    )
  })

  it('does not repeat the chart title in the energy disclosure', async () => {
    renderPage(makeResult(CONTRIBUTING))
    await openEvidence(disclosureFor('energy view'))

    expect(disclosureFor('energy view')).not.toHaveTextContent('Each line shows one sport')
    expect(disclosureFor('energy view')).toHaveTextContent(
      'The app shows each sport in its own units everywhere else.',
    )
  })

  it('keeps the heart-rate and power-accuracy charts behind their own disclosures', async () => {
    const { container } = renderPage()

    expect(screen.queryByRole('figure', { name: 'Heart rate against energy rate' })).toBeNull()
    await openEvidence(disclosureFor('heart-rate check'))
    expect(
      within(disclosureFor('heart-rate check')).getByRole('figure', {
        name: 'Heart rate against energy rate',
      }),
    ).toBeInTheDocument()
    await openEvidence(disclosureFor('virtual power meter'))
    expect(
      within(disclosureFor('virtual power meter')).getByRole('figure', {
        name: 'Estimated against measured power on climbs',
      }),
    ).toBeInTheDocument()
    expect(container.querySelectorAll('details.method__evidence[open]')).toHaveLength(2)
  })
})

describe('MethodPage heart-rate check', () => {
  it('explains the 20 minute effort under the heart-rate check, where the evidence card links', () => {
    renderPage()

    const section = screen.getByRole('region', { name: 'Heart-rate check' })
    const heading = within(section).getByRole('heading', { level: 3, name: 'The 20 min effort' })
    expect(heading).toHaveAttribute('id', TWENTY_MINUTE_ID)
    expect(
      within(section).getByText(/^Balance uses your best 20 min in each sport\./),
    ).toBeInTheDocument()
  })

  it('shows the heart-rate check, and its reading note once the evidence is open', async () => {
    renderPage()

    const section = screen.getByRole('region', { name: 'Heart-rate check' })
    expect(within(section).queryByText(/Each dot is a 5 min block/)).toBeNull()
    await openEvidence(disclosureFor('heart-rate check'))
    expect(
      within(section).getByText(
        'Each dot is a 5 min block of steady effort from this period’s files, taken after the first 10 min of each activity. The two lines show how fast heart rate rises with energy rate in each sport.',
      ),
    ).toBeInTheDocument()
  })

  it('says what the heart-rate check does and does not do, in plain words first', () => {
    renderPage()

    const section = screen.getByRole('region', { name: 'Heart-rate check' })
    expect(
      within(section).getByText(
        'Heart rate is used to check the model, not to measure fitness. If the data support an adjustment, the range is adjusted to match; if they do not, the population range is kept.',
      ),
    ).toBeInTheDocument()
  })

  it('has the reason for the cycling offset behind More detail', () => {
    renderPage()

    const section = screen.getByRole('region', { name: 'Heart-rate check' })
    expect(section.querySelector('details.methodology__detail')).toHaveTextContent(
      'A cycling maximum usually runs 5 to 7 bpm lower',
    )
  })
})

describe('MethodPage virtual power meter', () => {
  it('says how many climbs the virtual power accuracy rests on', () => {
    renderPage()

    const section = screen.getByRole('region', { name: 'Virtual power meter accuracy' })
    expect(
      within(section).getByText(
        'On 3 climbs, estimated power was within 6% of your power meter on average.',
      ),
    ).toBeInTheDocument()
  })

  it('says rides without a power meter get an estimate, not a price', () => {
    const { container } = renderPage()

    expect(container.textContent).toMatch(/Rides without a power meter get an estimated power/)
    expect(container.textContent).not.toMatch(/priced/)
  })

  it('uses the singular for one climb', () => {
    renderPage(makeResult({ virtualAccuracy: { nSegments: 1, mape: 0.06, bias: 0, segments: [] } }))

    expect(
      screen.getByText('On 1 climb, estimated power was within 6% of your power meter on average.'),
    ).toBeInTheDocument()
  })

  it('keeps the accuracy section but leaves out the sentence when no climb was scored', () => {
    renderPage(makeResult({ virtualAccuracy: { nSegments: 0, mape: 0, bias: 0, segments: [] } }))

    expect(screen.getByRole('region', { name: 'Virtual power meter accuracy' })).toBeInTheDocument()
    expect(screen.queryByText(/estimated power was within/)).not.toBeInTheDocument()
  })

  it('omits the accuracy section when there is no virtual power accuracy', () => {
    renderPage(makeResult({ virtualAccuracy: null }))

    expect(
      screen.queryByRole('region', { name: 'Virtual power meter accuracy' }),
    ).not.toBeInTheDocument()
  })
})

describe('MethodPage age grading', () => {
  it('puts the age grading method on the page, and the grade it is for when one shows', () => {
    const graded = makeResult({
      runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
    })
    renderPage(graded, MAN_BORN_1986)

    const section = screen.getByRole('region', { name: 'Age grades and levels' })
    expect(within(section).getByText('Your grades are for a man.')).toBeInTheDocument()
  })
})

describe('MethodPage how this works', () => {
  it('ends with the methodology, its topics shown at once with no disclosure, each topic once', () => {
    renderPage()

    const section = screen.getByRole('region', { name: 'How this works and what it assumes' })
    expect(section.querySelector('details.methodology__disclosure')).toBeNull()
    expect(within(section).queryByText('Show the assumptions')).toBeNull()
    expect(
      within(section).getByRole('heading', { level: 3, name: 'Best 20 min, week by week' }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { name: 'Heart-rate check' })).toHaveLength(1)
    expect(screen.getAllByRole('heading', { name: 'Virtual power meter accuracy' })).toHaveLength(1)
    expect(
      within(section)
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual([
      'Best 20 min, week by week',
      'Dated settings and zones',
      'Data checks',
      'Where speed comes from',
      'Limits',
    ])
  })
})

describe('MethodPage copy', () => {
  it('writes durations one way: min for minutes, s for seconds, and the unit in full for days', async () => {
    const { container } = renderPage()
    await openAllEvidence(container)
    const text = container.textContent ?? ''

    expect(text).not.toMatch(/\bminutes\b|\bseconds\b/)
    expect(text).toMatch(/\b5 min\b/)
    expect(text).toMatch(/\b10 s either side\b/)
    expect(text).toMatch(/\b30 s\b/)
    expect(text).toMatch(/\b42 days\b/)
  })

  it('spells British throughout', async () => {
    const { container } = renderPage()
    await openAllEvidence(container)

    expect(container.textContent).not.toMatch(/\b(analyze|centered|summarizes|color|kilometer)\w*/i)
  })

  it('never calls the balance or a level weak, a limiter, ahead or a strength', async () => {
    const { container } = renderPage(makeResult(CONTRIBUTING))
    await openAllEvidence(container)

    expect(container.textContent).not.toMatch(
      /\b(ahead|ahead of|limiter|weak|weakness|strength)\b/i,
    )
    expect(container.textContent).not.toMatch(/holding you back/i)
  })

  it('does not say the median of the model draws, or any model draws', async () => {
    const { container } = renderPage()
    await openAllEvidence(container)

    expect(container.textContent).not.toMatch(/model draws|draws/)
  })

  it('says each conversion once: the energy rate is defined in the unit topic, not in the energy view', async () => {
    const { container } = renderPage(makeResult(CONTRIBUTING), MAN_BORN_1986)
    await openAllEvidence(container)
    const text = container.textContent ?? ''

    expect(text.match(/the energy each sport costs per kilogram/g)).toHaveLength(1)
    expect(text).not.toMatch(/running and cycling on one scale: the energy rate/)
  })

  it('does not put one sentence on the page twice', async () => {
    const { container } = renderPage(makeResult(CONTRIBUTING), MAN_BORN_1986)
    await openAllEvidence(container)

    // The contents list repeats the section headings on purpose, and each chart repeats its own
    // keyboard hint, so the prose outside the charts and the contents is what must not repeat.
    const sentences = Array.from(container.querySelectorAll('p, li, h2, h3'))
      .filter((node) => !node.closest('nav, figure'))
      .map((node) => node.textContent?.trim() ?? '')
      .filter((text) => text.length > 0)
    expect(new Set(sentences).size).toBe(sentences.length)
  })
})

describe('MethodPage without a weight', () => {
  it('asks for the weight once, in the one prompt Balance uses, linked to Profile', () => {
    const { container } = renderPage(makeResult(CONTRIBUTING), null, DATED_SIX_WEEKS, false)

    const links = screen.getAllByRole('link', { name: 'Profile' })
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', '#/profile')
    expect(links[0]?.closest('p')).toHaveTextContent(
      'Add your weight on Profile to compare a ride with a run.',
    )
    expect(container.textContent?.match(/Add your weight on Profile/g)).toHaveLength(1)
    expect(
      screen.getByRole('region', { name: 'Heart-rate check' }).contains(links[0] ?? null),
    ).toBe(true)
  })

  it('holds the energy view: no ratio, no energy-rate chart, no energy facts and no sentence about them', () => {
    const { container } = renderPage(
      makeResult({
        ...CONTRIBUTING,
        runCurve: runCurveFixture,
        rideMetabolicCurve: rideMetabolicCurveFixture,
        rideCurve: rideCurveFixture,
      }),
      null,
      DATED_SIX_WEEKS,
      false,
    )

    const section = screen.getByRole('region', { name: 'The energy view' })
    expect(section.querySelector('details.method__evidence')).toBeNull()
    expect(within(section).queryByRole('list')).toBeNull()
    expect(section.textContent).not.toMatch(/90% range|cross-check|energy ratio|energy rate by/)
    expect(within(section).getByText('Waits for your weight, as Balance does.')).toBeInTheDocument()
    expect(within(section).queryByRole('link', { name: 'Profile' })).toBeNull()
    expect(container.querySelector('figure')).not.toBeInTheDocument()
  })

  it('says a one-run library needs a ride to compare, and asks for no weight', () => {
    // A library with no ride has no virtual power accuracy either, since the check rests on rides.
    renderPage(
      makeResult({
        runCurve: [curvePoint(HEADLINE_DURATION_S, 4, 'run-1')],
        virtualAccuracy: null,
      }),
      null,
      DATED_SIX_WEEKS,
      false,
    )

    const section = screen.getByRole('region', { name: 'The energy view' })
    expect(within(section).getByText('Needs a ride to compare with running.')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/[Ww]aits for your weight/)
    expect(screen.queryByRole('link', { name: 'Profile' })).toBeNull()
  })

  it('draws only the run blocks of the heart-rate check, with its reference and hard-efforts facts', async () => {
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
      within(section).getByText(/Best efforts are judged against running 188 bpm/),
    ).toBeInTheDocument()
    expect(within(section).getByText(/does not prove either was your hardest/)).toBeInTheDocument()
    // The reference heart rate is defined in one sentence, where the heart-rate check is explained.
    expect(
      within(section).getByText(
        /Your reference heart rate is set from your highest sustained heart rates.*6 bpm below running/,
      ),
    ).toBeInTheDocument()

    const disclosure = disclosureFor('heart-rate check')
    await openEvidence(disclosure)
    const chart = within(disclosure).getByRole('figure', { name: 'Heart rate against energy rate' })
    const dots = within(chart).getAllByTestId('hr-dot')
    expect(dots).toHaveLength(3)
    expect(dots.every((dot) => dot.getAttribute('data-sport') === 'run')).toBe(true)
    expect(disclosure).toHaveTextContent(
      'The line shows how fast heart rate rises with energy rate in running.',
    )
  })

  it('with no weight, takes the sex from a run grade only, never from a ride grade on the placeholder', () => {
    renderPage(
      makeResult({
        rideCurve: [curvePoint(HEADLINE_DURATION_S, 250, 'ride-1')],
        equivalents: [makeEquivalence({ durationS: HEADLINE_DURATION_S })],
      }),
      MAN_BORN_1986,
      DATED_SIX_WEEKS,
      false,
    )

    expect(screen.queryByText('Your grades are for a man.')).toBeNull()
  })

  it('with a weight, takes the sex from a ride grade when only a ride is graded', () => {
    renderPage(
      makeResult({
        rideCurve: [curvePoint(HEADLINE_DURATION_S, 250, 'ride-1')],
        equivalents: [makeEquivalence({ durationS: HEADLINE_DURATION_S })],
      }),
      MAN_BORN_1986,
      DATED_SIX_WEEKS,
      true,
    )

    expect(screen.getByText('Your grades are for a man.')).toBeInTheDocument()
  })

  it('keeps the run grades: the age grading still names the sex when a run is graded', () => {
    renderPage(
      makeResult({ runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')] }),
      MAN_BORN_1986,
      DATED_SIX_WEEKS,
      false,
    )

    const section = screen.getByRole('region', { name: 'Age grades and levels' })
    expect(within(section).getByText('Your grades are for a man.')).toBeInTheDocument()
  })

  it('holds the virtual power check: no estimate sentence and no chart, but the method still reads', () => {
    renderPage(makeResult(), null, DATED_SIX_WEEKS, false)

    const section = screen.getByRole('region', { name: 'Virtual power meter accuracy' })
    expect(within(section).queryByText(/estimated power was within/)).toBeNull()
    expect(section.querySelector('details.method__evidence')).toBeNull()
    expect(
      within(section).getByText(/Rides without a power meter get an estimated power/),
    ).toBeInTheDocument()
    expect(
      within(section).getByText('Waits for your weight, as the energy view does.'),
    ).toBeInTheDocument()
  })

  it('shows the energy view, its charts and its facts once the weight is known', async () => {
    const { container } = renderPage(
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
    expect(within(section).getByText(/^Run against Ride, 90% range/)).toBeInTheDocument()
    expect(within(section).queryByText(/Add your weight on Profile/)).toBeNull()
    expect(container.querySelector('details.method__evidence')).not.toBeNull()
  })
})

describe('MethodPage links back', () => {
  it('links back to Balance, the page the method answers', () => {
    renderPage()
    expect(screen.getByRole('link', { name: 'Back to Balance' })).toHaveAttribute('href', '#/')
  })
})

describe('MethodPage without a result', () => {
  it('shows the method, the age grades and the topics, with no period line', () => {
    renderPage(null)

    expect(screen.getByRole('heading', { level: 1, name: 'How sure is this?' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Age grades and levels' })).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: 'How this works and what it assumes' }),
    ).toBeInTheDocument()
    const energy = screen.getByRole('region', { name: 'The energy view' })
    expect(energy).toHaveTextContent(
      'Once your files are loaded, this view puts running and cycling on one scale',
    )
    expect(energy).not.toHaveTextContent('This view is that ratio')
    const lines = within(screen.getByRole('list', { name: 'The short answer' })).getAllByRole(
      'listitem',
    )
    expect(lines[1]).toHaveTextContent('Thresholds, ride levels and the balance are estimates.')
    expect(document.body.textContent).not.toMatch(/\(last 6 weeks\)|\(all time\)|estimates from \d/)
  })

  it('shows one plain line under the energy view, where the charts would be, and no chart', () => {
    const { container } = renderPage(null)

    expect(container.querySelector('details.method__evidence')).toBeNull()
    expect(container.querySelector('figure')).toBeNull()
    expect(screen.getAllByText('Add your files to see this evidence.')).toHaveLength(1)
    expect(
      within(screen.getByRole('region', { name: 'The energy view' })).getByText(
        'Add your files to see this evidence.',
      ),
    ).toBeInTheDocument()
  })

  it('says saved results are loading once, under the energy view, while a kept library restores', () => {
    renderPage(null, null, DATED_SIX_WEEKS, true, true)

    expect(screen.getAllByText('Your saved results are loading.')).toHaveLength(1)
    expect(screen.queryByText('Add your files to see this evidence.')).toBeNull()
  })

  it('has no Back to Balance link, which would only show the landing page', () => {
    renderPage(null)

    expect(screen.queryByRole('link', { name: /Back to Balance/ })).toBeNull()
  })

  it('keeps the accuracy entry in the contents, with no results too', () => {
    renderPage(null)

    const nav = screen.getByRole('navigation', { name: 'On this page' })
    expect(
      within(nav).getByRole('button', { name: 'Virtual power meter accuracy' }),
    ).toBeInTheDocument()
  })
})
