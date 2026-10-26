// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { AthleteSettings } from '@rca/core/types'
import type { Period } from '@rca/core/period'
import type { TrendPoint } from '@rca/core/digest'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import { ROAD_STANDARDS_SOURCE } from '@rca/core/grade'
import { SPORT_LABEL, SPORT_ORDER } from '../sports'
import { flatSpeedToMetabolic } from '@rca/core/metabolic'
import { analysisStub } from '../../test/analysisStub'
import type { AnalysisStubOverrides } from '../../test/analysisStub'
import { curvePoint } from '../charts/fixtures'
import {
  FIVE_K_IN_20_MIN_WKG,
  MAN_BORN_1986,
  makeActivity,
  makeEquivalence,
  makeResult,
} from '../components/fixtures'
import type { AgeGap, AgeProfile } from '../grades'
import { BalancePage } from './BalancePage'

vi.mock('../../share/download', () => ({
  canShareImage: vi.fn(() => false),
  canvasFile: vi.fn(
    async (_canvas: HTMLCanvasElement, name: string) =>
      new File(['png'], name, { type: 'image/png' }),
  ),
  previewUrl: vi.fn(() => 'blob:preview'),
  releasePreview: vi.fn(),
  saveFile: vi.fn(() => 'saved' as const),
  shareFile: vi.fn(async () => 'shared' as const),
}))
vi.mock('../../share/renderCard', () => ({
  loadCardFonts: vi.fn(async () => undefined),
  renderShareCard: vi.fn(() => true),
}))
import { renderShareCard } from '../../share/renderCard'
import { canvasFile } from '../../share/download'

afterEach(() => {
  vi.useRealTimers()
  cleanup()
  vi.clearAllMocks()
})

/** A fixed day, so the latest-activity line never depends on when the suite runs. */
function pinClock() {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 0, 20, 12))
}

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }

/** A six-week period from 12 May to 3 August 2025, dated in the viewer's zone. */
const DATED_SIX_WEEKS: Period = {
  choice: 42,
  startMs: new Date(2025, 4, 12, 12).getTime(),
  endMs: new Date(2025, 7, 3, 12).getTime(),
  days: 42,
  fellBack: false,
}

const PROFILE_PROMPT = 'Add your year of birth and sex'

function renderPage(
  result: AnalysisResult = makeResult(),
  overrides: AnalysisStubOverrides = {},
  profile: AgeProfile | null = null,
  weightKnown = true,
  missingAge: AgeGap | null = profile === null ? 'year of birth and sex' : null,
) {
  return render(
    <BalancePage
      analysis={analysisStub(overrides)}
      result={result}
      settings={SETTINGS}
      units="metric"
      profile={profile}
      missingAge={missingAge}
      controls={<span>Period picker</span>}
      weightKnown={weightKnown}
      onShowAll={vi.fn()}
    />,
  )
}

/** Lets the share preview's drawing finish, so a redraw that would follow has happened. */
function settle() {
  return act(() => new Promise<void>((resolve) => setTimeout(resolve, 50)))
}

/** A run with a best 20-minute effort at 5 km, so the run has a grade to show. */
const GRADED_RUN = makeResult({
  runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
})

/** A run and a ride, both graded, so the balance meter and the grade strip both show. */
const BOTH_SPORTS = makeResult({
  runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
  rideCurve: [curvePoint(HEADLINE_DURATION_S, 400, 'ride-1')],
  equivalents: [makeEquivalence()],
})

/** Weeks with a run and a ride, each rode with a running equivalent, so the grade trend has both. */
function trendWithRides(weeks: number): TrendPoint[] {
  return Array.from({ length: weeks }, (_, index) => {
    const endMs = new Date(2026, 0, 4 + index * 7, 23, 59).getTime()
    return {
      endMs,
      runWkg: flatSpeedToMetabolic(4),
      rideWkg: flatSpeedToMetabolic(4.2),
      runCount: 1,
      rideCount: 1,
      runAtMs: endMs,
      rideAtMs: endMs,
      rideRunSpeed: { p05: 3.9, p50: 4.2, p95: 4.5 },
    }
  })
}

/** Two weeks with a running value: the fitness trend is shown only from two. */
function trendWithWeeks(weeks: number): TrendPoint[] {
  return Array.from({ length: weeks }, (_, index) => {
    const endMs = new Date(2026, 0, 4 + index * 7, 23, 59).getTime()
    return {
      endMs,
      runWkg: 3.4,
      rideWkg: null,
      runCount: 1,
      rideCount: 0,
      runAtMs: endMs,
      rideAtMs: null,
      rideRunSpeed: null,
    }
  })
}

describe('BalancePage', () => {
  it('opens on the answer, with the period control under it and no eyebrow above', () => {
    renderPage()

    expect(screen.queryByText('Your balance')).not.toBeInTheDocument()
    const heading = screen.getByRole('heading', {
      level: 1,
      name: 'Your balance leans toward running',
    })
    expect(heading).toHaveAttribute('id', 'page-heading')
    // The heading comes first in reading order, so the control follows the answer it changes.
    const picker = screen.getByText('Period picker')
    expect(heading.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('keeps the comparison slots out when one sport has nothing in the period', () => {
    pinClock()
    const run = makeActivity({ id: 'run-1', sport: 'run' })
    renderPage(makeResult({ activities: [run] }), { state: { library: [run] } })

    expect(screen.queryByText('Your bike on foot')).not.toBeInTheDocument()
    expect(screen.queryByText('Evidence gap')).not.toBeInTheDocument()
    expect(screen.queryByText('Built on real efforts')).not.toBeInTheDocument()
    expect(screen.queryByText('No heart-rate check')).not.toBeInTheDocument()
  })

  it('offers an empty sport the file chooser as a secondary button, with the count in All time', () => {
    pinClock()
    const run = makeActivity({ id: 'run-1', sport: 'run' })
    const ride = makeActivity({ id: 'ride-1', sport: 'ride' })
    renderPage(makeResult({ activities: [run] }), {
      state: { library: [run, ride], period: DATED_SIX_WEEKS },
    })

    const card = screen.getByRole('region', { name: 'Ride' })
    expect(
      within(card).getByText(
        'No rides between 12 May and 3 Aug 2025. You have 1 ride in All time.',
      ),
    ).toBeInTheDocument()
    const add = within(card).getByRole('button', { name: 'Add rides' })
    expect(add).toHaveClass('btn')
    expect(add).not.toHaveClass('btn-primary')
    expect(within(card).queryByRole('link')).not.toBeInTheDocument()
  })

  it('shows one Add rides button on a one-sport Balance, from the empty ride card', () => {
    pinClock()
    const run = makeActivity({ id: 'run-1', sport: 'run' })
    // No prior comparison, so the answer is in its missing branch, where a second file chooser would show.
    renderPage(makeResult({ activities: [run], comparison: { prior: [], calibrated: null } }), {
      state: { library: [run] },
    })

    expect(screen.getAllByRole('button', { name: 'Add rides' })).toHaveLength(1)
  })

  it('tells a sport with no files at all that its files have none, and asks for them', () => {
    pinClock()
    const run = makeActivity({ id: 'run-1', sport: 'run' })
    renderPage(makeResult({ activities: [run] }), { state: { library: [run] } })

    const card = screen.getByRole('region', { name: 'Ride' })
    expect(
      within(card).getByText('Your files have no rides yet. Add rides to see your records.'),
    ).toBeInTheDocument()
  })

  it('puts both grades under the meter on a phone, hidden from assistive technology', () => {
    renderPage(GRADED_RUN, {}, MAN_BORN_1986)

    const strip = document.querySelector('.balance-strip')
    expect(strip).toHaveAttribute('aria-hidden', 'true')
    expect(strip?.textContent).toMatch(/^Run \d+% \w+$/)
  })

  it('leaves the sample chip off the answer, since the banner above every page says so once', () => {
    renderPage(makeResult(), { state: { isSample: true } })
    expect(screen.queryByText('Sample athlete')).not.toBeInTheDocument()
  })

  it('shows a card for each sport, named by the sport', () => {
    renderPage()
    expect(screen.getByRole('region', { name: 'Run' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Ride' })).toBeInTheDocument()
  })

  it('lays the cards out in the sport order, so the first sport is on the left, as on the meter', () => {
    renderPage()
    const [left, right] = screen.getAllByRole('region', { name: /^(Run|Ride)$/ })
    expect(left).toHaveAccessibleName(SPORT_LABEL[SPORT_ORDER[0]])
    expect(right).toHaveAccessibleName(SPORT_LABEL[SPORT_ORDER[1]])
  })

  it('shows the evidence for the duration the answer is about', () => {
    renderPage(
      makeResult({ effort: [{ durationS: 1200, runHrFraction: 0.95, rideHrFraction: 0.8 }] }),
    )
    expect(
      screen.getByRole('region', { name: 'Your ride number could be higher' }),
    ).toBeInTheDocument()
  })

  it('shows no heart-rate card with no comparison while the files have heart rate', () => {
    renderPage(
      makeResult({
        comparison: { prior: [], calibrated: null },
        effort: [],
        maxHeartRate: 170,
      }),
    )
    expect(screen.queryByText('No heart-rate check')).not.toBeInTheDocument()
    expect(screen.queryByText('Add heart rate to sharpen this')).not.toBeInTheDocument()
  })

  it('asks for heart rate with no comparison when the files have none', () => {
    renderPage(
      makeResult({
        comparison: { prior: [], calibrated: null },
        effort: [],
        maxHeartRate: null,
      }),
    )
    expect(
      screen.getByRole('region', { name: 'Add heart rate to sharpen this' }),
    ).toBeInTheDocument()
  })

  it('shows the bike on foot in the cross-sport card, which opens to every duration', () => {
    renderPage(makeResult({ equivalents: [makeEquivalence()] }))

    const card = screen.getByRole('region', { name: 'On foot, your ride is worth 4:10\u00a0/km' })
    expect(within(card).getByText('See the pace curve')).toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: 'Your ride on foot, at every duration' }),
    ).not.toBeInTheDocument()
  })

  it('names the trend section by the chart’s own title, so the section and the chart cannot drift apart', () => {
    renderPage(makeResult(), { state: { trend: trendWithWeeks(2) } })
    const figure = screen.getByRole('figure', { name: /of your best 20 min, trailing/ })
    const title = figure.querySelector('.chart-frame__title')?.textContent ?? ''
    expect(title).not.toBe('')
    expect(screen.getByRole('region', { name: title })).toBeInTheDocument()
  })

  it('shows the fitness trend once a week has a value, and says so in a line when there is only one', () => {
    const { unmount } = renderPage(makeResult(), { state: { trend: trendWithWeeks(0) } })
    expect(
      screen.queryByRole('region', { name: /of your best 20 min, trailing/ }),
    ).not.toBeInTheDocument()
    unmount()

    renderPage(makeResult(), { state: { trend: trendWithWeeks(1) } })
    expect(
      screen.getByRole('region', { name: /of your best 20 min, trailing/ }),
    ).toBeInTheDocument()
    expect(screen.getByText(/^Only one week has a value: Run /)).toBeInTheDocument()
    expect(
      screen.getByRole('figure', { name: /^Energy rate of your best 20 min, trailing/ }),
    ).toBeInTheDocument()
  })

  it('keeps the trend heading for screen readers only, so the chart title is the one visible name', () => {
    renderPage(makeResult(), { state: { trend: trendWithWeeks(2) } })
    const heading = screen.getByRole('heading', { name: /of your best 20 min, trailing/ })
    expect(heading).toHaveClass('sr-only')
  })

  it('puts the grading source directly under the cards, ahead of the trend', () => {
    renderPage(GRADED_RUN, { state: { trend: trendWithWeeks(2) } }, MAN_BORN_1986)
    const source = screen.getByText(/^Graded for a/)
    const trend = screen.getByRole('region', { name: /of your best 20 min, trailing/ })
    expect(source.compareDocumentPosition(trend) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('names only the missing field, in the prompt and on its button', () => {
    renderPage(makeResult(), {}, null, true, 'sex')
    expect(screen.getByText('The balance in points and levels needs your sex.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add your sex' })).toHaveAttribute('href', '#/profile')
    expect(screen.queryByRole('link', { name: PROFILE_PROMPT })).not.toBeInTheDocument()
  })

  it('keeps the grade strip in the meter’s group, so it takes the meter’s gap', () => {
    const { container } = renderPage(BOTH_SPORTS, {}, MAN_BORN_1986)
    const group = container.querySelector('.balance-hero__meter')
    expect(group).not.toBeNull()
    expect(group?.querySelector('.balance-meter')).not.toBeNull()
    expect(group?.querySelector('.balance-strip')).not.toBeNull()
  })

  it('shows one energy trend for both sports while the age or sex is unknown', () => {
    renderPage(makeResult(), { state: { trend: trendWithWeeks(2) } })
    const section = screen.getByRole('region', { name: /of your best 20 min, trailing/ })
    expect(
      within(section).getByRole('figure', {
        name: 'Energy rate of your best 20 min, trailing 6 weeks',
      }),
    ).toBeInTheDocument()
    // Only running has a value, so the key has nothing to tell apart.
    expect(within(section).queryByRole('list', { name: 'Legend' })).toBeNull()
  })

  it('holds cycling on the age-grade trend while no weight is entered, and draws it when one is', () => {
    const trend = trendWithRides(3)
    const held = renderPage(makeResult(), { state: { trend } }, MAN_BORN_1986, false)
    expect(held.container.querySelector('[data-testid="trend-line"][data-sport="ride"]')).toBeNull()
    expect(held.container.querySelector('[data-testid="trend-ring"]')).toBeNull()
    expect(held.container.querySelector('[data-testid="trend-band"]')).toBeNull()
    const heldSection = screen.getByRole('region', { name: /of your best 20 min, trailing/ })
    expect(within(heldSection).queryByText('Ride, estimated')).toBeNull()
    expect(within(heldSection).queryByText('Cycling grade, estimated')).toBeNull()
    expect(
      within(heldSection).getByText(/Cycling is held until a weight is added/),
    ).toBeInTheDocument()
    held.unmount()

    const known = renderPage(makeResult(), { state: { trend } }, MAN_BORN_1986, true)
    expect(
      known.container.querySelector('[data-testid="trend-line"][data-sport="ride"]'),
    ).not.toBeNull()
    expect(known.container.querySelector('[data-testid="trend-band"]')).not.toBeNull()
    const section = screen.getByRole('region', { name: /of your best 20 min, trailing/ })
    expect(within(section).getByText('Ride, estimated')).toBeInTheDocument()
  })

  it('gates the grade trend on each effort’s date, not on the Sunday that ends its week', () => {
    // Born in 2021: the athlete is 4 in December 2025, which the standards do not cover, and 5 by the
    // weeks that end in January 2026, which they do. The best efforts are the December ones.
    const effortMs = new Date(2025, 11, 28, 12).getTime()
    const trend: TrendPoint[] = [4, 11].map((day) => ({
      endMs: new Date(2026, 0, day, 23, 59).getTime(),
      runWkg: flatSpeedToMetabolic(4),
      rideWkg: null,
      runCount: 1,
      rideCount: 0,
      runAtMs: effortMs,
      rideAtMs: null,
      rideRunSpeed: null,
    }))
    renderPage(makeResult(), { state: { trend } }, { birthYear: 2021, sex: 'male' })
    const section = screen.getByRole('region', { name: /of your best 20 min, trailing/ })
    expect(within(section).getByText('Age grades cover ages 5 to 100.')).toBeInTheDocument()
    expect(within(section).queryByText(/Add runs or rides/)).toBeNull()
  })

  it('says which ages the grades cover when every week’s age falls outside them', () => {
    // Born in 1900, the athlete is 125 in 2025: no age standard covers that.
    const running = trendWithWeeks(2).map((week) =>
      Object.assign(week, { runWkg: flatSpeedToMetabolic(4) }),
    )
    renderPage(makeResult(), { state: { trend: running } }, { birthYear: 1900, sex: 'male' })
    const section = screen.getByRole('region', { name: /of your best 20 min, trailing/ })
    expect(within(section).getByText('Age grades cover ages 5 to 100.')).toBeInTheDocument()
    expect(within(section).queryByText(/Add runs or rides in more than one week/)).toBeNull()
  })

  it('shows the age-grade trend for both sports on one scale once the age and sex are known', () => {
    // A run at 4 m/s (4:10 /km) is a grade; the fixture's 3.4 W/kg is a walk, with no standard.
    const running = trendWithWeeks(2).map((week) =>
      Object.assign(week, { runWkg: flatSpeedToMetabolic(4) }),
    )
    renderPage(makeResult(), { state: { trend: running } }, MAN_BORN_1986)
    const section = screen.getByRole('region', { name: /of your best 20 min, trailing/ })
    expect(
      within(section).getByRole('figure', {
        name: 'Age grade of your best 20 min, trailing 6 weeks',
      }),
    ).toBeInTheDocument()
    expect(within(section).getByText(/^Each point grades your best 20 min in/)).toBeInTheDocument()
  })

  it('links to the method page once, from the evidence card, whatever the card says to do', () => {
    renderPage()
    const links = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href') === '#/method')
    expect(links).toHaveLength(1)
  })

  it('offers the share image while the analysis is idle', () => {
    renderPage()
    expect(screen.getByRole('button', { name: 'Share image' })).toBeEnabled()
  })

  it('holds the share image until the analysis finishes, without a note that moves the answer', () => {
    renderPage(makeResult(), { busy: true })

    const share = screen.getByRole('button', { name: 'Share image' })
    expect(share).toHaveAttribute('aria-disabled', 'true')
    expect(screen.queryByText('Available when the analysis finishes.')).not.toBeInTheDocument()
  })

  it('offers no image when there is neither a comparison nor a sport estimate to draw', () => {
    renderPage(
      makeResult({ comparison: { prior: [], calibrated: null }, runCp: null, rideCp: null }),
    )
    expect(screen.queryByRole('button', { name: 'Share image' })).not.toBeInTheDocument()
  })
})

describe('BalancePage age grades', () => {
  it('shows the run’s estimate on its card, at the age on its date', () => {
    renderPage(GRADED_RUN, {}, MAN_BORN_1986)

    const grade = screen.getByRole('region', { name: 'Run' }).querySelector('.age-grade__line')
    expect(grade).toHaveTextContent(/^Local · 67% · on your best 20 min/)
  })

  it('drops the standards line from each card, since the source line under the cards names it', () => {
    renderPage(GRADED_RUN, {}, MAN_BORN_1986)
    expect(screen.queryByText(/^Graded at age/)).not.toBeInTheDocument()
    expect(screen.getByText(/^Graded for a \d+-year-old man/)).toBeInTheDocument()
  })

  it('asks once, on this page, for the year of birth and sex, and not on each card', () => {
    renderPage(GRADED_RUN)

    const prompts = screen.getAllByRole('link', { name: PROFILE_PROMPT })
    expect(prompts).toHaveLength(1)
    expect(prompts[0]).toHaveAttribute('href', '#/profile')
  })

  it('does not ask for the profile once it has the year of birth and sex', () => {
    renderPage(GRADED_RUN, {}, MAN_BORN_1986)
    expect(screen.queryByRole('link', { name: PROFILE_PROMPT })).not.toBeInTheDocument()
  })

  it('names each sport’s age when the run and the ride were graded in different years', () => {
    const result = makeResult({
      ...BOTH_SPORTS,
      activities: [
        makeActivity({ id: 'run-1', sport: 'run', startMs: Date.UTC(2024, 2, 10, 7, 30) }),
        makeActivity({ id: 'ride-1', sport: 'ride', startMs: Date.UTC(2025, 8, 2, 7, 30) }),
      ],
    })
    renderPage(result, {}, MAN_BORN_1986)

    expect(
      screen.getByText(
        /^Graded for a man aged 38 on runs and 39 on rides, on the USATF road standards\./,
      ),
    ).toBeInTheDocument()
  })

  it('says the age, the sex and the standard on one line, without repeating the credit', () => {
    renderPage(GRADED_RUN, {}, MAN_BORN_1986)

    const source = screen.getByText(
      /^Graded for a \d+-year-old man on the USATF road standards\. A level, not a ranking\.$/,
    )
    expect(source).toBeInTheDocument()
    expect(screen.queryByText(/Alan Jones/)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: ROAD_STANDARDS_SOURCE.name })).not.toBeInTheDocument()
  })

  it('says rides are graded through their running equivalent only when a ride grade is shown', () => {
    const { unmount } = renderPage(GRADED_RUN, {}, MAN_BORN_1986)
    expect(screen.queryByText(/Rides are graded through/)).not.toBeInTheDocument()
    unmount()

    renderPage(
      makeResult({
        equivalents: [makeEquivalence()],
        rideCurve: [curvePoint(HEADLINE_DURATION_S, 400, 'ride-1')],
      }),
      {},
      MAN_BORN_1986,
    )
    expect(
      screen.getByText(/Rides are graded through their running equivalent/),
    ).toBeInTheDocument()
  })

  it('holds the cross-sport idea without a weight, with the same prompt as the cards', () => {
    renderPage(makeResult({ equivalents: [makeEquivalence()] }), {}, null, false)
    expect(screen.getByRole('heading', { level: 2, name: 'Your ride on foot' })).toBeInTheDocument()
    expect(screen.queryByText(/4:10/)).not.toBeInTheDocument()
  })

  it('names no ride grade and no standards line without a weight, though the ride is graded', () => {
    renderPage(
      makeResult({
        equivalents: [makeEquivalence()],
        rideCurve: [curvePoint(HEADLINE_DURATION_S, 400, 'ride-1')],
      }),
      {},
      MAN_BORN_1986,
      false,
    )
    // The ride's grade is held with its card, so nothing graded is on screen to cite a standard for.
    expect(screen.queryByText(/^Graded for a/)).not.toBeInTheDocument()
    expect(
      screen.queryByText(/Rides are graded through their running equivalent/),
    ).not.toBeInTheDocument()
  })

  it('shows the standards line only when a grade is shown', () => {
    const { unmount } = renderPage(makeResult(), {}, MAN_BORN_1986)
    expect(screen.queryByText(/^Graded for a/)).not.toBeInTheDocument()
    unmount()

    renderPage(
      makeResult({
        equivalents: [makeEquivalence()],
        rideCurve: [curvePoint(HEADLINE_DURATION_S, 400, 'ride-1')],
      }),
      {},
      MAN_BORN_1986,
    )
    expect(screen.getByText(/^Graded for a/)).toBeInTheDocument()
  })

  it('shows no standards line without the year of birth and sex', () => {
    renderPage(GRADED_RUN)
    expect(screen.queryByText(/^Graded on the/)).not.toBeInTheDocument()
  })
})

describe('BalancePage with no weight entered', () => {
  it('holds the balance and the ride figures, and links each prompt for the weight to Profile', () => {
    renderPage(makeResult(), {}, null, false)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Your balance waits for your weight' }),
    ).toBeInTheDocument()
    const prompts = screen.getAllByRole('link', { name: 'Profile' })
    expect(prompts.length).toBeGreaterThanOrEqual(1)
    for (const prompt of prompts) expect(prompt).toHaveAttribute('href', '#/profile')
    expect(screen.getByRole('region', { name: 'Ride' })).toHaveTextContent(
      'Add your weight on Profile to see ride figures.',
    )
  })

  it('shows the balance, and no prompt for the weight, once a weight is entered', () => {
    renderPage(makeResult(), {}, null, true)
    expect(screen.queryByText(/waits for your weight/)).not.toBeInTheDocument()
  })

  it('carries the ride grade on the share card once a weight is entered, and holds it while none is', async () => {
    const withRide = makeResult({
      equivalents: [makeEquivalence()],
      rideCurve: [curvePoint(HEADLINE_DURATION_S, 400, 'ride-1')],
    })
    renderPage(withRide, {}, MAN_BORN_1986, true)
    fireEvent.click(screen.getByRole('button', { name: 'Share image' }))
    await waitFor(() => expect(renderShareCard).toHaveBeenCalled())
    const card = vi.mocked(renderShareCard).mock.calls.at(-1)?.[0]
    expect(card?.heroes[1]?.grade).toMatch(/^[A-Za-z]+ · \d+% on best 20 min$/)
    cleanup()

    renderPage(withRide, {}, MAN_BORN_1986, false)
    expect(screen.queryByRole('button', { name: 'Share image' })).not.toBeInTheDocument()
  })

  it('draws the share preview once while the page renders again with the same analysis', async () => {
    const analysis = analysisStub({})
    const result = makeResult({
      equivalents: [makeEquivalence()],
      rideCurve: [curvePoint(HEADLINE_DURATION_S, 400, 'ride-1')],
    })
    const page = () => (
      <BalancePage
        analysis={analysis}
        result={result}
        settings={SETTINGS}
        units="metric"
        profile={MAN_BORN_1986}
        missingAge={null}
        controls={<span>Period picker</span>}
        weightKnown
        onShowAll={vi.fn()}
      />
    )
    const { rerender } = render(page())
    fireEvent.click(screen.getByRole('button', { name: 'Share image' }))
    await screen.findByRole('img', { name: 'Preview of the square card' })
    await settle()
    const drawn = vi.mocked(canvasFile).mock.calls.length
    rerender(page())
    await settle()
    expect(vi.mocked(canvasFile).mock.calls.length).toBe(drawn)
  })

  it('offers no share image while no weight is entered, so no ride figure or balance is shared', () => {
    renderPage(makeResult(), {}, null, false)
    expect(screen.queryByRole('button', { name: 'Share image' })).not.toBeInTheDocument()
    expect(renderShareCard).not.toHaveBeenCalled()
  })
})
