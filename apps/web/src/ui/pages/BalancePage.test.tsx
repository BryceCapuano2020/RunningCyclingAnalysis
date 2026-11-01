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

/** Weeks with a run and a ride, each with a best, so the page has both sports' weeks to draw its hours on. */
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
    }
  })
}

/** Weeks with a running value. */
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

  it('invites the sport the files lack in one row at the foot, not in a card of its own', () => {
    pinClock()
    const run = makeActivity({ id: 'run-1', sport: 'run' })
    renderPage(makeResult({ activities: [run] }), { state: { library: [run] } })

    const row = screen.getByTestId('sport-invitation')
    expect(
      within(row).getByText('Add rides to compare them with your running.'),
    ).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Add rides' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Ride' })).toBeNull()
  })

  it('draws the meter under the answer once both sports are graded, named for a screen reader', () => {
    renderPage(BOTH_SPORTS, {}, MAN_BORN_1986)

    expect(
      screen.getByRole('img', { name: /^Running grades \d+ points? higher/ }),
    ).toBeInTheDocument()
    expect(document.querySelector('.balance-meter__value')).not.toBeNull()
  })

  it('writes each sport’s level as one line under the meter: its grade, then its level', () => {
    const { container } = renderPage(BOTH_SPORTS, {}, MAN_BORN_1986)
    const levels = screen.getByRole('region', { name: 'Level in each sport' })
    const rows = [...levels.querySelectorAll('.balance-levels__row')].map((row) => {
      const copy = row.cloneNode(true) as HTMLElement
      copy.querySelectorAll('.definition__note').forEach((note) => note.remove())
      return (copy.textContent ?? '').replace(/\s+/g, ' ').trim()
    })
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatch(/^Running \d+% \w+/)
    expect(rows[1]).toMatch(/^Cycling \d+% \w+/)
    // The levels come after the meter and before the period control.
    const meter = container.querySelector('.balance-meter') as Node
    const picker = screen.getByText('Period picker')
    expect(meter.compareDocumentPosition(levels) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(levels.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('draws no level scale, key or scoreboard figure: the answer is the headline, one sentence and the meter', () => {
    const { container } = renderPage(BOTH_SPORTS, {}, MAN_BORN_1986)
    for (const gone of ['.balance-scale', '.balance-hero__gap', '.balance-meter__key']) {
      expect(container.querySelector(gone), gone).toBeNull()
    }
    expect(container.querySelector('.balance-hero svg:not(.icon)')).toBeNull()
  })

  it('leaves the sample chip off the answer, since the banner above every page says so once', () => {
    renderPage(makeResult(), { state: { isSample: true } })
    expect(screen.queryByText('Sample athlete')).not.toBeInTheDocument()
  })

  it('shows a threshold tile for each sport, named by the sport', () => {
    renderPage()
    expect(screen.getByRole('article', { name: 'Run threshold' })).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Ride threshold' })).toBeInTheDocument()
  })

  it('lays the tiles out in the sport order, then the ride on foot, with no tile for the lean', () => {
    renderPage(BOTH_SPORTS, {}, MAN_BORN_1986)
    const names = screen.getAllByRole('article').map((tile) => tile.getAttribute('aria-label'))
    expect(names).toEqual([
      `${SPORT_LABEL[SPORT_ORDER[0]]} threshold`,
      `${SPORT_LABEL[SPORT_ORDER[1]]} threshold`,
      'Ride on foot',
    ])
  })

  it('shows the evidence for the duration the answer is about', () => {
    renderPage(
      makeResult({ effort: [{ durationS: 1200, runHrFraction: 0.95, rideHrFraction: 0.8 }] }),
    )
    // The check sits on the tile it qualifies, as a one-line chip: no card of its own.
    const tile = screen.getByRole('article', { name: 'Ride threshold' })
    expect(within(tile).getByRole('button', { name: 'Not all-out' })).toBeInTheDocument()
    expect(
      within(screen.getByRole('article', { name: 'Run threshold' })).getByRole('button', {
        name: 'Hard effort · 95%',
      }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /hard heart rate/ })).toBeNull()
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
    expect(screen.getByText(/^Add heart rate to sharpen this/)).toBeInTheDocument()
    expect(screen.getByText('No heart-rate check')).toBeInTheDocument()
  })

  it('folds the equivalence table into the ride on foot tile, closed under its figure', () => {
    renderPage(makeResult({ equivalents: [makeEquivalence()] }))

    const tile = screen.getByRole('article', { name: 'Ride on foot' })
    expect(within(tile).getByText('See the pace curve')).toBeInTheDocument()
    expect(tile.querySelector('details')).not.toHaveAttribute('open')
    // The table is not a section of its own any more: one table, inside the tile.
    expect(
      document.querySelectorAll('.equivalence-table, .equivalence-list').length,
    ).toBeLessThanOrEqual(2)
  })

  it('puts the grading source right under the tiles it explains, ahead of the charts', () => {
    const { container } = renderPage(
      GRADED_RUN,
      { state: { trend: trendWithWeeks(2) } },
      MAN_BORN_1986,
    )
    const source = screen.getByText(/^Graded for a/)
    const tiles = container.querySelector('.balance-tiles') as HTMLElement
    expect(tiles.nextElementSibling).toBe(source)
  })

  it('puts the grade by duration after the tiles, with the width of the page to itself', () => {
    const durations = [600, 1200, 3600]
    const result = makeResult({
      runCurve: durations.map((d) => curvePoint(d, FIVE_K_IN_20_MIN_WKG, 'run-1')),
      rideCurve: durations.map((d) => curvePoint(d, 400, 'ride-1')),
      equivalents: durations.map((d) => makeEquivalence({ durationS: d })),
    })
    const { container } = renderPage(result, {}, MAN_BORN_1986)
    const chart = screen.getByRole('region', { name: 'Grade by duration' })
    const tiles = container.querySelector('.balance-tiles')
    expect(
      (tiles?.compareDocumentPosition(chart) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    // Not in a pair with anything: the hours strip is its own block below it.
    expect(chart.parentElement).not.toHaveClass('balance__pair')
    expect(container.querySelector('.balance__pair')).toBeNull()
  })

  it('leaves the grade by duration out when only one duration is graded in both sports', () => {
    renderPage(BOTH_SPORTS, {}, MAN_BORN_1986)
    expect(screen.queryByRole('region', { name: 'Grade by duration' })).not.toBeInTheDocument()
  })

  it('names only the missing field, in the prompt and on its button', () => {
    renderPage(makeResult(), {}, null, true, 'sex')
    expect(screen.getByText('The balance in points and levels needs your sex.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add your sex' })).toHaveAttribute('href', '#/profile')
    expect(screen.queryByRole('link', { name: PROFILE_PROMPT })).not.toBeInTheDocument()
  })

  it('draws the energy meter in percent while the age and sex are unknown, and says the levels wait for them once', () => {
    const { container } = renderPage(BOTH_SPORTS)
    expect(container.querySelector('.balance-meter__value')).toHaveTextContent('%')
    const levels = screen.getByRole('region', { name: 'Level in each sport' })
    expect(levels).toHaveTextContent('Needs your year of birth and sex')
    expect(levels.querySelectorAll('.balance-levels__row')).toHaveLength(0)
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
  it('shows the run’s grade on its tile, at the age on its date', () => {
    renderPage(GRADED_RUN, {}, MAN_BORN_1986)

    const tile = screen.getByRole('article', { name: 'Run threshold' })
    expect(tile).toHaveTextContent(/Your best 20 min was faster: \d+:\d{2} \/(mi|km)/)
    // The levels row says the level and grade; the tile does not say them again.
    expect(tile).not.toHaveTextContent(/Local|67%/)
    expect(screen.getByRole('region', { name: 'Level in each sport' })).toHaveTextContent(
      /Running\s*67%\s*Local/,
    )
  })

  it('drops the standards line from each tile, since the source line at the foot names it', () => {
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

  it('does not say again how a ride is graded: the ride on foot tile says it, once', () => {
    renderPage(
      makeResult({
        equivalents: [makeEquivalence()],
        rideCurve: [curvePoint(HEADLINE_DURATION_S, 400, 'ride-1')],
      }),
      {},
      MAN_BORN_1986,
    )
    expect(screen.queryByText(/Rides are graded through/)).not.toBeInTheDocument()
    expect(
      screen.getByText(/takes the same effort as running this pace on the flat/),
    ).toBeInTheDocument()
  })

  it('holds the ride on foot tile without a weight, with the same prompt as the other tiles', () => {
    renderPage(makeResult({ equivalents: [makeEquivalence()] }), {}, null, false)
    const tile = screen.getByRole('article', { name: 'Ride on foot' })
    expect(within(tile).getByText(/Add your weight on/)).toBeInTheDocument()
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
    expect(screen.getByRole('article', { name: 'Ride threshold' })).toHaveTextContent(
      'Add your weight on Profile to grade your rides and see their figures.',
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

describe('BalancePage concept budget', () => {
  /** A both-sports page with a profile and a trend: every part the page can show. */
  function full() {
    // Three weeks of training, on the weeks the trend ends on (UTC Sundays), so the page draws its hours strip.
    const trend = trendWithRides(3).map((week, i) =>
      Object.assign(week, { endMs: Date.UTC(2026, 0, 4 + i * 7, 23, 59, 59, 999) }),
    )
    const trained = makeResult({
      ...BOTH_SPORTS,
      activities: trend.flatMap((week, i) => [
        makeActivity({
          id: `run-${i}`,
          sport: 'run',
          startMs: week.endMs - 3 * 86_400_000,
          movingS: 3600,
        }),
        makeActivity({
          id: `ride-${i}`,
          sport: 'ride',
          startMs: week.endMs - 3 * 86_400_000,
          movingS: 3600,
        }),
      ]),
    })
    return renderPage(trained, { state: { trend } }, MAN_BORN_1986)
  }

  it('draws the one meter and no ladders', () => {
    const { container } = full()
    expect(container.querySelectorAll('.balance-meter')).toHaveLength(1)
    for (const gone of ['.balance-scale', '.level-ladder', '.balance-strip', '.sport-card']) {
      expect(container.querySelector(gone), gone).toBeNull()
    }
  })

  it('states the level target once, as a line under the hero’s lede', () => {
    renderPage(
      makeResult({
        runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
        rideCurve: [curvePoint(HEADLINE_DURATION_S, 200, 'ride-1')],
        equivalents: [makeEquivalence({ ridePowerW: 200 })],
      }),
      {},
      MAN_BORN_1986,
    )
    const sentences = screen.getAllByText(/^To match your/)
    expect(sentences).toHaveLength(1)
    expect(sentences[0]?.closest('.balance-hero__text')).not.toBeNull()
    expect(sentences[0]?.previousElementSibling).toHaveClass('balance-hero__lede')
  })

  it('has no across-sports section and no second table of the ride on foot at every duration', () => {
    full()
    expect(screen.queryByText('Across sports')).toBeNull()
    expect(
      screen.queryByRole('region', { name: /Your ride on foot, at every duration/ }),
    ).toBeNull()
    // The one table of equivalents is the tile's, folded under its figure.
    expect(
      screen
        .getAllByText('See the pace curve')
        .every((summary) => summary.closest('.stat-tile') !== null),
    ).toBe(true)
  })

  it('keeps the energy rate and the metabolic wording off Balance while the grades are on it', () => {
    const { container } = full()
    expect(container.textContent).not.toMatch(/energy rate|energy per kilogram|metabolic/i)
  })

  it('holds to a handful of headed parts above the charts, and no more', () => {
    const { container } = full()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    const chartsAt = container.querySelector('[aria-labelledby="balance-volume"]')
    const before = Array.from(container.querySelectorAll('h2, h3'))
      .filter(
        (heading) =>
          chartsAt !== null &&
          heading.compareDocumentPosition(chartsAt) & Node.DOCUMENT_POSITION_FOLLOWING,
      )
      .map((heading) => {
        // A defined term's note sits in its heading's markup, shown on a press: it is not the heading's text.
        const copy = heading.cloneNode(true) as HTMLElement
        copy.querySelectorAll('.definition__note').forEach((note) => note.remove())
        return copy.textContent
      })
    // The share sheet's heading and the three tiles: nothing else. The heart-rate check is a chip on a tile.
    expect(before).toEqual([
      'Share image',
      'Headline numbers',
      'Run threshold',
      'Ride threshold',
      'Ride on foot',
    ])
  })

  it('states the gap in points once at the dot and once in the lede, and nowhere else', () => {
    const { container } = full()
    const lede = container.querySelector('.balance-hero__lede')?.cloneNode(true) as HTMLElement
    lede.querySelectorAll('.definition__note').forEach((note) => note.remove())
    expect(lede.textContent).toMatch(/age grade is \d+ points? higher than cycling’s at 20.min\./)
    const sentences = (container.textContent ?? '').match(/points? higher than/g) ?? []
    // Once in the lede; the description of the drawing words it as "grades", not as the lede does.
    expect(sentences).toHaveLength(1)
  })
})

describe('BalancePage while the headline is held for too few activities', () => {
  /** Two runs and five rides, each with a 20 minute best, so both grades exist but the headline waits for a third run. */
  function held() {
    const activities = [
      ...[1, 2].map((n) => makeActivity({ id: `run-${n}`, sport: 'run' })),
      ...[1, 2, 3, 4, 5].map((n) => makeActivity({ id: `ride-${n}`, sport: 'ride' })),
    ]
    return renderPage(
      makeResult({
        activities,
        runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
        rideCurve: [curvePoint(HEADLINE_DURATION_S, 400, 'ride-1')],
        equivalents: [makeEquivalence()],
      }),
      { state: { library: activities } },
      MAN_BORN_1986,
    )
  }

  it('holds the hero and the target together: none states a lean', () => {
    const { container } = held()
    expect(screen.getByRole('heading', { level: 1 })).not.toHaveTextContent(
      /leans toward|in balance/,
    )
    expect(container.querySelector('.balance-meter')).toBeNull()
    expect(screen.queryByText(/^To match your/)).toBeNull()
    expect(screen.queryByRole('region', { name: 'Level in each sport' })).toBeNull()
  })
})

describe('BalancePage with one sport', () => {
  it('writes the one sport’s level as a line of its own, with the ask for the other at the foot', () => {
    const run = makeActivity({ id: 'run-1', sport: 'run' })
    const result = makeResult({
      activities: [run],
      runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
      comparison: { prior: [], calibrated: null },
    })
    const { container } = renderPage(result, { state: { library: [run] } }, MAN_BORN_1986)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Your running is at Local level' }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('sport-invitation')).toBeInTheDocument()
    const rows = container.querySelectorAll('.balance-levels__row')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveAttribute('data-sport', 'run')
    expect(rows[0]).toHaveTextContent(/^Running\s*\d+%\s*Local/)
    expect(container.querySelector('.balance-meter')).toBeNull()
  })

  it('asks for the year of birth and sex as the level’s need, not the balance’s', () => {
    const run = makeActivity({ id: 'run-1', sport: 'run' })
    renderPage(makeResult({ activities: [run], comparison: { prior: [], calibrated: null } }), {
      state: { library: [run] },
    })
    expect(screen.getByText('Your level needs your year of birth and sex.')).toBeInTheDocument()
    expect(screen.queryByText(/The balance in points and levels needs/)).toBeNull()
  })

  it('shows the one sport’s other best efforts under its tiles, and a library of both sports does not', () => {
    const ride = makeActivity({ id: 'ride-1', sport: 'ride' })
    const curve = [
      curvePoint(300, 330, 'ride-1'),
      curvePoint(HEADLINE_DURATION_S, 270, 'ride-1'),
      curvePoint(3600, 230, 'ride-1'),
    ]
    renderPage(makeResult({ activities: [ride], rideCurve: curve }), { state: { library: [ride] } })
    expect(screen.getByRole('list', { name: 'Best efforts' })).toBeInTheDocument()
    cleanup()
    renderPage(BOTH_SPORTS)
    expect(screen.queryByRole('list', { name: 'Best efforts' })).toBeNull()
  })

  it('draws no ride best efforts while no weight is entered, as the Ride page holds them', () => {
    const ride = makeActivity({ id: 'ride-1', sport: 'ride' })
    const curve = [curvePoint(300, 330, 'ride-1'), curvePoint(3600, 230, 'ride-1')]
    renderPage(
      makeResult({ activities: [ride], rideCurve: curve }),
      { state: { library: [ride] } },
      null,
      false,
    )
    expect(screen.queryByRole('list', { name: 'Best efforts' })).toBeNull()
    expect(document.body.textContent).not.toMatch(/W\/kg/)
  })

  it('writes no level line for the one sport while its grade is missing', () => {
    const run = makeActivity({ id: 'run-1', sport: 'run' })
    const { container } = renderPage(
      makeResult({ activities: [run], comparison: { prior: [], calibrated: null } }),
      {
        state: { library: [run] },
      },
    )
    expect(container.querySelector('.balance-levels')).toBeNull()
  })
})
