// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { AthleteSettings } from '@rca/core/types'
import { analysisStub } from '../../test/analysisStub'
import { curvePoint } from '../charts/fixtures'
import {
  FIVE_K_IN_20_MIN_WKG,
  MAN_BORN_1986,
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

/**
 * The words on the page, as a reader meets them on opening it: not a drawing's own labels, a definition's note (one press
 * away), screen-reader text, or what a closed disclosure holds beyond its summary.
 */
function wordsOf(container: HTMLElement): string[] {
  const clone = container.cloneNode(true) as HTMLElement
  clone
    .querySelectorAll(
      'svg, script, style, [hidden], .sr-only, .definition__note, dialog:not([open])',
    )
    .forEach((node) => node.remove())
  clone.querySelectorAll('details:not([open])').forEach((details) => {
    for (const child of [...details.children]) if (child.tagName !== 'SUMMARY') child.remove()
  })
  return (clone.textContent ?? '').split(/\s+/).filter((word) => word !== '')
}

describe('the Balance page’s first screen', () => {
  it('stays within its word budget', () => {
    const result = makeResult({
      runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
      rideCurve: [curvePoint(HEADLINE_DURATION_S, 400, 'ride-1')],
      equivalents: [makeEquivalence()],
    })
    const { container } = render(
      <BalancePage
        analysis={analysisStub()}
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
    // Measured on this fixture (a run and a ride, both graded, a profile): 134 words before D4.10's trim, 127 after. The budget
    // is a ratchet: a sentence added to the first screen must take another out.
    expect(wordsOf(container).length).toBeLessThanOrEqual(127)
  })
})
