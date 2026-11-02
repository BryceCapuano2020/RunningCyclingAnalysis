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

const RUN_LINE = "Your run best wasn't all-out, so running could be higher."
const RIDE_LINE = "Your ride best wasn't all-out, so cycling could be higher."
const NEITHER_LINE = 'Neither best was all-out.'

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

  it('says under it which best was not all-out, or that neither was', () => {
    render20(gate(), HARD)
    expect(screen.getByText(RUN_LINE)).toBeInTheDocument()
    expect(screen.queryByText(RIDE_LINE)).not.toBeInTheDocument()
    cleanup()
    render20(HARD, gate())
    expect(screen.getByText(RIDE_LINE)).toBeInTheDocument()
    cleanup()
    render20(gate(), gate())
    expect(screen.getByText(NEITHER_LINE)).toBeInTheDocument()
    expect(screen.queryByText(RUN_LINE)).not.toBeInTheDocument()
  })

  it('says nothing when both bests were hard, and keeps the note for one that was not checked', () => {
    render20(HARD, HARD)
    expect(screen.queryByText(/all-out/)).not.toBeInTheDocument()
    cleanup()
    render20(HARD, NO_HEART_RATE)
    expect(screen.queryByText(/all-out/)).not.toBeInTheDocument()
    expect(
      screen.getAllByText(/No heart rate on your best 20 min ride, so the effort was not checked/)
        .length,
    ).toBe(1)
  })

  it('says no heart rate once: under the lede, not again in a line under the tiles', () => {
    render20(HARD, NO_HEART_RATE)
    expect(screen.getAllByText(/^No heart rate on your best 20 min ride/)).toHaveLength(1)
    expect(screen.queryByText('No heart-rate check')).not.toBeInTheDocument()
    expect(screen.queryByText(/Add heart rate to sharpen this/)).not.toBeInTheDocument()
    cleanup()
    // With nothing said under the lede, the line under the tiles still tells files with no heart rate.
    render20(HARD, HARD)
    expect(screen.getByText('No heart-rate check')).toBeInTheDocument()
  })

  it('keeps every other line of the answer, the level target among them', () => {
    const lines = () =>
      Array.from(document.querySelectorAll('.balance-hero__text p')).map((p) => p.textContent)
    render20(HARD, HARD)
    const hard = lines()
    cleanup()
    render20(gate(), gate())
    expect(lines().filter((line) => line !== NEITHER_LINE)).toEqual(hard)
    // The lede and the level target are there to keep.
    expect(hard.length).toBeGreaterThan(1)
  })
})
