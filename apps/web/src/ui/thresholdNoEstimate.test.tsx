// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PRIORS } from '@rca/core/constants'
import { metabolicToRidePower } from '@rca/core/metabolic'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { CriticalPowerRefusal, Sport } from '@rca/core/types'
import { curvePoint } from './charts/fixtures'
import { makeActivity, makeResult, makeRunThreshold } from './components/fixtures'
import { HARD, UNKNOWN } from './effortGateFixtures'
import { ThresholdPanel } from './pages/ThresholdPanel'
import { ThresholdTile } from './pages/ThresholdTile'
import { hasThreshold, paceFigure, powerFigure, threshold } from './records'
import { thresholdNeedsLine } from './thresholdNeeds'

afterEach(cleanup)

/** A 30 min best, in the fit's unit: the longest of a ride's, which no card prints as a threshold. */
const THIRTY = { durationS: 1800, value: 3.4 }
const MASS_KG = 70
/** The bests each sport holds when it has no estimate: a run's longest is 7 min, under its 8; a ride's are 20 and 30 min. */
const BESTS: Record<Sport, { durationS: number; value: number }[]> = {
  run: [
    { durationS: 300, value: 3.9 },
    { durationS: 420, value: 3.7 },
  ],
  ride: [{ durationS: 1200, value: 3.7 }, THIRTY],
}

/** The sport's own number for a metabolic value, as the card prints it. */
function numberOf(sport: Sport, value: number): string {
  return sport === 'run'
    ? paceFigure(value, 'metric').number
    : powerFigure(metabolicToRidePower(value, MASS_KG, PRIORS.grossEfficiency.mean)).number
}

function tile(sport: Sport, result: AnalysisResult) {
  return render(
    <ThresholdTile
      sport={sport}
      result={result}
      units="metric"
      massKg={MASS_KG}
      grade={null}
      weighted
    />,
  )
}

function panel(sport: Sport, result: AnalysisResult) {
  return render(
    <ThresholdPanel
      sport={sport}
      result={result}
      massKg={MASS_KG}
      units="metric"
      rangeDays={null}
    />,
  )
}

/** A sport with bests that give no threshold estimate and a gate that judged them hard: it still shows no number. */
function noEstimate(sport: Sport) {
  const curve = BESTS[sport].map(({ durationS, value }) => curvePoint(durationS, value, 'a'))
  return makeResult({
    runCp: null,
    rideCp: null,
    runThreshold: null,
    rideThreshold: null,
    runCpRefusal: 'shape',
    rideCpRefusal: 'shape',
    runCurve: curve,
    rideMetabolicCurve: curve,
    effortGate: { run: UNKNOWN, ride: UNKNOWN, [sport]: HARD },
  })
}

/** Each sport with the shortest effort, in minutes, that its estimate reads: a run's from 8 min, a ride's from 3. */
describe.each([
  ['run', 8],
  ['ride', 3],
] as const)('a %s with no threshold estimate', (sport, minutes) => {
  const needs = `Needs an effort of ${minutes} min or longer`
  const heading = `Threshold ${sport === 'run' ? 'pace' : 'power'}`

  it('has no figure or best label to show, whatever the gate says', () => {
    const result = noEstimate(sport)
    expect(hasThreshold(result, sport)).toBe(false)
    expect(threshold(result, sport, MASS_KG, 'metric')).toBeNull()
    expect(thresholdNeedsLine(result, sport)).toBe(needs)
  })

  it(`asks for the one ${minutes} min effort on the tile and the page, with no chip`, () => {
    const { container } = tile(sport, noEstimate(sport))
    expect(container.querySelector('.stat-tile__number')).toBeNull()
    expect(container.textContent).not.toMatch(/At least|Best \d+ min|From your best/)
    expect(screen.getByText(needs)).toBeInTheDocument()
    cleanup()
    const page = panel(sport, noEstimate(sport))
    expect(page.container.querySelector('.sport-hero__number')).toBeNull()
    // The heading is plain: not "at least", and not "best 30 min".
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
    expect(page.container.textContent).not.toMatch(/At least|Best \d+ min|From your best/)
    expect(screen.getByText(needs)).toBeInTheDocument()
  })
})

describe('a run whose critical-power fit is refused', () => {
  const REFUSALS: CriticalPowerRefusal[] = ['shape', 'missing']

  /** A run with an estimate of 16 W/kg beside a refused fit. */
  function refused(refusal: CriticalPowerRefusal, notHard = false) {
    const gate = notHard ? { ...UNKNOWN, verdict: 'notHard' as const, unchecked: null } : HARD
    return makeResult({
      activities: [makeActivity({ id: 'run-1', sport: 'run' })],
      runCp: null,
      runCpRefusal: refusal,
      runThreshold: makeRunThreshold(16),
      effortGate: { run: gate, ride: UNKNOWN },
    })
  }

  it.each(REFUSALS)('%s: the tile shows the estimate, not a best 30 min', (refusal) => {
    const { container } = tile('run', refused(refusal))
    expect(container.querySelector('.stat-tile__number')).toHaveTextContent(numberOf('run', 16))
    expect(container.textContent).not.toContain(numberOf('run', THIRTY.value))
    expect(container.textContent).not.toMatch(/At least|From your best|Needs/)
  })

  it.each(REFUSALS)('%s: the page shows the same estimate under the plain heading', (refusal) => {
    const { container } = panel('run', refused(refusal))
    expect(screen.getByRole('heading', { name: 'Threshold pace' })).toBeInTheDocument()
    expect(container.querySelector('.sport-hero__number')).toHaveTextContent(numberOf('run', 16))
    expect(container.textContent).not.toContain(numberOf('run', THIRTY.value))
    expect(container.textContent).not.toMatch(/At least|From your best|Needs/)
  })

  it('says nothing more for a best that was not all-out: one name, one figure, one basis line', () => {
    const { container } = tile('run', refused('shape', true))
    expect(container.querySelector('.chip')).toBeNull()
    expect(container.querySelector('.stat-tile__effort')).toBeNull()
    expect(screen.queryByRole('button', { name: /all-out|effort/i })).toBeNull()
    expect(container.querySelector('.stat-tile__source')).toHaveTextContent(/^From 3 runs\. /)
    expect(container.textContent).not.toMatch(/Not a hard effort|would give a threshold|\d+%/)
  })
})
