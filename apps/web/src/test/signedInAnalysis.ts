import { act, renderHook } from '@testing-library/react'
import { NO_LATE_EVIDENCE } from '@rca/core/digest/lateEvidenceTypes'
import { NO_SAME_HEART_RATE } from '@rca/core/digest/sameHeartRateTypes'
import { NO_TRENDS } from '@rca/core/digest/trendPoints'
import { NO_HEART_RATE_JUDGEMENT } from '@rca/core/digest/setAsideTypes'
import { NO_FITNESS } from '@rca/core/fitness/types'
import { NO_LOOKBACK } from '@rca/core/lookback'
import { NO_ZONE_TIMES } from '@rca/core/zones'
import type { Me } from '@rca/contract'
import type { SessionState } from '@rca/core/session'
import type { AthleteSettings } from '@rca/core/types'
import { afterEach, beforeEach, vi } from 'vitest'
import { EMPTY_PERIOD } from '../ui/analysis/model'
import { useAnalysis } from '../ui/useAnalysis'
import { FakeWorker } from './fakeWorker'

export const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const ME: Me = {
  user: { id: 'u1', email: 'a@example.com', name: 'Ada', pictureUrl: null },
  profile: {
    massKg: 75,
    bikeMassKg: 9,
    units: 'metric',
    keepFiles: false,
    birthYear: null,
    sex: null,
    updatedAt: 1,
  },
}
export const SIGNED_IN = { status: 'signed-in' as const, me: ME }

export function stateWith(totalActivities: number): SessionState {
  return {
    result: null,
    rejected: [],
    unsupportedFiles: 0,
    isSample: false,
    totalActivities,
    period: EMPTY_PERIOD,
    library: [],
    libraryActivities: 0,
    heldOut: [],
    syncIssues: [],
    outdatedActivities: 0,
    incompatibleActivities: 0,
    hiddenDuplicates: 0,
    walkingPaceRuns: 0,
    countedWalkingRuns: [],
    trend: [],
    previous: null,
    change: null,
    effortTrends: NO_TRENDS,
    sameHeartRate: NO_SAME_HEART_RATE,
    lateEvidence: NO_LATE_EVIDENCE,
    heartRateJudgement: NO_HEART_RATE_JUDGEMENT,
    fitness: NO_FITNESS,
    lookBack: NO_LOOKBACK,
    zoneEstimates: null,
    timeInZones: NO_ZONE_TIMES,
    records: new Map(),
  }
}

export const worker = (): FakeWorker => FakeWorker.instances.at(-1)!
export const types = () => worker().posted.map((request) => request.type)

export function ready() {
  const hook = renderHook(() => useAnalysis(SETTINGS, SIGNED_IN))
  act(() => worker().reply({ type: 'state', state: stateWith(0) }))
  return hook
}

/** What the worker says apart from any request, as it does for a resume. */
export const apart = (message: Parameters<FakeWorker['reply']>[0]) =>
  act(() => worker().reply(message, {}))

/** Gives each test a fresh fake worker. Call it from a describe. */
export function stubFakeWorker(): void {
  beforeEach(() => {
    FakeWorker.instances = []
    vi.stubGlobal('Worker', FakeWorker)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })
}
