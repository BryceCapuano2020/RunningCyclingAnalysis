// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PRIORS } from '@rca/core/constants'
import { equivalenceFor, thresholdRunSpeed } from '@rca/core/digest'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { UnitSystem } from '@rca/core/units'
import { paceSeconds } from '@rca/core/units'
import {
  MAN_BORN_1986,
  flatWkg,
  makeActivity,
  makeEquivalence,
  makeResult,
  makeRideThreshold,
  makeRunThreshold,
} from '../components/fixtures'
import { gapOfHeadline } from '../balanceGap'
import { thresholdGrades } from '../thresholdGrade'
import { CrossSportCard } from './CrossSportCard'
import { ThresholdTile } from './ThresholdTile'

afterEach(cleanup)

const MASS_KG = 75

/** A result with a run threshold at this speed and a ride threshold of these watts, the ride's pace priced as the analysis prices it. */
function resultWith(runMs: number, rideW: number): AnalysisResult {
  const rideThreshold = makeRideThreshold(rideW / (PRIORS.grossEfficiency.mean * MASS_KG))
  return makeResult({
    runThreshold: makeRunThreshold(flatWkg(runMs)),
    rideThreshold,
    rideThresholdRunSpeed: thresholdRunSpeed(equivalenceFor(null), rideThreshold, MASS_KG),
  })
}

function renderCard(result: AnalysisResult, units: UnitSystem = 'metric', weighted = true) {
  return render(
    <CrossSportCard result={result} units={units} weighted={weighted} massKg={MASS_KG} />,
  )
}

/** The pace a card prints as its figure, in seconds a kilometre or a mile. */
function printedSeconds(container: HTMLElement): number {
  const [minutes, seconds] = (
    container.querySelector('.stat-tile__number')?.textContent ?? ''
  ).split(':')
  return Number(minutes) * 60 + Number(seconds)
}

describe('CrossSportCard', () => {
  it.each([
    ['metric', '/km'],
    ['imperial', '/mi'],
  ] as const)('sets the %s unit apart from its pace, in its own span', (units, unit) => {
    const { container } = renderCard(resultWith(4, 230), units)
    expect(container.querySelector('.stat-tile__number')?.textContent).toMatch(/^\d+:\d{2}$/)
    expect(container.querySelector('.stat-tile__unit')).toHaveTextContent(unit)
  })

  it('names the ride threshold in watts under the pace, and no best effort or activity', () => {
    const { container } = renderCard(resultWith(4, 230))
    expect(screen.getByText('From your 230 W threshold.')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/for 20 min|Set on|all-out|checked/)
    expect(container.querySelector('a')).toBeNull()
  })

  it('prints the ride threshold’s running equivalent at 60 min', () => {
    const result = resultWith(4, 230)
    const { container } = renderCard(result)
    const speed = result.rideThresholdRunSpeed!.p50
    expect(printedSeconds(container)).toBe(Math.round(paceSeconds(speed, 'metric')))
  })

  it('opens to the pace curve of every duration', () => {
    const { container } = renderCard(
      makeResult({
        ...resultWith(4, 230),
        equivalents: [makeEquivalence({ durationS: 3600, ridePowerW: 220 })],
      }),
    )
    expect(screen.getByText('See the pace curve').closest('details')).not.toBeNull()
    expect(container.querySelector('details')).toHaveTextContent(/1 hour|60 min/)
  })

  it('waits for the weight, and is left out with no ride', () => {
    renderCard(resultWith(4, 230), 'metric', false)
    expect(screen.queryByText(/From your/)).toBeNull()
    cleanup()
    const { container } = renderCard(makeResult({ activities: [makeActivity({ sport: 'run' })] }))
    expect(container).toBeEmptyDOMElement()
  })

  it('asks for the effort the ride threshold needs when the ride has none', () => {
    renderCard(makeResult({ rideThreshold: null, rideThresholdRunSpeed: null }))
    expect(screen.getByText('Needs an effort of 3 min or longer')).toBeInTheDocument()
    expect(screen.queryByText(/From your/)).toBeNull()
  })
})

describe('the ride as a run beside the run threshold, for the lean the grades give', () => {
  /** The pace the Run threshold tile prints, in seconds, and the lean of the grades the page states. */
  function paces(runMs: number, rideW: number) {
    const result = resultWith(runMs, rideW)
    const lean = gapOfHeadline(thresholdGrades(result, MAN_BORN_1986))?.lean
    const card = renderCard(result)
    const ride = printedSeconds(card.container)
    cleanup()
    const tile = render(
      <ThresholdTile
        sport="run"
        result={result}
        units="metric"
        massKg={MASS_KG}
        grade={null}
        weighted
      />,
    )
    const run = printedSeconds(tile.container)
    cleanup()
    return { lean, run, ride }
  }

  it('is slower than the run threshold where the grades lean toward running', () => {
    const { lean, run, ride } = paces(4.4, 150)
    expect(lean).toBe('run')
    expect(ride).toBeGreaterThan(run)
  })

  it('is faster than the run threshold where the grades lean toward cycling', () => {
    const { lean, run, ride } = paces(3.0, 330)
    expect(lean).toBe('ride')
    expect(ride).toBeLessThan(run)
  })

  it('agrees with the lean at every pair of thresholds on a sweep, as the replica’s lean-vs-cards rule reads them', () => {
    for (const runMs of [2.8, 3.2, 3.6, 4.0, 4.4, 4.8]) {
      for (const rideW of [120, 170, 220, 270, 320, 370]) {
        const { lean, run, ride } = paces(runMs, rideW)
        if (lean === 'run') expect(ride, `${runMs} m/s, ${rideW} W`).toBeGreaterThanOrEqual(run - 1)
        if (lean === 'ride') expect(ride, `${runMs} m/s, ${rideW} W`).toBeLessThanOrEqual(run + 1)
      }
    }
  })
})
