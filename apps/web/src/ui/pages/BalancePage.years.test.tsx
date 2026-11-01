// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../test/deviceZone'
import { NO_HISTORY } from '@rca/core/history'
import { DAY_MS } from '@rca/core/constants'
import type { AthleteSettings } from '@rca/core/types'
import { analysisStub } from '../../test/analysisStub'
import { PROFILE, balanceRows, TWELVE_YEARS } from '../balanceFixtures'
import { makeActivity, makeResult } from '../components/fixtures'
import { BalancePage } from './BalancePage'

vi.mock('../../share/download', () => ({
  canShareImage: vi.fn(() => false),
  canvasFile: vi.fn(),
  previewUrl: vi.fn(() => 'blob:preview'),
  releasePreview: vi.fn(),
  saveFile: vi.fn(() => 'saved' as const),
  shareFile: vi.fn(async () => 'shared' as const),
}))
vi.mock('../../share/renderCard', () => ({
  loadCardFonts: vi.fn(async () => undefined),
  renderShareCard: vi.fn(() => true),
}))

afterEach(cleanup)

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const FIRST_END = Date.UTC(2026, 0, 4, 23, 59, 59, 999)

function renderPage(balance = balanceRows(TWELVE_YEARS), profile = PROFILE) {
  const trend = [
    {
      endMs: FIRST_END,
      runWkg: 3.4,
      rideWkg: null,
      runCount: 1,
      rideCount: 0,
      runAtMs: FIRST_END,
      rideAtMs: null,
    },
    {
      ...{ endMs: FIRST_END + 7 * DAY_MS },
      runWkg: 3.4,
      rideWkg: null,
      runCount: 1,
      rideCount: 0,
      runAtMs: FIRST_END,
      rideAtMs: null,
    },
  ]
  const activities = [
    makeActivity({ id: 'run-1', sport: 'run', startMs: FIRST_END - 4 * DAY_MS, movingS: 3600 }),
    makeActivity({ id: 'ride-1', sport: 'ride', startMs: FIRST_END - 3 * DAY_MS, movingS: 3600 }),
  ]
  return render(
    <BalancePage
      analysis={analysisStub({ state: { trend, history: { ...NO_HISTORY, balance } } })}
      result={makeResult({ activities })}
      settings={SETTINGS}
      units="metric"
      profile={profile}
      missingAge={null}
      controls={<span>Period picker</span>}
      weightKnown
      onShowAll={vi.fn()}
    />,
  )
}

describe('the Balance over the years on the home page', () => {
  it('sits in the page directly under the hero and the tiles', () => {
    const { container } = renderPage()
    const years = screen.getByRole('figure', { name: 'Running led every year until 2019' })
    const follows = (earlier: HTMLElement) =>
      earlier.compareDocumentPosition(years) & Node.DOCUMENT_POSITION_FOLLOWING
    expect(follows(screen.getByRole('heading', { level: 1 }))).toBeTruthy()
    expect(follows(screen.getByRole('heading', { name: 'Ride on foot' }))).toBeTruthy()
    // Nothing else drawn on the page comes between the tiles and the chart.
    const tiles = container.querySelector('.balance-tiles')
    expect(tiles?.nextElementSibling?.contains(years)).toBe(true)
  })

  it('is left out without a year with a best 20 minutes, with nothing said in its place', () => {
    renderPage([])
    expect(screen.queryByRole('figure', { name: /age grade|led/i })).toBeNull()
  })
})
