// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TrendPoint } from '@rca/core/digest'
import type { AthleteSettings } from '@rca/core/types'
import { analysisStub } from '../test/analysisStub'
import { makeActivity, makeResult } from './components/fixtures'
import { TOPICS } from './components/methodTopics'
import { BalancePage } from './pages/BalancePage'

// The headline length is written once, as HEADLINE_LABEL. A different label must reach every place
// that names it, so a copy change to the constant cannot leave one of them saying the old length.
vi.mock('./grades', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./grades')>()),
  HEADLINE_LABEL: '45 min',
}))
vi.mock('../share/download', () => ({
  canShareImage: vi.fn(() => false),
  canvasFile: vi.fn(async () => new File(['png'], 'card.png', { type: 'image/png' })),
  previewUrl: vi.fn(() => 'blob:preview'),
  releasePreview: vi.fn(),
  saveFile: vi.fn(() => 'saved' as const),
  shareFile: vi.fn(async () => 'shared' as const),
}))
vi.mock('../share/renderCard', () => ({
  loadCardFonts: vi.fn(async () => undefined),
  renderShareCard: vi.fn(() => true),
}))

afterEach(() => {
  cleanup()
})

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const WEEK_END = new Date(2026, 0, 4, 23, 59).getTime()
/** One week with a running value, so the page shows its fitness trend. */
const TREND: TrendPoint[] = [
  {
    endMs: WEEK_END,
    runWkg: 3.4,
    rideWkg: null,
    runCount: 1,
    rideCount: 0,
    runAtMs: WEEK_END,
    rideAtMs: null,
  },
]

describe('the headline length', () => {
  it('is named from HEADLINE_LABEL in the balance hero', () => {
    const activities = [1, 2, 3].flatMap((n) => [
      makeActivity({ id: `run-${n}`, sport: 'run' }),
      makeActivity({ id: `ride-${n}`, sport: 'ride' }),
    ])
    render(
      <BalancePage
        analysis={analysisStub({ state: { trend: TREND } })}
        result={makeResult({
          activities,
          comparison: { prior: [], calibrated: null },
        })}
        settings={SETTINGS}
        units="metric"
        profile={null}
        missingAge="year of birth and sex"
        controls={<span>Period picker</span>}
        weightKnown
        onShowAll={vi.fn()}
      />,
    )

    expect(
      screen.getByText(/Add one run or ride of 45 min or more to compare them\./),
    ).toBeInTheDocument()

    // The method topic no longer names the length: its dots are 5, 20 or 60 minutes, and Balance has no trend of its own.
    expect(TOPICS.find((topic) => topic.id === 'trend')?.title).toBe('Best efforts over time')
  })
})
