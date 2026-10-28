// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DAY_MS } from '@rca/core/constants'
import type { TrendPoint } from '@rca/core/digest'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { AthleteSettings } from '@rca/core/types'
import { analysisStub } from '../../test/analysisStub'
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

afterEach(() => {
  cleanup()
})

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
/** Sunday 4 January 2026, 23:59:59.999 UTC: the end of the first week, as the trend dates its weeks. */
const FIRST_END = Date.UTC(2026, 0, 4, 23, 59, 59, 999)
const VOLUME = 'Training hours per week'

/** Weeks of running with a trend value each, ending on consecutive UTC Sundays. */
function trendOf(weeks: number): TrendPoint[] {
  return Array.from({ length: weeks }, (_, index) => {
    const endMs = FIRST_END + index * 7 * DAY_MS
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

/** An activity on the Wednesday of week `week` (0 is the week ending FIRST_END). */
function inWeek(week: number, sport: 'run' | 'ride', movingS: number) {
  return makeActivity({
    id: `${sport}-${week}-${movingS}`,
    sport,
    startMs: FIRST_END - 4 * DAY_MS + week * 7 * DAY_MS,
    movingS,
  })
}

function renderPage(result: AnalysisResult, trend: TrendPoint[]) {
  return render(
    <BalancePage
      analysis={analysisStub({ state: { trend } })}
      result={result}
      settings={SETTINGS}
      units="metric"
      profile={null}
      missingAge="year of birth and sex"
      controls={<span>Period picker</span>}
      weightKnown
      onShowAll={vi.fn()}
    />,
  )
}

describe('the weekly volume under the Balance trend', () => {
  it('shows the hours of each sport under the trend, with a line that says what moved', () => {
    const activities = [
      inWeek(0, 'run', 3600 * 5),
      inWeek(0, 'ride', 3600),
      inWeek(1, 'run', 3600 * 5),
      inWeek(1, 'ride', 3600),
      inWeek(2, 'ride', 3600 * 5),
      inWeek(3, 'ride', 3600 * 6),
    ]
    const { container } = renderPage(makeResult({ activities }), trendOf(4))
    const trend = screen.getByRole('figure', { name: /of your best 20 min, trailing/ })
    const volume = screen.getByRole('figure', { name: VOLUME })
    expect(trend.compareDocumentPosition(volume) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(
      within(volume).getByText(
        'Cycling rose from 17% of your running and riding hours in the first half to 100% in the second.',
      ),
    ).toBeInTheDocument()
    expect(container.querySelectorAll('[data-testid="volume-bar"]')).toHaveLength(6)
  })

  it('draws a bar for each week of the trend, so the two share their weeks', () => {
    const activities = [
      inWeek(0, 'run', 3600),
      inWeek(2, 'run', 3600),
      inWeek(4, 'run', 3600),
      inWeek(9, 'run', 3600),
    ]
    const { container } = renderPage(makeResult({ activities }), trendOf(5))
    // The fifth week is the last the trend draws, so the activity ten weeks on is not counted.
    expect(container.querySelectorAll('[data-testid="volume-bar"]')).toHaveLength(3)
    expect(container.querySelectorAll('[data-testid="trend-gap"]').length).toBeGreaterThanOrEqual(2)
  })

  it('folds away when fewer than three weeks have training', () => {
    const activities = [inWeek(0, 'run', 3600), inWeek(3, 'ride', 3600)]
    renderPage(makeResult({ activities }), trendOf(5))
    expect(screen.queryByRole('figure', { name: VOLUME })).toBeNull()
    expect(
      screen.getByRole('figure', { name: /of your best 20 min, trailing/ }),
    ).toBeInTheDocument()
  })
})
