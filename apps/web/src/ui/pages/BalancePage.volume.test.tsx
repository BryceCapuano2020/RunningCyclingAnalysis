// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../test/deviceZone'
import { DAY_MS } from '@rca/core/constants'
import type { TrendPoint } from '@rca/core/digest'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { SessionState } from '@rca/core/session'
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
const VOLUME = 'Training hours'

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

function renderPage(result: AnalysisResult, trend: TrendPoint[], period?: SessionState['period']) {
  return render(
    <BalancePage
      analysis={analysisStub({ state: { trend, ...(period === undefined ? {} : { period }) } })}
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

/** A chart's figure, found by the line under its title that names its measure; its title says what it found. */
function figureNamed(measure: string | RegExp): HTMLElement {
  const figure = screen
    .getAllByRole('figure')
    .find((candidate) =>
      typeof measure === 'string'
        ? candidate.textContent?.includes(measure)
        : measure.test(candidate.textContent ?? ''),
    )
  if (figure === undefined) throw new Error(`no figure for ${String(measure)}`)
  return figure
}

describe('the weekly volume on Balance', () => {
  it('shows the hours of each sport under its title, with no line about what moved', () => {
    const activities = [
      inWeek(0, 'run', 3600 * 5),
      inWeek(0, 'ride', 3600),
      inWeek(1, 'run', 3600 * 5),
      inWeek(1, 'ride', 3600),
      inWeek(2, 'ride', 3600 * 5),
      inWeek(3, 'ride', 3600 * 6),
    ]
    const { container } = renderPage(makeResult({ activities }), trendOf(4))
    const volume = figureNamed(VOLUME)
    // The strip stands alone: nothing over it draws a trend of best efforts.
    expect(screen.queryByRole('figure', { name: /Age grade of your best/ })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Training hours' })).toHaveClass('sr-only')
    expect(volume.querySelector('figcaption')).toHaveTextContent(/^Training hours$/)
    expect(volume).not.toHaveTextContent(/rose from|fell from|of your running and riding hours/)
    expect(container.querySelectorAll('[data-testid="volume-bar"]')).toHaveLength(6)
  })

  it('draws a bar for each week of the period, to the last the trend’s weeks reach', () => {
    const activities = [
      inWeek(0, 'run', 3600),
      inWeek(2, 'run', 3600),
      inWeek(4, 'run', 3600),
      inWeek(9, 'run', 3600),
    ]
    const { container } = renderPage(makeResult({ activities }), trendOf(5))
    // The fifth week is the last the period reaches, so the activity ten weeks on is not counted.
    expect(container.querySelectorAll('[data-testid="volume-bar"]')).toHaveLength(3)
    // A week with no training is no bar and no mark on the axis: there is no comb of empty weeks.
    expect(container.querySelectorAll('[data-testid="trend-gap"]')).toHaveLength(0)
  })

  it('spans the whole period, though the trend begins later: the hours of its first weeks are bars too', () => {
    // The period starts three weeks before the trend's first point, as a period does when the trend's window cannot
    // reach back before it.
    const activities = [
      inWeek(-3, 'run', 3600 * 2),
      inWeek(-2, 'ride', 3600 * 3),
      inWeek(-1, 'run', 3600 * 2),
      inWeek(0, 'run', 3600 * 5),
      inWeek(1, 'ride', 3600),
      inWeek(2, 'run', 3600 * 4),
    ]
    const period = {
      choice: 'default' as const,
      startMs: FIRST_END - 3 * 7 * DAY_MS - 5 * DAY_MS,
      endMs: FIRST_END + 3 * 7 * DAY_MS,
      days: 84,
      fellBack: false,
    }
    const { container } = renderPage(makeResult({ activities }), trendOf(4), period)
    expect(container.querySelectorAll('[data-testid="volume-bar"]')).toHaveLength(6)
    // The table twin lists them from the week the period starts in, three weeks before the trend's first.
    const rows = within(figureNamed(VOLUME)).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Sun 14 Dec 2025')
    expect(rows[1]).toHaveTextContent('2.0')
    expect(rows).toHaveLength(7)
  })

  it('folds away when fewer than three weeks have training', () => {
    const activities = [inWeek(0, 'run', 3600), inWeek(3, 'ride', 3600)]
    renderPage(makeResult({ activities }), trendOf(5))
    expect(screen.queryByText(VOLUME)).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Training hours' })).toBeNull()
  })
})
