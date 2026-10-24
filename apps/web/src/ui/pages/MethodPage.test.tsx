// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { EffortCheck } from '@rca/core/types'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import {
  curvePoint,
  rideCurveFixture,
  rideMetabolicCurveFixture,
  runCurveFixture,
} from '../charts/fixtures'
import {
  FIVE_K_IN_20_MIN_WKG,
  MAN_BORN_1986,
  comparisonPoint,
  makeResult,
} from '../components/fixtures'
import type { AgeProfile } from '../grades'
import { MethodPage } from './MethodPage'

afterEach(() => {
  cleanup()
})

/** The page's facts about the comparison: the list that holds the model range fact. */
function factsOf(): HTMLElement {
  const list = screen.getByText(/^Running against cycling, 90% model range/).closest('ul')
  if (!list) throw new Error('No facts list')
  return list
}

function renderPage(result: AnalysisResult = makeResult(), profile: AgeProfile | null = null) {
  return render(<MethodPage result={result} units="metric" profile={profile} />)
}

/** A result whose comparison is the 20 minute point, with the given effort check. */
function withEffort(effort: EffortCheck, overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return makeResult({ effort: [effort], ...overrides })
}

describe('MethodPage', () => {
  it('is the page heading, and says how many runs and rides the estimates come from', () => {
    renderPage()

    expect(screen.getByRole('heading', { level: 1, name: 'How sure is this?' })).toHaveAttribute(
      'id',
      'page-heading',
    )
    expect(
      screen.getByText(
        'Every number in the app is an estimate from 1 run and 1 ride in this period. These are the checks behind them.',
      ),
    ).toBeInTheDocument()
  })

  it('states the 90% range, the basis and what the comparison is not', () => {
    renderPage()

    const facts = within(factsOf())
    expect(
      facts.getByText('Running against cycling, 90% model range: +5% to +20%.'),
    ).toBeInTheDocument()
    expect(facts.getByText('Model range based on population assumptions.')).toBeInTheDocument()
    expect(
      facts.getByText(
        'Both sports are put on one energy scale from your own files. It compares your two sports; it does not rank you. The range does not include every source of error.',
      ),
    ).toBeInTheDocument()
  })

  it('says the range was adjusted when the heart-rate comparison is used', () => {
    const point = comparisonPoint()
    renderPage(makeResult({ comparison: { prior: [point], calibrated: [point] } }))

    expect(
      within(factsOf()).getByText('Model range adjusted using your heart-rate data.'),
    ).toBeInTheDocument()
  })

  it('says the heart-rate check could not support an adjustment, and shows the population range', () => {
    const point = comparisonPoint()
    renderPage(
      makeResult({
        comparison: {
          prior: [point],
          calibrated: null,
          calibration: { effectiveSamples: 1, draws: 4000, accepted: false },
        },
      }),
    )

    expect(
      within(factsOf()).getByText(
        'The heart-rate check could not support a reliable adjustment; showing the population-based model range.',
      ),
    ).toBeInTheDocument()
  })

  it('names the heart-rate maxima the best efforts were judged against', () => {
    renderPage(
      makeResult({
        runMaxHeartRate: 188,
        runObservedMaxHeartRate: 188,
        rideMaxHeartRate: 182,
        rideObservedMaxHeartRate: 182,
      }),
    )

    expect(
      within(factsOf()).getByText(
        'Best efforts are judged against running 188 bpm (your highest sustained heart rate); cycling 182 bpm (your highest sustained heart rate).',
      ),
    ).toBeInTheDocument()
  })

  it('says both best efforts were hard, but not that either was all-out', () => {
    renderPage(withEffort({ durationS: 1200, runHrFraction: 0.9, rideHrFraction: 0.95 }))

    expect(
      within(factsOf()).getByText(
        'Both best efforts reached at least 90% of each sport’s heart-rate reference. That makes them hard, but does not prove either was all-out.',
      ),
    ).toBeInTheDocument()
  })

  it('leaves out the hard-efforts fact when either best effort was below 90%', () => {
    renderPage(withEffort({ durationS: 1200, runHrFraction: 0.7, rideHrFraction: 0.95 }))

    expect(screen.queryByText(/does not prove either was all-out/)).not.toBeInTheDocument()
  })

  it('shows no facts when there is no comparison to check', () => {
    renderPage(makeResult({ comparison: { prior: [], calibrated: null } }))

    const section = screen.getByRole('region', { name: 'Running compared with cycling' })
    expect(within(section).queryByRole('list')).not.toBeInTheDocument()
    expect(screen.queryByText(/90% model range/)).not.toBeInTheDocument()
  })

  it('shows the heart-rate check', () => {
    renderPage()

    expect(screen.getByRole('region', { name: 'Heart-rate check' })).toBeInTheDocument()
  })

  it('says how many climbs the virtual power accuracy rests on', () => {
    renderPage()

    expect(screen.getByRole('region', { name: 'Virtual power meter accuracy' })).toBeInTheDocument()
    expect(
      screen.getByText(
        'On 3 climbs, estimated power was within 6% of your power meter on average.',
      ),
    ).toBeInTheDocument()
  })

  it('uses the singular for one climb', () => {
    renderPage(makeResult({ virtualAccuracy: { nSegments: 1, mape: 0.06, bias: 0, segments: [] } }))

    expect(
      screen.getByText('On 1 climb, estimated power was within 6% of your power meter on average.'),
    ).toBeInTheDocument()
  })

  it('keeps the accuracy section but leaves out the sentence when no climb was scored', () => {
    renderPage(makeResult({ virtualAccuracy: { nSegments: 0, mape: 0, bias: 0, segments: [] } }))

    expect(screen.getByRole('region', { name: 'Virtual power meter accuracy' })).toBeInTheDocument()
    expect(screen.queryByText(/estimated power was within/)).not.toBeInTheDocument()
  })

  it('omits the accuracy section when there is no virtual power accuracy', () => {
    renderPage(makeResult({ virtualAccuracy: null }))

    expect(
      screen.queryByRole('region', { name: 'Virtual power meter accuracy' }),
    ).not.toBeInTheDocument()
  })

  it('ends with the methodology', () => {
    renderPage()

    expect(
      screen.getByRole('heading', { level: 2, name: 'How this works and what it assumes' }),
    ).toBeInTheDocument()
  })
})

describe('MethodPage age grading', () => {
  it('puts the age grading method on the page, and the grade it is for when one shows', () => {
    const graded = makeResult({
      runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
    })
    renderPage(graded, MAN_BORN_1986)

    expect(screen.getByRole('region', { name: 'Age grading' })).toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: 'Age grading' })).getByText(
        'Your grades are for a man.',
      ),
    ).toBeInTheDocument()
  })
})

describe('MethodPage energy scale', () => {
  it('puts both sports on one metabolic energy scale, under its own heading', () => {
    renderPage(
      makeResult({
        runCurve: runCurveFixture,
        rideMetabolicCurve: rideMetabolicCurveFixture,
        rideCurve: rideCurveFixture,
      }),
    )
    const section = screen.getByRole('region', { name: 'Both sports on one scale' })
    expect(
      within(section).getByRole('img', {
        name: /^Running and cycling energy rate in W\/kg by duration\./,
      }),
    ).toBeInTheDocument()
    expect(within(section).getByText(/metabolic power a sport costs/)).toBeInTheDocument()
  })
})
