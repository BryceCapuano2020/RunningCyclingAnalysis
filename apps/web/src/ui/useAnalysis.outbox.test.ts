// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { NO_LATE_EVIDENCE } from '@rca/core/digest/lateEvidenceTypes'
import { NO_SAME_HEART_RATE } from '@rca/core/digest/sameHeartRateTypes'
import { NO_TRENDS } from '@rca/core/digest/trendPoints'
import { NO_HEART_RATE_JUDGEMENT } from '@rca/core/digest/setAsideTypes'
import { NO_FITNESS } from '@rca/core/fitness/types'
import { NO_ZONE_TIMES } from '@rca/core/zones'
import type { Me } from '@rca/contract'
import type { SessionState } from '@rca/core/session'
import type { AthleteSettings } from '@rca/core/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeWorker } from '../test/fakeWorker'
import { EMPTY_PERIOD } from './analysis/model'
import { useAnalysis } from './useAnalysis'

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
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
const SIGNED_IN = { status: 'signed-in' as const, me: ME }

function stateWith(totalActivities: number): SessionState {
  return {
    result: null,
    rejected: [],
    unsupportedFiles: 0,
    isSample: false,
    totalActivities,
    period: EMPTY_PERIOD,
    library: [],
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
    zoneEstimates: null,
    timeInZones: NO_ZONE_TIMES,
    records: new Map(),
  }
}

const worker = (): FakeWorker => FakeWorker.instances.at(-1)!
const types = () => worker().posted.map((request) => request.type)

function ready() {
  const hook = renderHook(() => useAnalysis(SETTINGS, SIGNED_IN))
  act(() => worker().reply({ type: 'state', state: stateWith(0) }))
  return hook
}

/** What the worker says apart from any request, as it does for a resume. */
const apart = (message: Parameters<FakeWorker['reply']>[0]) =>
  act(() => worker().reply(message, {}))

beforeEach(() => {
  FakeWorker.instances = []
  vi.stubGlobal('Worker', FakeWorker)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the saves an earlier visit left behind', () => {
  it('has nothing to show until the worker says it is finishing some', () => {
    const { result } = ready()
    expect(result.current.outbox).toBeNull()
  })

  it('shows how many are left while they are saved, and how it ended', () => {
    const { result } = ready()
    apart({ type: 'outbox', pending: 5, saved: 0, failed: 0, finished: false })
    expect(result.current.outbox).toEqual({ pending: 5, saved: 0, failed: 0, finished: false })

    apart({ type: 'outbox', pending: 0, saved: 4, failed: 1, finished: true })
    expect(result.current.outbox).toEqual({ pending: 0, saved: 4, failed: 1, finished: true })
  })

  it('reads the library again once some were saved, so they show', () => {
    ready()
    const before = types().filter((type) => type === 'loadServer').length

    apart({ type: 'outbox', pending: 0, saved: 3, failed: 0, finished: true })

    expect(types().filter((type) => type === 'loadServer')).toHaveLength(before + 1)
  })

  it('does not read it again when none were saved', () => {
    ready()
    const before = types().length
    apart({ type: 'outbox', pending: 0, saved: 0, failed: 2, finished: true })
    expect(types()).toHaveLength(before)
  })

  it('does not read it again while an import is running', () => {
    const { result } = ready()
    act(() => result.current.addFiles([new File(['x'], 'run.fit')]))
    expect(types()).toContain('addFiles')
    const before = types().filter((type) => type === 'loadServer').length

    apart({ type: 'outbox', pending: 0, saved: 3, failed: 0, finished: true })

    expect(types().filter((type) => type === 'loadServer')).toHaveLength(before)
  })

  it('is replaced by the next import', async () => {
    const { result } = ready()
    apart({ type: 'outbox', pending: 0, saved: 3, failed: 0, finished: true })
    // The library is read again for what was saved; the next import is sent once that read is done.
    act(() => worker().reply({ type: 'state', state: stateWith(3) }))
    expect(result.current.libraryStatus).toBe('loaded')
    act(() => result.current.addFiles([new File(['x'], 'run.fit')]))
    expect(types()).toContain('addFiles')
    await waitFor(() => expect(result.current.outbox).toBeNull())
  })
})
