// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { TrendPoint } from '@rca/core/digest'
import type { AthleteSettings } from '@rca/core/types'
import { analysisStub } from '../../test/analysisStub'
import { wordsOf } from '../../test/wordsOf'
import { curvePoint } from '../charts/fixtures'
import {
  FIVE_K_IN_20_MIN_WKG,
  MAN_BORN_1986,
  makeActivity,
  makeEquivalence,
  makeResult,
} from '../components/fixtures'
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

/** Three weeks of a run and a ride each, on the weeks the trend ends on (UTC Sundays). */
function threeWeeks(): TrendPoint[] {
  return [0, 1, 2].map((week) => {
    const endMs = Date.UTC(2026, 0, 4 + week * 7, 23, 59, 59, 999)
    return {
      endMs,
      runWkg: 3.4,
      rideWkg: 3.5,
      runCount: 1,
      rideCount: 1,
      runAtMs: endMs,
      rideAtMs: endMs,
    }
  })
}

describe('the Balance page’s first screen', () => {
  it('stays within its word budget, and its budget of defined terms', () => {
    const trend = threeWeeks()
    const result = makeResult({
      activities: trend.flatMap((week, i) => [
        makeActivity({ id: `run-${i}`, sport: 'run', startMs: week.endMs - 3 * 86_400_000 }),
        makeActivity({ id: `ride-${i}`, sport: 'ride', startMs: week.endMs - 3 * 86_400_000 }),
      ]),
      runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
      rideCurve: [curvePoint(HEADLINE_DURATION_S, 400, 'ride-1')],
      equivalents: [makeEquivalence()],
    })
    const { container } = render(
      <BalancePage
        analysis={analysisStub({ state: { trend } })}
        result={result}
        settings={SETTINGS}
        units="metric"
        profile={MAN_BORN_1986}
        missingAge={null}
        controls={<span>Period picker</span>}
        weightKnown
        onShowAll={vi.fn()}
      />,
    )
    // Measured on this fixture (both sports graded, a profile, three weeks of training): 155 words and 7 defined terms
    // before D4.10's trim, 135 and 3 after (age grade, range, level). A budget is a ratchet: a sentence added to the first screen takes another out.
    expect(wordsOf(container).length).toBeLessThanOrEqual(135)
    expect(container.querySelectorAll('.definition__term').length).toBeLessThanOrEqual(3)
  })
})
