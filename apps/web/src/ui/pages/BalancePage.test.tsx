// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { AthleteSettings } from '@rca/core/types'
import type { TrendPoint } from '@rca/core/digest'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import { ROAD_STANDARDS_SOURCE } from '@rca/core/grade'
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

const PROFILE_PROMPT = 'Add your year of birth and sex on your profile to see age-graded levels.'

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

/** Two weeks with a running value: the fitness trend is shown only from two. */
function trendWithWeeks(weeks: number): TrendPoint[] {
  return Array.from({ length: weeks }, (_, index) => ({
    endMs: new Date(2026, 0, 4 + index * 7, 23, 59).getTime(),
    runWkg: 3.4,
    rideWkg: null,
    runCount: 1,
    rideCount: 0,
  }))
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

  it('shows the running trend in pace and says when there are not yet two weeks of cycling', () => {
    renderPage(makeResult(), { state: { trend: trendWithWeeks(2) } })
    expect(
      screen.getByRole('img', {
        name: /^Running grade-adjusted pace per kilometre, best 20 minutes by week\./,
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('Add rides in more than one week to see a trend')).toBeInTheDocument()
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
        'Estimated age grade 67.6% · Local',
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
      'Graded on the USATF road age standards (2025), by Alan Jones and Tom Bernhard, licensed CC0 1.0, for a man. Age is counted from your birth year on the date of each effort. Rides are graded through their equal-energy running pace. A level, not a ranking.',
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
  it('says the ride figures use the placeholder, and links to Profile to add a weight', () => {
    renderPage(makeResult(), {}, null, false)
    expect(
      screen.getByText(/Ride figures use 75 kg until you add your weight on/),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '#/profile')
  })

  it('shows no such line once a weight is entered', () => {
    renderPage(makeResult(), {}, null, true)
    expect(screen.queryByText(/Ride figures use/)).not.toBeInTheDocument()
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
