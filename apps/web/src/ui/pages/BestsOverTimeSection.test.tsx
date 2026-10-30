// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FLAT_RUN_COST, RESTING_W_PER_KG } from '@rca/core/constants'
import type { TrendPoint } from '@rca/core/digest'
import { NO_TRENDS } from '@rca/core/digest/trendPoints'
import { changeOf } from '../charts/changeFixtures'
import type { CurveRow } from '../charts/curveTable'
import { BestsOverTimeSection } from './BestsOverTimeSection'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const DAY = 86_400_000
const START = Date.UTC(2026, 0, 5)
const point = (week: number, speed: number, atDay: number): TrendPoint => ({
  endMs: START + week * 7 * DAY + 6 * DAY,
  runWkg: RESTING_W_PER_KG + FLAT_RUN_COST * speed,
  rideWkg: null,
  runCount: 1,
  rideCount: 0,
  runAtMs: START + atDay * DAY,
  rideAtMs: null,
  rideRunSpeed: null,
})
const POINTS = [point(0, 3.8, 1), point(1, 4, 9), point(2, 4.1, 16)]
const TRENDS = { ...NO_TRENDS, 300: POINTS, 1200: POINTS, 3600: POINTS }

const row = (durationS: number, value: number, previous: number): CurveRow => ({
  durationS,
  value,
  previous,
  activityId: 'a',
})
const finding = (verdict: Parameters<typeof changeOf>[0]) => ({
  sport: 'run' as const,
  units: 'metric' as const,
  rows: [row(300, 4.4, 4.2), row(1200, 4.0, 3.8)],
  previousLabel: 'Previous 12 weeks',
  change: changeOf(verdict),
})

function renderSection(finding: Parameters<typeof BestsOverTimeSection>[0]['finding']) {
  return render(
    <BestsOverTimeSection
      sport="run"
      trends={TRENDS}
      massKg={70}
      units="metric"
      finding={finding}
    />,
  )
}

describe('BestsOverTimeSection', () => {
  it('is titled by the change test’s finding about the chosen length, against the period named', () => {
    renderSection(finding('higher'))
    expect(
      screen.getByRole('figure', {
        name: '20 min is 13 s/km quicker than the previous 12 weeks',
      }),
    ).toBeInTheDocument()
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Effort length' })).getByRole('radio', {
        name: '5 min',
      }),
    )
    expect(
      screen.getByRole('figure', { name: '5 min is 11 s/km quicker than the previous 12 weeks' }),
    ).toBeInTheDocument()
  })

  it('says no clear change when the test does not call the move, however far the figures are apart', () => {
    renderSection(finding('none'))
    expect(
      screen.getByRole('figure', { name: 'No clear change against the previous 12 weeks' }),
    ).toBeInTheDocument()
  })

  it('names what is drawn, and compares nothing, where the test could not judge the length or there is no period before', () => {
    const { unmount } = renderSection(finding('untested'))
    expect(screen.getByRole('figure', { name: 'Best 20 min runs by day' })).toBeInTheDocument()
    unmount()
    renderSection(null)
    expect(screen.getByRole('figure', { name: 'Best 20 min runs by day' })).toBeInTheDocument()
  })

  it('says no line and no window: nothing about a dip leaving a window', () => {
    const { container } = renderSection(finding('higher'))
    expect(container.textContent).not.toMatch(/leaving the|window/i)
  })
})
