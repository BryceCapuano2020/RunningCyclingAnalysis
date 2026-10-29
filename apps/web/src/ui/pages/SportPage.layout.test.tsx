// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LateEvidence, SameHeartRate } from '@rca/core/digest'
import { NO_LATE_EVIDENCE } from '@rca/core/digest/lateEvidenceTypes'
import { NO_SAME_HEART_RATE } from '@rca/core/digest/sameHeartRateTypes'
import { NO_TRENDS } from '@rca/core/digest/trendPoints'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { MeasureTime } from '@rca/core/zones'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import { curvePoint } from '../charts/fixtures'
import {
  FIVE_K_IN_20_MIN_WKG,
  MAN_BORN_1986,
  interval,
  makeActivity,
  makeEquivalence,
  makeResult,
} from '../components/fixtures'
import type { AgeGap, AgeProfile } from '../grades'
import { measureTime } from '../test/zoneTimeFixtures'
import { SportPage } from './SportPage'

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
})

afterEach(cleanup)

const ZONES: MeasureTime[] = [
  measureTime('run', 'heartRate', [3600, 21_600, 7200, 3600, 0]),
  measureTime('run', 'pace', [0, 0, 0, 0, 0], { counted: 0 }),
]

function renderPage(
  sport: Sport,
  result: AnalysisResult,
  options: {
    profile?: AgeProfile | null
    missingAge?: AgeGap | null
    sameHeartRate?: SameHeartRate
    lateEvidence?: LateEvidence
    zoneTimes?: readonly MeasureTime[]
  } = {},
) {
  const profile = options.profile ?? null
  return render(
    <SportPage
      sport={sport}
      result={result}
      previous={null}
      previousLabel={null}
      trends={NO_TRENDS}
      sameHeartRate={options.sameHeartRate ?? NO_SAME_HEART_RATE[sport]}
      lateEvidence={options.lateEvidence ?? NO_LATE_EVIDENCE[sport]}
      zoneTimes={options.zoneTimes}
      windowDays={28}
      units="metric"
      massKg={75}
      weighted
      profile={profile}
      missingAge={
        options.missingAge === undefined ? (profile === null ? 'sex' : null) : options.missingAge
      }
      rangeDays={42}
      controls={<span>Period picker</span>}
      emptyText="Nothing in this period."
      inLibrary={result.activities.filter((activity) => activity.sport === sport).length}
      library={result.activities}
      onAddFiles={vi.fn()}
    />,
  )
}

const run = (over: Parameters<typeof makeActivity>[0] = {}) =>
  makeActivity({ id: 'run-1', name: 'Parkrun', sport: 'run', ...over })

describe('the answer: threshold and level in one card', () => {
  it('names the threshold with a chip that says it is estimated, drawn as a ring', () => {
    renderPage('run', makeResult({ activities: [run()] }))
    const threshold = screen.getByRole('region', { name: 'Threshold pace, estimated' })
    const chip = within(threshold).getByText('Estimated')
    expect(chip).toHaveClass('stat-tile__basis--estimated')
    // The chip repeats the heading’s words for the eye, so a screen reader hears them once.
    expect(chip.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('draws the threshold’s fit as a spread, and says so: "fit spread", not a range or a confidence interval', () => {
    renderPage('run', makeResult({ activities: [run()] }))
    const track = screen
      .getByRole('region', { name: 'Threshold pace, estimated' })
      .querySelector('.range-track')!
    expect(track).toHaveClass('range-track--spread')
    expect(track.textContent).toContain('fit spread')
    expect(track.textContent).not.toMatch(/confidence|90%/i)
  })

  it('draws a range between two fits as a range, not a spread, for the uneven efforts', () => {
    const uneven = {
      fit: { cp: 3.6, wPrime: 15, cpSe: 0.04, r2: 0.98, nPoints: 5 },
      leftOutS: [900, 1200],
      floor: 3.2,
    }
    renderPage(
      'ride',
      makeResult({ activities: [makeActivity({ id: 'r', sport: 'ride' })], rideCpUneven: uneven }),
    )
    const track = screen
      .getByRole('region', { name: 'Threshold power, estimated' })
      .querySelector('.range-track')!
    expect(track).not.toHaveClass('range-track--spread')
    expect(track.textContent).toContain('range, W')
  })

  it('shows the hard-effort check with its icon and its words when the best 20 minutes was hard', () => {
    renderPage(
      'run',
      makeResult({
        activities: [run()],
        effort: [{ durationS: HEADLINE_DURATION_S, runHrFraction: 0.97, rideHrFraction: null }],
      }),
    )
    const check = screen.getByText(/reached 97% of your running reference heart rate/).closest('p')!
    expect(check).toHaveClass('sport-hero__check--hard')
    expect(check.querySelector('svg')).not.toBeNull()
    expect(check).toHaveTextContent('so it was hard.')
  })

  it('shows a recorded run’s level as a dot, with its percent at display size', () => {
    renderPage(
      'run',
      makeResult({
        activities: [run()],
        runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
      }),
      { profile: MAN_BORN_1986 },
    )
    const level = screen.getByRole('region', { name: 'Level of your best 20 min' })
    expect(level.querySelector('.sport-hero__level-name')).toHaveTextContent('Local')
    expect(level.querySelector('.sport-hero__level-value')).toHaveTextContent('67%')
    expect(level.querySelector('.level-ladder__dot')).not.toBeNull()
    expect(level.querySelector('.level-ladder__ring')).toBeNull()
    // A recorded effort has no estimated chip.
    expect(within(level).queryByText('Estimated')).toBeNull()
  })

  it('shows a ride’s level as an estimate: a ring, its range and an estimated chip', () => {
    renderPage(
      'ride',
      makeResult({
        activities: [makeActivity({ id: 'r', sport: 'ride', name: 'Hill ride' })],
        rideCurve: [curvePoint(HEADLINE_DURATION_S, 400, 'r')],
        equivalents: [
          makeEquivalence({
            durationS: HEADLINE_DURATION_S,
            runSpeed: interval(3.9, 5000 / HEADLINE_DURATION_S, 4.4),
          }),
        ],
      }),
      { profile: MAN_BORN_1986 },
    )
    const level = screen.getByRole('region', { name: 'Level of your best 20 min' })
    expect(level.querySelector('.level-ladder__ring')).not.toBeNull()
    expect(level.querySelector('.level-ladder__dot')).toBeNull()
    expect(within(level).getByText('Estimated')).toHaveClass('stat-tile__basis--estimated')
    expect(within(level).getByText('range 63–71%')).toBeInTheDocument()
  })

  it('asks for what the level needs where the profile is missing, and has no ladder', () => {
    renderPage('run', makeResult({ activities: [run()] }), { missingAge: 'year of birth' })
    const level = screen.getByRole('region', { name: 'Level of your best 20 min' })
    expect(within(level).getByText('Age grades need your year of birth.')).toBeInTheDocument()
    expect(level.querySelector('.level-ladder')).toBeNull()
  })

  it('leaves the level out, and the threshold alone in the card, with nothing to ask for', () => {
    renderPage('run', makeResult({ activities: [run()] }), { missingAge: null })
    expect(screen.queryByRole('region', { name: 'Level of your best 20 min' })).toBeNull()
  })

  it('puts the period control directly under the answer', () => {
    renderPage('run', makeResult({ activities: [run()] }))
    const hero = document.querySelector('.sport-hero')!
    expect(hero.nextElementSibling).toHaveTextContent('Period picker')
  })
})

describe('the records under the curve', () => {
  const at = new Date(2026, 0, 12, 9).getTime()
  const withDistances = run({
    id: 'run-d',
    name: 'Track night',
    startMs: at,
    distanceBests: [
      { distanceM: 1000, seconds: 200 },
      { distanceM: 1609.344, seconds: 340 },
      { distanceM: 5000, seconds: 1260 },
      { distanceM: 10_000, seconds: 2700 },
      { distanceM: 21_097.5, seconds: 6000 },
    ],
  })
  const tiles = () =>
    within(screen.getByRole('list', { name: 'Best efforts' })).getAllByRole('listitem')

  it('shows a run’s four distances as tiles, with the time, the pace and the activity', () => {
    renderPage('run', makeResult({ activities: [withDistances] }))
    const items = tiles()
    expect(items.map((tile) => tile.querySelector('.record-tiles__label')?.textContent)).toEqual([
      '1 km',
      '1 mi',
      '5 km',
      '10 km',
    ])
    expect(items.map((tile) => tile.querySelector('.record-tiles__value')?.textContent)).toEqual([
      '3:20',
      '5:40',
      '21:00',
      '45:00',
    ])
    // The kilometre's pace is its time, so it has none beside it; the others show their pace.
    expect(items[0]!.querySelector('.record-tiles__sub')).toBeNull()
    expect(items[2]!.querySelector('.record-tiles__sub')).toHaveTextContent('4:12 /km')
  })

  it('names the one activity every record was set in once, under the strip, and not on each tile', () => {
    renderPage('run', makeResult({ activities: [withDistances] }))
    expect(tiles().every((tile) => tile.querySelector('a') === null)).toBe(true)
    expect(screen.getByText(/^All set on/).querySelector('a')).toHaveAttribute(
      'href',
      '#/activities/run-d',
    )
  })

  it('links each tile to its own activity when they were set in different ones', () => {
    const other = run({
      id: 'run-o',
      name: 'Long run',
      startMs: at - 86_400_000 * 30,
      distanceBests: [{ distanceM: 10_000, seconds: 2640 }],
    })
    renderPage('run', makeResult({ activities: [withDistances, other] }))
    const links = tiles().flatMap((tile) => Array.from(tile.querySelectorAll('a')))
    expect(links.map((link) => link.getAttribute('href'))).toContain('#/activities/run-o')
    expect(links.map((link) => link.getAttribute('href'))).toContain('#/activities/run-d')
  })

  it('gives a tile a level chip where the distance has a standard, and none for the kilometre', () => {
    renderPage('run', makeResult({ activities: [withDistances] }), { profile: MAN_BORN_1986 })
    const items = tiles()
    expect(items[0]!.querySelector('.record-tiles__grade')).toBeNull()
    for (const tile of items.slice(1)) {
      expect(tile.querySelector('.record-tiles__grade')?.textContent).toMatch(
        /^(Recreational|Local|Regional|National|World) · \d+%$/,
      )
    }
  })

  it('shows a ride’s 1, 5, 20 and 60 minute bests in watts with watts a kilogram', () => {
    const ride = makeActivity({
      id: 'r',
      sport: 'ride',
      name: 'Hill ride',
      powerSource: 'measured',
    })
    renderPage(
      'ride',
      makeResult({
        activities: [ride],
        rideCurve: [
          curvePoint(60, 450, 'r'),
          curvePoint(300, 330, 'r'),
          curvePoint(1200, 260, 'r'),
          curvePoint(3600, 240, 'r'),
        ],
      }),
    )
    const items = tiles()
    expect(items.map((tile) => tile.querySelector('.record-tiles__label')?.textContent)).toEqual([
      '1 min',
      '5 min',
      '20 min',
      '60 min',
    ])
    expect(items[0]!.querySelector('.record-tiles__value')).toHaveTextContent('450 W')
    expect(items[0]!.querySelector('.record-tiles__sub')).toHaveTextContent('6.0 W/kg')
  })

  it('says the full list has levels only when the page has a profile to grade them with', () => {
    renderPage('run', makeResult({ activities: [withDistances] }), { profile: MAN_BORN_1986 })
    const row = screen.getByRole('region', { name: 'All best efforts' }).querySelector('summary')!
    expect(row.textContent).toMatch(
      /\d+ best efforts with their levels, and the activity each was set in$/,
    )
    cleanup()
    renderPage('run', makeResult({ activities: [withDistances] }), { missingAge: 'sex' })
    const bare = screen.getByRole('region', { name: 'All best efforts' }).querySelector('summary')!
    expect(bare.textContent).toMatch(/\d+ best efforts and the activity each was set in$/)
  })

  it('has no strip, and no empty list, without a record', () => {
    renderPage('ride', makeResult({ activities: [makeActivity({ id: 'r', sport: 'ride' })] }))
    expect(screen.queryByRole('list', { name: 'Best efforts' })).toBeNull()
  })
})

describe('"On this page" and the layout', () => {
  const full = () =>
    makeResult({
      activities: [
        run({
          distanceBests: [
            { distanceM: 5000, seconds: 1260 },
            { distanceM: 10_000, seconds: 2700 },
          ],
        }),
      ],
    })
  const sameHeartRate: SameHeartRate = {
    referenceHeartRate: 145,
    weeks: [0, 1, 2, 3].map((i) => ({
      endMs: Date.UTC(2025, 0, 12) + i * 7 * 86_400_000,
      fit: { output: 3.2 + i * 0.05, low: 3.1 + i * 0.05, high: 3.3 + i * 0.05 },
      lacks: null,
      blocks: 14,
      activities: 5,
    })),
    change: {
      fromEndMs: Date.UTC(2025, 0, 12),
      toEndMs: Date.UTC(2025, 0, 12) + 3 * 7 * 86_400_000,
      from: 3.2,
      to: 3.35,
      weeksApart: 3,
      relative: 0.05,
      real: true,
    },
    lacks: null,
    latestWeekEndMs: Date.UTC(2025, 0, 12) + 3 * 7 * 86_400_000,
  }

  it('lists the open sections first and the closed ones after, naming only what the page has', () => {
    renderPage('run', full(), { zoneTimes: ZONES, sameHeartRate })
    const nav = screen.getByRole('navigation', { name: 'On this page' })
    expect(
      within(nav)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual([
      'Best efforts',
      'Race predictions',
      'Time in zones',
      'Week by week',
      'Same heart rate',
      'All best efforts',
    ])
  })

  it('leaves out a section the page has nothing for, and race predictions on a ride', () => {
    renderPage('ride', makeResult({ activities: [makeActivity({ id: 'r', sport: 'ride' })] }))
    const nav = screen.getByRole('navigation', { name: 'On this page' })
    expect(
      within(nav)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Best efforts', 'Week by week', 'All best efforts'])
  })

  it('opens a closed section when its button is pressed, and scrolls to it', () => {
    renderPage('run', full(), { zoneTimes: ZONES, sameHeartRate })
    const region = screen.getByRole('region', { name: 'At the same heart rate' })
    expect(within(region).queryByRole('figure')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Same heart rate' }))
    const details = region.querySelector('details')!
    expect(details.open).toBe(true)
    fireEvent(details, new Event('toggle'))
    expect(within(region).getByRole('figure')).toBeInTheDocument()
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('sets race predictions and the zones side by side in one row, and every other section alone', () => {
    renderPage('run', full(), { zoneTimes: ZONES, sameHeartRate })
    const rows = Array.from(document.querySelectorAll('.sport-row'))
    const pair = rows.filter((row) => row.classList.contains('sport-row--pair'))
    expect(pair).toHaveLength(1)
    expect(
      within(pair[0] as HTMLElement).getByRole('region', { name: 'Race predictions' }),
    ).toBeInTheDocument()
    expect(
      within(pair[0] as HTMLElement).getByRole('region', { name: 'Time in zones' }),
    ).toBeInTheDocument()
  })

  it('gives a ride’s zones their own row, with no race predictions beside them', () => {
    renderPage('ride', makeResult({ activities: [makeActivity({ id: 'r', sport: 'ride' })] }), {
      zoneTimes: [measureTime('ride', 'heartRate', [3600, 21_600, 7200, 3600, 0])],
    })
    expect(document.querySelector('.sport-row--pair')).toBeNull()
    expect(screen.getByRole('region', { name: 'Time in zones' })).toBeInTheDocument()
  })

  it('gives every closed section a summary that says its finding, never an empty row', () => {
    renderPage('run', full(), {
      zoneTimes: ZONES,
      sameHeartRate,
      lateEvidence: NO_LATE_EVIDENCE.run,
    })
    for (const summary of Array.from(document.querySelectorAll('.sport-disclosure__summary'))) {
      const finding = summary.querySelector('.sport-disclosure__finding')?.textContent ?? ''
      expect(finding.length).toBeGreaterThan(10)
    }
  })
})
