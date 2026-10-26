// @vitest-environment jsdom
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { curvePoint } from './ui/charts/fixtures'
import {
  FIVE_K_IN_20_MIN_WKG,
  interval,
  makeActivity,
  makeEquivalence,
  makeResult,
} from './ui/components/fixtures'
import { App } from './App'
import { app, resetAppMocks, setAccount, setSession, showResult } from './test/appMocks'

vi.mock('./ui/useAccount', async () => ({
  useAccount: (await import('./test/appMocks')).useAccountMock,
}))
vi.mock('./ui/useAnalysis', async () => ({
  useAnalysis: (await import('./test/appMocks')).useAnalysisMock,
}))
vi.mock('./ui/useSettings', async () => ({
  usePreferences: (await import('./test/appMocks')).usePreferencesMock,
}))
vi.mock('./ui/charts', async () => {
  const { heavyChartStubs } = await import('./test/appMocks')
  const { TrendChart } = await import('./ui/charts/TrendChart')
  return { ...heavyChartStubs, TrendChart }
})

const RIDE_START = Date.UTC(2026, 0, 5, 7, 30)

/** A result that grades both sports at the headline duration: the run at 5 km in 20 minutes, the ride at `rideSpeedMs`. */
function gradedResult(rideSpeedMs: number) {
  return makeResult({
    activities: [
      makeActivity({ id: 'run-1', sport: 'run' }),
      makeActivity({ id: 'ride-1', sport: 'ride', name: 'Hill ride', startMs: RIDE_START }),
    ],
    runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
    rideCurve: [curvePoint(HEADLINE_DURATION_S, 400, 'ride-1')],
    equivalents: [
      makeEquivalence({
        durationS: HEADLINE_DURATION_S,
        runSpeed: interval(rideSpeedMs, rideSpeedMs, rideSpeedMs),
      }),
    ],
  })
}

beforeEach(() => {
  resetAppMocks()
})

describe('the import summary for an athlete with a birth year, a sex and a weight', () => {
  it('says how the balance moved in points, not in energy', () => {
    setAccount('signed-out')
    app.preferences = {
      ...app.preferences,
      settings: { massKg: 75, bikeMassKg: 9 },
      birthYear: 1986,
      sex: 'male',
      setupDone: true,
      units: 'metric',
    }
    const before = gradedResult(3.8)
    const after = gradedResult(3.5)
    const outcome = {
      activities: 1,
      rejected: 0,
      duplicates: [],
      runs: 0,
      rides: 1,
      firstStartMs: RIDE_START,
      lastStartMs: RIDE_START,
    }
    app.analysis.importOutcome = outcome
    app.analysis.importChange = { outcome, before, after }
    showResult(after)

    render(<App />)

    expect(
      screen.getByText(
        /^Your balance now leans more toward running \(\d+ points? → \d+ points?\)$/,
      ),
    ).toBeInTheDocument()
  })

  it('leaves the balance line out of the summary while no weight is entered', () => {
    setAccount('signed-out')
    app.preferences = {
      ...app.preferences,
      settings: { massKg: null, bikeMassKg: 9 },
      birthYear: 1986,
      sex: 'male',
      setupDone: true,
      units: 'metric',
    }
    const before = gradedResult(3.8)
    const after = gradedResult(3.5)
    const outcome = {
      activities: 1,
      rejected: 0,
      duplicates: [],
      runs: 0,
      rides: 1,
      firstStartMs: RIDE_START,
      lastStartMs: RIDE_START,
    }
    app.analysis.importOutcome = outcome
    app.analysis.importChange = { outcome, before, after }
    showResult(after)

    render(<App />)

    expect(screen.getByText(/^Added 1 ride/)).toBeInTheDocument()
    expect(screen.queryByText(/Your balance now leans/)).toBeNull()
  })
})

describe('the sample athlete with no weight entered', () => {
  it('shows its balance, since the sample carries its own weight', () => {
    setAccount('signed-out')
    app.preferences = {
      ...app.preferences,
      settings: { massKg: null, bikeMassKg: 9 },
      setupDone: true,
    }
    setSession({ isSample: true })
    showResult(makeResult())

    render(<App />)

    expect(
      screen.getByRole('heading', { level: 1, name: 'Your balance leans toward running' }),
    ).toBeInTheDocument()
  })
})
