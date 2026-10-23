import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as trend from './digest/trend'
import { AnalysisSession } from './session'
import { sampleDataset } from './synthetic'
import { digestActivity } from './digest'
import type { AthleteSettings } from './types'

vi.mock('./digest/trend', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./digest/trend')>()
  return { ...actual, fitnessTrend: vi.fn(actual.fitnessTrend) }
})

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const fitnessTrend = vi.mocked(trend.fitnessTrend)

describe('AnalysisSession trend', () => {
  beforeEach(() => {
    fitnessTrend.mockClear()
  })

  it('does not recompute the trend when only the period changes', () => {
    const session = new AnalysisSession()
    session.loadSample(SETTINGS)
    const computed = fitnessTrend.mock.calls.length
    expect(computed).toBeGreaterThan(0)

    session.setRange(42, SETTINGS)
    session.setRange(null, SETTINGS)
    session.setRange(6 * 7, SETTINGS)
    expect(fitnessTrend.mock.calls.length).toBe(computed)
  })

  it('reuses the trend for equal settings, and recomputes when mass changes', () => {
    const session = new AnalysisSession()
    session.loadSample(SETTINGS)
    const computed = fitnessTrend.mock.calls.length

    session.setSettings({ ...SETTINGS })
    expect(fitnessTrend.mock.calls.length).toBe(computed)

    const state = session.setSettings({ ...SETTINGS, massKg: 80 })
    expect(fitnessTrend.mock.calls.length).toBe(computed + 1)
    expect(state.trend).toEqual(
      trend.fitnessTrend(sampleDataset().activities.map(digestActivity), {
        ...SETTINGS,
        massKg: 80,
      }),
    )
  })

  it('recomputes when the library changes', () => {
    const session = new AnalysisSession()
    session.loadSample(SETTINGS)
    const computed = fitnessTrend.mock.calls.length

    session.loadDigests(sampleDataset().activities.slice(0, 3).map(digestActivity), SETTINGS)
    expect(fitnessTrend.mock.calls.length).toBe(computed + 1)
  })
})
