// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PRIORS } from '@rca/core/constants'
import { metabolicToRidePower } from '@rca/core/metabolic'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { CriticalPowerRefusal, EffortCheck, Sport } from '@rca/core/types'
import { curvePoint } from './charts/fixtures'
import { makeResult } from './components/fixtures'
import { gate, HARD, UNKNOWN } from './effortGateFixtures'
import { ThresholdPanel } from './pages/ThresholdPanel'
import { ThresholdTile } from './pages/ThresholdTile'
import { hasThreshold, paceFigure, powerFigure, threshold } from './records'
import { bestLabel, floorBasisLine, floorThreshold } from './thresholdFloor'
import { thresholdNeedsLine } from './thresholdNeeds'

afterEach(cleanup)

/** The best 30 minutes the gate hands a card as its floor, in the fit's unit. */
const THIRTY = { durationS: 1800, value: 3.4 }
const TWENTY = { durationS: 1200, value: 3.7 }
const MASS_KG = 70

/** A sport whose threshold is refused for `refusal`, with the gate it would have: not hard for an effort refusal. */
function refused(sport: Sport, refusal: CriticalPowerRefusal, over: Partial<AnalysisResult> = {}) {
  const verdict = refusal === 'effort' ? gate({ share: 0.8 }) : HARD
  const gates = { run: UNKNOWN, ride: UNKNOWN, [sport]: { ...verdict, floor: THIRTY } }
  return makeResult({
    runCp: null,
    rideCp: null,
    runCpRefusal: refusal,
    rideCpRefusal: refusal,
    effortGate: gates,
    ...over,
  })
}

const REFUSALS = ['effort', 'shape', 'missing'] as const
const SPORTS = ['run', 'ride'] as const

/** The sport's own number for a metabolic value, as the card prints it. */
function numberOf(sport: Sport, value: number): string {
  return sport === 'run'
    ? paceFigure(value, 'metric').number
    : powerFigure(metabolicToRidePower(value, MASS_KG, PRIORS.grossEfficiency.mean)).number
}

function tile(sport: Sport, result: AnalysisResult, effort: EffortCheck | null = null) {
  return render(
    <ThresholdTile
      sport={sport}
      result={result}
      units="metric"
      massKg={MASS_KG}
      grade={null}
      weighted
      effort={effort}
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

describe.each(SPORTS)('a %s threshold the analysis refuses', (sport) => {
  const title = `${sport === 'run' ? 'Run' : 'Ride'} threshold`
  const pageTitle = `Threshold ${sport === 'run' ? 'pace' : 'power'}`

  it.each(REFUSALS)(
    '%s: the tile keeps its title and shows the best 30 min as at least',
    (refusal) => {
      const { container } = tile(sport, refused(sport, refusal))
      expect(screen.getByRole('article', { name: title })).toBeInTheDocument()
      expect(container.querySelector('.stat-tile__basis--floor')).toHaveTextContent('At least')
      expect(container.querySelector('.stat-tile__number')).toHaveTextContent(
        numberOf(sport, THIRTY.value),
      )
      expect(screen.getByText('From your best 30 min.')).toBeInTheDocument()
      expect(container.textContent).not.toMatch(/Needs|Best 30 min|reference heart rate|\d%/)
      expect(container.querySelector('.range-track')).toBeNull()
    },
  )

  it.each(REFUSALS)('%s: the page shows the same floor under the threshold heading', (refusal) => {
    const { container } = panel(sport, refused(sport, refusal))
    expect(screen.getByRole('heading', { name: `${pageTitle}, at least` })).toBeInTheDocument()
    expect(container.querySelector('.stat-tile__basis--floor')).toHaveTextContent('At least')
    expect(container.querySelector('.sport-hero__number')).toHaveTextContent(
      numberOf(sport, THIRTY.value),
    )
    expect(screen.getByText('From your best 30 min.')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/Needs|Best 30 min|reference heart rate|\d%/)
  })

  it.each(REFUSALS)(
    '%s: the fitted threshold that zones and predictions read stays empty',
    (refusal) => {
      const result = refused(sport, refusal)
      expect(hasThreshold(result, sport)).toBe(false)
      expect(threshold(result, sport, MASS_KG, 'metric')).toBeNull()
    },
  )

  it('takes the best 20 min when the curve holds no 30 min best', () => {
    const result = refused(sport, 'shape')
    result.effortGate[sport] = { ...HARD, floor: TWENTY }
    expect(floorBasisLine(result, sport)).toBe('From your best 20 min.')
    expect(floorThreshold(result, sport, MASS_KG, 'metric')?.number).toBe(
      numberOf(sport, TWENTY.value),
    )
  })

  it('shows the longest best of 5 to 19 min as that best, with no at least, when nothing reaches 20 min', () => {
    const curve = [curvePoint(180, 4.6, 'a'), curvePoint(480, 4.1, 'a'), curvePoint(720, 3.9, 'a')]
    const result = refused(sport, 'missing', { runCurve: curve, rideMetabolicCurve: curve })
    result.effortGate[sport] = UNKNOWN
    expect(floorThreshold(result, sport, MASS_KG, 'metric')?.number).toBe(numberOf(sport, 3.9))
    expect(bestLabel(result, sport)).toBe('Best 12 min')
    expect(floorBasisLine(result, sport)).toBeNull()
    const { container } = tile(sport, result)
    expect(screen.getByRole('article', { name: title })).toBeInTheDocument()
    expect(container.querySelector('.stat-tile__basis')).toHaveTextContent('Best 12 min')
    expect(container.querySelector('.stat-tile__basis--floor')).toBeNull()
    expect(container.querySelector('.stat-tile__number')).toHaveTextContent(numberOf(sport, 3.9))
    expect(container.textContent).not.toMatch(/At least|From your best|Needs/)
    cleanup()
    const page = panel(sport, result)
    expect(screen.getByRole('heading', { name: `${pageTitle}, best 12 min` })).toBeInTheDocument()
    expect(page.container.querySelector('.stat-tile__basis')).toHaveTextContent('Best 12 min')
    expect(page.container.textContent).not.toMatch(/At least|From your best|Needs/)
  })

  it.each([
    [300, 'Best 5 min'],
    [1140, 'Best 19 min'],
  ])('shows a best of %s s as "%s", the edges of what is shown', (durationS, label) => {
    const curve = [curvePoint(durationS, 3.9, 'a')]
    const result = refused(sport, 'missing', { runCurve: curve, rideMetabolicCurve: curve })
    result.effortGate[sport] = UNKNOWN
    expect(bestLabel(result, sport)).toBe(label)
  })

  it('asks for an effort, with no number, when the longest best is under 5 min', () => {
    const curve = [curvePoint(60, 5.2, 'a'), curvePoint(240, 4.4, 'a')]
    const result = refused(sport, 'missing', { runCurve: curve, rideMetabolicCurve: curve })
    result.effortGate[sport] = UNKNOWN
    expect(floorThreshold(result, sport, MASS_KG, 'metric')).toBeNull()
    expect(bestLabel(result, sport)).toBeNull()
    const { container } = tile(sport, result)
    expect(container.querySelector('.stat-tile__number')).toBeNull()
    expect(screen.getByText('Needs an effort of 20 min or longer')).toBeInTheDocument()
  })

  it('shows no number, and one line of what to add, only for a sport that holds no best', () => {
    const result = refused(sport, 'missing')
    result.effortGate[sport] = UNKNOWN
    expect(floorThreshold(result, sport, MASS_KG, 'metric')).toBeNull()
    expect(floorBasisLine(result, sport)).toBeNull()
    expect(thresholdNeedsLine(result, sport)).toBe('Needs an effort of 20 min or longer')
    const { container } = tile(sport, result)
    expect(screen.getByText('Needs an effort of 20 min or longer')).toBeInTheDocument()
    expect(container.querySelector('.stat-tile__number')).toBeNull()
    cleanup()
    const page = panel(sport, result)
    expect(page.container.querySelector('.sport-hero__number')).toBeNull()
    expect(screen.getByText('Needs an effort of 20 min or longer')).toBeInTheDocument()
  })

  it('says a best that was not all-out in two words beside the floor, with no share and no sentence', () => {
    const check: EffortCheck = {
      durationS: 1200,
      runHrFraction: sport === 'run' ? 0.82 : null,
      rideHrFraction: sport === 'ride' ? 0.82 : null,
    }
    const { container } = tile(sport, refused(sport, 'effort'), check)
    expect(screen.getByRole('button', { name: 'Not all-out' })).toBeInTheDocument()
    // The share is in the chip's definition, which opens from it; the card's own lines carry none.
    const lines = Array.from(container.querySelectorAll('.stat-tile__line'), (n) => n.textContent)
    expect(lines).toEqual(['From your best 30 min.'])
    expect(screen.queryByText(/Not a hard effort|would give a threshold/)).toBeNull()
  })
})
