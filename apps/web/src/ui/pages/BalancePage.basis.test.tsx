// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { EffortGate } from '@rca/core/effort'
import { analysisStub } from '../../test/analysisStub'
import { curvePoint } from '../charts/fixtures'
import {
  FIVE_K_IN_20_MIN_WKG,
  MAN_BORN_1986,
  makeEquivalence,
  makeResult,
} from '../components/fixtures'
import { gate, HARD, NO_HEART_RATE } from '../effortGateFixtures'
import { BalancePage } from './BalancePage'

afterEach(cleanup)

/** A run and a ride, both graded, with the gate's answer for each best 20 min. */
function render20(run: EffortGate, ride: EffortGate) {
  const result = makeResult({
    runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
    rideCurve: [curvePoint(HEADLINE_DURATION_S, 400, 'ride-1')],
    equivalents: [makeEquivalence()],
    effortGate: { run, ride },
  })
  render(
    <BalancePage
      analysis={analysisStub()}
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
  return screen.getByRole('heading', { level: 1 }).textContent
}

describe('the balance when a best 20 min was not shown hard', () => {
  it('states the same balance whether the bests were hard or not, and never holds it', () => {
    const hard = render20(HARD, HARD)
    expect(hard).toMatch(/Your balance leans toward|Your running and cycling are in balance/)
    cleanup()
    expect(render20(gate(), gate())).toBe(hard)
    cleanup()
    expect(render20(gate(), HARD)).toBe(hard)
    cleanup()
    expect(render20(HARD, gate())).toBe(hard)
  })

  it('titles the page by the balance, not by what the bests grade', () => {
    const title = render20(gate(), gate())
    expect(title).not.toMatch(/grades|best 20 min|Not enough to compare/)
  })

  it('says nothing of a best that was not all-out, since the grades rest on thresholds and not on a best', () => {
    for (const [run, ride] of [
      [gate(), HARD],
      [HARD, gate()],
      [gate(), gate()],
    ] as const) {
      render20(run, ride)
      expect(screen.queryByText(/all-out/)).not.toBeInTheDocument()
      expect(screen.queryByText(/could be higher/)).not.toBeInTheDocument()
      cleanup()
    }
  })

  it('says nothing of a best that was not checked either: no grade on the page rests on it', () => {
    render20(HARD, NO_HEART_RATE)
    expect(screen.queryByText(/not checked/)).not.toBeInTheDocument()
    expect(screen.queryByText(/No heart rate on your best 20 min/)).not.toBeInTheDocument()
    expect(document.querySelector('.evidence-line')?.textContent).toBe('How sure is this?')
    expect(screen.queryByText('No heart-rate check')).not.toBeInTheDocument()
    expect(screen.queryByText(/Add heart rate to sharpen this/)).not.toBeInTheDocument()
  })

  it('keeps every line of the answer the same whatever the gate said, the level target among them', () => {
    const lines = () =>
      Array.from(document.querySelectorAll('.balance-hero__text p')).map((p) => p.textContent)
    render20(HARD, HARD)
    const hard = lines()
    cleanup()
    render20(gate(), gate())
    expect(lines()).toEqual(hard)
    // The lede says it at threshold.
    expect(hard.join(' ')).toMatch(/at\u00a0threshold|at threshold/)
  })
})
