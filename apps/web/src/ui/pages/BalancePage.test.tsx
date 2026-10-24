// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { AthleteSettings } from '@rca/core/types'
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
  makeEquivalence,
  makeResult,
} from '../components/fixtures'
import type { AgeProfile } from '../grades'
import { BalancePage } from './BalancePage'

vi.mock('../../share/download', () => ({ saveCanvasPng: vi.fn(async () => true) }))
vi.mock('../../share/renderCard', () => ({
  loadCardFonts: vi.fn(async () => undefined),
  renderShareCard: vi.fn(() => true),
}))
import { renderShareCard } from '../../share/renderCard'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }

const PROFILE_PROMPT =
  'Add your year of birth and sex on your profile to see the balance in points and levels.'

function renderPage(
  result: AnalysisResult = makeResult(),
  overrides: AnalysisStubOverrides = {},
  profile: AgeProfile | null = null,
  weightKnown = true,
) {
  return render(
    <BalancePage
      analysis={analysisStub(overrides)}
      result={result}
      settings={SETTINGS}
      units="metric"
      profile={profile}
      controls={<span>Period picker</span>}
      weightKnown={weightKnown}
    />,
  )
}

/** A run with a best 20-minute effort at 5 km, so the run has a grade to show. */
const GRADED_RUN = makeResult({
  runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
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
  it('opens on the answer, with the period control beside the eyebrow', () => {
    renderPage()

    expect(screen.getByText('Your balance')).toBeInTheDocument()
    expect(screen.getByText('Period picker')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Your balance leans toward running',
      }),
    ).toHaveAttribute('id', 'page-heading')
  })

  it('marks the sample athlete only when the sample is on screen', () => {
    const { unmount } = renderPage(makeResult(), { state: { isSample: true } })
    expect(screen.getByText('Sample athlete')).toBeInTheDocument()
    unmount()

    renderPage()
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
    expect(screen.getByRole('region', { name: 'Your ride number may be low' })).toBeInTheDocument()
  })

  it('shows the bike on foot in the cross-sport card, which opens to every duration', () => {
    renderPage(makeResult({ equivalents: [makeEquivalence()] }))

    const card = screen.getByRole('region', { name: 'On foot, your bike is worth 4:10 /km' })
    expect(within(card).getByText('See every duration')).toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: 'Your bike on foot, at every duration' }),
    ).not.toBeInTheDocument()
  })

  it('shows the fitness trend only once two weeks have a value', () => {
    const { unmount } = renderPage(makeResult(), { state: { trend: trendWithWeeks(1) } })
    expect(screen.queryByRole('heading', { name: 'Fitness over time' })).not.toBeInTheDocument()
    unmount()

    renderPage(makeResult(), { state: { trend: trendWithWeeks(2) } })
    expect(screen.getByRole('heading', { name: 'Fitness over time' })).toBeInTheDocument()
  })

  it('shows one energy trend for both sports while the age or sex is unknown', () => {
    renderPage(makeResult(), { state: { trend: trendWithWeeks(2) } })
    const section = screen.getByRole('region', { name: 'Fitness over time' })
    expect(
      within(section).getByRole('figure', {
        name: 'Energy rate of your best 20 minutes, trailing 6 weeks',
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
    const heldSection = screen.getByRole('region', { name: 'Fitness over time' })
    expect(within(heldSection).queryByText('Cycling, estimated')).toBeNull()
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
    const section = screen.getByRole('region', { name: 'Fitness over time' })
    expect(within(section).getByText('Cycling, estimated')).toBeInTheDocument()
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
    const section = screen.getByRole('region', { name: 'Fitness over time' })
    expect(within(section).getByText('Age grades cover ages 5 to 100.')).toBeInTheDocument()
    expect(within(section).queryByText(/Add runs or rides/)).toBeNull()
  })

  it('says which ages the grades cover when every week’s age falls outside them', () => {
    // Born in 1900, the athlete is 125 in 2025: no age standard covers that.
    const running = trendWithWeeks(2).map((week) =>
      Object.assign(week, { runWkg: flatSpeedToMetabolic(4) }),
    )
    renderPage(makeResult(), { state: { trend: running } }, { birthYear: 1900, sex: 'male' })
    const section = screen.getByRole('region', { name: 'Fitness over time' })
    expect(within(section).getByText('Age grades cover ages 5 to 100.')).toBeInTheDocument()
    expect(within(section).queryByText(/Add runs or rides in more than one week/)).toBeNull()
  })

  it('shows the age-grade trend for both sports on one scale once the age and sex are known', () => {
    // A run at 4 m/s (4:10 /km) is a grade; the fixture's 3.4 W/kg is a walk, with no standard.
    const running = trendWithWeeks(2).map((week) =>
      Object.assign(week, { runWkg: flatSpeedToMetabolic(4) }),
    )
    renderPage(makeResult(), { state: { trend: running } }, MAN_BORN_1986)
    const section = screen.getByRole('region', { name: 'Fitness over time' })
    expect(
      within(section).getByRole('figure', {
        name: 'Age grade of your best 20 minutes, trailing 6 weeks',
      }),
    ).toBeInTheDocument()
    expect(within(section).getByText(/^Each point grades your best 20 minutes/)).toBeInTheDocument()
  })

  it('links to how sure the answer is once, from the evidence card', () => {
    renderPage()
    const links = screen.getAllByRole('link', { name: 'How sure is this?' })
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', '#/method')
  })

  it('offers the square and story image downloads while the analysis is idle', () => {
    renderPage()
    expect(screen.getByRole('button', { name: 'Download square image' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Download story image' })).toBeEnabled()
  })

  it('holds the image downloads until the analysis finishes', () => {
    renderPage(makeResult(), { busy: true })

    expect(screen.getByRole('button', { name: 'Download square image' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Download story image' })).toBeDisabled()
    expect(screen.getByText('Available when the analysis finishes.')).toBeInTheDocument()
  })

  it('offers no image when there is neither a comparison nor a sport estimate to draw', () => {
    renderPage(
      makeResult({ comparison: { prior: [], calibrated: null }, runCp: null, rideCp: null }),
    )
    expect(screen.queryByRole('button', { name: 'Download square image' })).not.toBeInTheDocument()
  })
})

describe('BalancePage age grades', () => {
  it('shows the run’s estimate on its card, at the age on its date', () => {
    renderPage(GRADED_RUN, {}, MAN_BORN_1986)

    expect(
      within(screen.getByRole('region', { name: 'Run' })).getByText(
        'Estimated age grade 67% · Local',
      ),
    ).toBeInTheDocument()
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

  it('names the standards, the sex they grade, and that a level is not a ranking', () => {
    renderPage(GRADED_RUN, {}, MAN_BORN_1986)

    const source = screen.getByText(/^Graded on the/)
    expect(source).toHaveTextContent(
      'Graded on the USATF road age standards (2025), by Alan Jones and Tom Bernhard, licensed CC0 1.0, for a man. Age is counted from your birth year on the date of each effort. Rides are graded through their running equivalent. A level, not a ranking.',
    )
    expect(
      within(source).getByRole('link', { name: 'USATF road age standards (2025)' }),
    ).toHaveAttribute('href', ROAD_STANDARDS_SOURCE.url)
  })

  it('shows the standards line only when a grade is shown', () => {
    const { unmount } = renderPage(makeResult(), {}, MAN_BORN_1986)
    expect(screen.queryByText(/^Graded on the/)).not.toBeInTheDocument()
    unmount()

    renderPage(
      makeResult({
        equivalents: [makeEquivalence()],
        rideCurve: [curvePoint(HEADLINE_DURATION_S, 400, 'ride-1')],
      }),
      {},
      MAN_BORN_1986,
    )
    expect(screen.getByText(/^Graded on the/)).toBeInTheDocument()
  })

  it('shows no standards line without the year of birth and sex', () => {
    renderPage(GRADED_RUN)
    expect(screen.queryByText(/^Graded on the/)).not.toBeInTheDocument()
  })
})

describe('BalancePage with no weight entered', () => {
  it('holds the balance and asks for the weight once, on a line that links to Profile', () => {
    renderPage(makeResult(), {}, null, false)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Your balance waits for your weight' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '#/profile')
    expect(screen.queryByText(/Ride figures use/)).not.toBeInTheDocument()
  })

  it('shows the balance, and no prompt for the weight, once a weight is entered', () => {
    renderPage(makeResult(), {}, null, true)
    expect(screen.queryByText(/waits for your weight/)).not.toBeInTheDocument()
  })

  it('leaves the ride estimate and the balance meter off the share card', async () => {
    renderPage(makeResult(), {}, null, false)
    fireEvent.click(screen.getByRole('button', { name: 'Download square image' }))
    await waitFor(() => expect(renderShareCard).toHaveBeenCalled())
    const card = vi.mocked(renderShareCard).mock.calls[0]?.[0]
    expect(card?.meter).toBeNull()
    expect(card?.heroes.find((hero) => hero.sport === 'ride')).toMatchObject({
      figure: null,
      sub: null,
    })
  })
})
