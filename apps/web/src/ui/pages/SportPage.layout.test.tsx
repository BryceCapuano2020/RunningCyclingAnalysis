// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  makeRideThreshold,
} from '../components/fixtures'
import type { AgeGap, AgeProfile } from '../grades'
import { measureTime } from '../test/zoneTimeFixtures'
import { SportPage } from './SportPage'
import { openDetail } from '../test/openDetail'

beforeEach(() => {
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
      zoneTimes={options.zoneTimes}
      change={null}
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
  it('names a run’s threshold by its words alone: no chip, no ring, no track beside the figure', () => {
    renderPage('run', makeResult({ activities: [run()] }))
    const threshold = screen.getByRole('region', { name: 'Threshold pace' })
    expect(threshold.querySelector('.sport-hero__number')).toHaveTextContent('23:23')
    expect(threshold.querySelector('.chip')).toBeNull()
    expect(within(threshold).queryByText(/Estimated|At least/)).toBeNull()
    // Only the number and its unit sit in the figure: a run has no second reading, and no range is drawn.
    expect(threshold.querySelector('.sport-hero__figure')?.children).toHaveLength(2)
    expect(within(threshold).queryByText('range')).toBeNull()
  })

  it('names a ride’s threshold by its words alone: no chip, no ring, no track beside the figure', () => {
    renderPage(
      'ride',
      makeResult({
        activities: [makeActivity({ id: 'r', sport: 'ride' })],
        rideThreshold: makeRideThreshold(15.5),
      }),
    )
    const threshold = screen.getByRole('region', { name: 'Threshold power' })
    expect(threshold.querySelector('.sport-hero__number')).toHaveTextContent('250')
    expect(threshold.querySelector('.chip')).toBeNull()
    expect(threshold.querySelector('.sport-hero__figure')?.children).toHaveLength(3)
    expect(within(threshold).queryByText('range')).toBeNull()
  })

  it('keeps a run’s effort check out of its threshold: no chip or heading-row words, and none in the detail', () => {
    renderPage(
      'run',
      makeResult({
        activities: [run()],
        effort: [{ durationS: HEADLINE_DURATION_S, runHrFraction: 0.97, rideHrFraction: null }],
      }),
    )
    const threshold = screen.getByRole('region', { name: 'Threshold pace' })
    expect(within(threshold).queryByRole('button', { name: 'Hard effort' })).toBeNull()
    expect(threshold.querySelector('.sport-hero__head .chip')).toBeNull()
    openDetail(threshold)
    expect(threshold.querySelector('.props')).not.toHaveTextContent(
      /close to your highest heart rate|heart rate/,
    )
  })

  it('leaves the period to the rail: the threshold carries no period tag of its own', () => {
    renderPage('run', makeResult({ activities: [run()] }))
    const threshold = screen.getByRole('region', { name: 'Threshold pace' })
    // renderPage's period is 42 days, the six weeks.
    expect(threshold.querySelector('.sport-hero__period')).toBeNull()
    expect(threshold).not.toHaveTextContent(/6 weeks/)
  })

  it('shows a run’s level as a ring on its threshold’s range, with its percent at display size', () => {
    renderPage(
      'run',
      makeResult({
        activities: [run()],
        runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
      }),
      { profile: MAN_BORN_1986 },
    )
    const level = screen.getByRole('region', { name: 'Age grade at threshold' })
    expect(level.querySelector('.sport-hero__level-name')).toHaveTextContent('Local')
    expect(level.querySelector('.sport-hero__level-value')).toHaveTextContent('67%')
    expect(level.querySelector('.level-ladder__ring')).not.toBeNull()
    expect(level.querySelector('.level-ladder__dot')).toBeNull()
    // A run is read as recorded, so it has no estimated chip.
    expect(within(level).queryByText('Estimated')).toBeNull()
  })

  it('shows a ride’s level as its centre’s: a ring with its range on the ladder, and no chip or range beside the figure', () => {
    renderPage(
      'ride',
      makeResult({
        activities: [makeActivity({ id: 'ride-1', sport: 'ride', name: 'Hill ride' })],
        rideCurve: [curvePoint(HEADLINE_DURATION_S, 400, 'ride-1')],
        equivalents: [
          makeEquivalence({
            durationS: HEADLINE_DURATION_S,
            runSpeed: interval(3.9, 5000 / HEADLINE_DURATION_S, 4.4),
          }),
        ],
      }),
      { profile: MAN_BORN_1986 },
    )
    const level = screen.getByRole('region', { name: 'Age grade at threshold' })
    // The range reaches from Local into Regional, and the level is still the centre's.
    expect(level.querySelector('.sport-hero__level-name')).toHaveTextContent('Local')
    expect(level.querySelector('.sport-hero__level-value')).toHaveTextContent('67%')
    expect(level.querySelector('.level-ladder__ring')).not.toBeNull()
    expect(level.querySelector('.level-ladder__range')).toBeNull()
    expect(level.querySelector('.level-ladder__dot')).toBeNull()
    expect(within(level).queryByText('Estimated')).toBeNull()
    expect(level.querySelector('.sport-hero__level')).toHaveTextContent(/^Local · 67%$/)
  })

  it('asks for what the level needs where the profile is missing, and has no ladder', () => {
    renderPage('run', makeResult({ activities: [run()] }), { missingAge: 'year of birth' })
    const level = screen.getByRole('region', { name: 'Age grade at threshold' })
    expect(within(level).getByText('Age grades need your year of birth.')).toBeInTheDocument()
    expect(level.querySelector('.level-ladder')).toBeNull()
  })

  it('leaves the level out, and the threshold alone in the card, with nothing to ask for', () => {
    renderPage('run', makeResult({ activities: [run()] }), { missingAge: null })
    expect(screen.queryByRole('region', { name: 'Age grade at threshold' })).toBeNull()
  })

  it('puts the period’s control under the title and one Details last in the page head, above the answer', () => {
    renderPage('run', makeResult({ activities: [run()] }))
    const head = document.querySelector('.sport-page__head')!
    expect([...head.children].map((child) => child.tagName)).toEqual(['H1', 'SPAN', 'DETAILS'])
    expect(head.children[1]).toHaveTextContent('Period picker')
    // Nothing small stands under the title: the recent-form line is in the Details.
    const details = head.lastElementChild!
    expect(details.querySelector('summary')).toHaveTextContent(/^Details$/)
    expect(details.querySelector('.sport-page__form')).toHaveTextContent(/^Last run /)
    expect(head.contains(document.querySelector('.sport-hero'))).toBe(false)
  })
})

describe('the records of the page', () => {
  it('has no strip of tiles, and no empty one, without a record', () => {
    renderPage('ride', makeResult({ activities: [makeActivity({ id: 'r', sport: 'ride' })] }))
    expect(screen.queryByRole('list', { name: 'Best efforts' })).toBeNull()
    expect(document.querySelector('.record-tiles')).toBeNull()
  })
})

describe('the sections and the layout', () => {
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
  /**
   * The sections the page draws an answer for, by their anchors, in the order they are read: a section that is one line
   * of what to add (titled by its own element) is left out.
   */
  const sectionsOf = (sport: Sport) =>
    Array.from(document.querySelectorAll(`[id^="${sport}-section-"]`))
      .map((el) => el.id.slice(`${sport}-section-`.length))
      .filter((id) => !id.endsWith('-title'))
      .filter((id) => document.getElementById(`${sport}-section-${id}-title`) === null)

  it('draws the open sections first and the closed ones after, only what the page has, with no jump list', () => {
    renderPage('run', full(), { zoneTimes: ZONES })
    expect(sectionsOf('run')).toEqual(['bestEfforts', 'racePredictions', 'timeInZones'])
    expect(screen.queryByRole('navigation', { name: 'On this page' })).toBeNull()
  })

  it('leaves out a section the page has nothing for, and race predictions on a ride', () => {
    renderPage('ride', makeResult({ activities: [makeActivity({ id: 'r', sport: 'ride' })] }))
    expect(sectionsOf('ride')).toEqual(['bestEfforts'])
    expect(screen.queryByRole('navigation', { name: 'On this page' })).toBeNull()
  })

  it('sets race predictions and the zones side by side in one row, and every other section alone', () => {
    renderPage('run', full(), { zoneTimes: ZONES })
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
})
