// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { Period } from '@rca/core/period'
import type { SportCurves } from '@rca/core/types'
import { analysisStub } from '../../test/analysisStub'
import { changeOf } from '../charts/changeFixtures'
import { curvePoint } from '../charts/fixtures'
import {
  FIVE_K_IN_20_MIN_WKG,
  MAN_BORN_1986,
  makeEquivalence,
  makeResult,
} from '../components/fixtures'
import { BalancePage } from './BalancePage'

afterEach(cleanup)

const result = makeResult({
  runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
  rideCurve: [curvePoint(HEADLINE_DURATION_S, 400, 'ride-1')],
  equivalents: [makeEquivalence()],
})

/** The curves of a period whose 20 minute bests were lower. */
const lower: SportCurves = {
  runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG * 0.9, 'run-0')],
  rideCurve: [curvePoint(HEADLINE_DURATION_S, 360, 'ride-0')],
}

const period = (endMs: number): Period => ({
  choice: 84,
  startMs: endMs - 83 * 86_400_000,
  endMs,
  days: 84,
  fellBack: false,
})

function renderPage(state: NonNullable<Parameters<typeof analysisStub>[0]>['state']) {
  render(
    <BalancePage
      analysis={analysisStub({ state })}
      result={result}
      settings={{ massKg: 75, bikeMassKg: 9 }}
      units="metric"
      profile={MAN_BORN_1986}
      missingAge={null}
      controls={<span>Period picker</span>}
      weightKnown
      onShowAll={vi.fn()}
    />,
  )
}

const END = Date.UTC(2025, 5, 20, 12)

describe('what changed, on a library whose period before holds too little', () => {
  it('compares with the window the session found and names it by its months', () => {
    renderPage({
      period: period(END),
      previous: null,
      change: null,
      earlier: {
        startMs: Date.UTC(2025, 0, 6, 12),
        endMs: Date.UTC(2025, 2, 28, 12),
        previous: lower,
        change: changeOf('higher'),
      },
    })
    const strip = screen.getByRole('region', { name: 'What changed · vs Jan to Mar' })
    expect(strip).toHaveTextContent('Faster 20 min run than Jan to Mar')
    expect(strip).toHaveTextContent('More power over 20 min than Jan to Mar')
    expect(strip).not.toHaveTextContent(/previous 12 weeks|hard effort|not checked/)
  })

  it('writes the year when the window is not in the year of the period', () => {
    renderPage({
      period: period(END),
      previous: null,
      change: null,
      earlier: {
        startMs: Date.UTC(2023, 0, 6, 12),
        endMs: Date.UTC(2023, 2, 28, 12),
        previous: lower,
        change: changeOf('none'),
      },
    })
    expect(screen.getByRole('region', { name: 'What changed · vs Jan to Mar 2023' })).toBeVisible()
    expect(screen.getByText('No clear change from Jan to Mar 2023.')).toBeVisible()
  })

  it('compares with the period before when the session found no earlier window', () => {
    renderPage({ period: period(END), previous: lower, change: changeOf('higher'), earlier: null })
    expect(
      screen.getByRole('region', { name: 'What changed · vs the previous 12 weeks' }),
    ).toHaveTextContent('Faster 20 min run than the previous 12 weeks')
  })

  it('is absent, with no text, when nothing could be tested anywhere', () => {
    renderPage({ period: period(END), previous: null, change: null, earlier: null })
    expect(screen.queryByText(/What changed/)).toBeNull()
    expect(screen.queryByText(/Not enough in the/)).toBeNull()
  })
})
