// @vitest-environment jsdom
import { NO_WINDOW } from '@rca/core/answer'
import 'fake-indexeddb/auto'
import { act, renderHook } from '@testing-library/react'
import { NO_LATE_EVIDENCE } from '@rca/core/digest/lateEvidenceTypes'
import { NO_SAME_HEART_RATE } from '@rca/core/digest/sameHeartRateTypes'
import { NONE_WITHHELD, NO_TRENDS } from '@rca/core/digest/trendPoints'
import { NO_HEART_RATE_JUDGEMENT } from '@rca/core/digest/setAsideTypes'
import { NO_FITNESS } from '@rca/core/fitness/types'
import { NO_LOOKBACK } from '@rca/core/lookback'
import { NO_HISTORY } from '@rca/core/history'
import { NO_ZONE_TIMES } from '@rca/core/zones'
import type { SessionState } from '@rca/core/session'
import type { AthleteSettings } from '@rca/core/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeWorker } from '../test/fakeWorker'
import { EMPTY_PERIOD } from './analysis/model'
import { useAnalysis } from './useAnalysis'
import { openManifestStore } from './importManifestStore'
import type { Me } from '@rca/contract'

import type { RejectedFile } from '@rca/core/session'

vi.mock(
  './analysis/workerStart',
  async () => (await import('../test/workerStartsAtOnce')).workerStart,
)

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const SIGNED_OUT = { status: 'signed-out' as const, me: null }
const ZIP = new File(['x'], 'export.zip')
const ME: Me = {
  user: { id: 'u1', email: 'a@example.com', name: 'Ada', pictureUrl: null },
  profile: {
    massKg: 75,
    bikeMassKg: 9,
    units: 'metric',
    keepFiles: false,
    birthYear: null,
    sex: null,
    updatedAt: 1000,
  },
}

const recordedStates = async () => (await openManifestStore().all()).map(({ state }) => state)

function stateWith(totalActivities: number): SessionState {
  return {
    result: null,
    rejected: [],
    unsupportedFiles: 0,
    isSample: false,
    totalActivities,
    libraryActivities: totalActivities,
    heldOut: [],
    period: EMPTY_PERIOD,
    library: [],
    syncIssues: [],
    outdatedActivities: 0,
    incompatibleActivities: 0,
    hiddenDuplicates: 0,
    answerWindow: NO_WINDOW,
    walkingPaceRuns: 0,
    countedWalkingRuns: [],
    trend: [],
    previous: null,
    change: null,
    effortTrends: NO_TRENDS,
    dotsWithheld: NONE_WITHHELD,
    sameHeartRate: NO_SAME_HEART_RATE,
    lateEvidence: NO_LATE_EVIDENCE,
    heartRateJudgement: NO_HEART_RATE_JUDGEMENT,
    fitness: NO_FITNESS,
    lookBack: NO_LOOKBACK,
    history: NO_HISTORY,
    zoneEstimates: null,
    timeInZones: NO_ZONE_TIMES,
    records: new Map(),
  }
}

function damaged(detail?: string): RejectedFile {
  return {
    fileName: 'export.zip',
    reason: 'Damaged',
    code: 'corrupt',
    ...(detail === undefined ? {} : { detail }),
  }
}

const worker = (): FakeWorker => FakeWorker.instances.at(-1)!

function ready() {
  const hook = renderHook(() => useAnalysis(SETTINGS, SIGNED_OUT))
  act(() => worker().reply({ type: 'state', state: stateWith(0) }))
  return hook
}

const importZip = (result: { current: ReturnType<typeof useAnalysis> }) =>
  act(() => result.current.addFiles([ZIP]))

beforeEach(async () => {
  FakeWorker.instances = []
  vi.stubGlobal('Worker', FakeWorker)
  // The record is kept in the browser: each test starts from none, once the last one's writes have landed.
  await new Promise<void>((resolve) => {
    const gone = indexedDB.deleteDatabase('rca-import-meta')
    gone.onsuccess = () => resolve()
    gone.onerror = () => resolve()
    gone.onblocked = () => resolve()
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the record of an import', () => {
  it('has nothing to say about an import that ran clean', async () => {
    const { result } = ready()
    importZip(result)
    act(() => worker().reply({ type: 'progress', filesRead: 3, filesTotal: 3 }))
    act(() => worker().reply({ type: 'state', state: stateWith(3) }))
    await act(async () => undefined)
    expect(result.current.incompleteImport).toBeNull()
  })

  it('says the library is short when the import found a zip damaged, with how many files it cost', async () => {
    const { result } = ready()
    importZip(result)
    act(() =>
      worker().reply({
        type: 'state',
        state: { ...stateWith(2), rejected: [damaged('40')] },
      }),
    )
    await act(async () => undefined)
    expect(result.current.incompleteImport).toMatchObject({
      state: 'partial-source',
      damaged: [{ name: 'export.zip', lost: 40 }],
    })
  })

  it('says it with no count when the zip’s directory could not say, and ignores a damaged file inside one', async () => {
    const { result } = ready()
    importZip(result)
    act(() =>
      worker().reply({
        type: 'state',
        state: {
          ...stateWith(2),
          rejected: [damaged(), { fileName: 'activities/1.fit', reason: 'x', code: 'corrupt' }],
        },
      }),
    )
    await act(async () => undefined)
    expect(result.current.incompleteImport?.damaged).toEqual([{ name: 'export.zip', lost: null }])
  })

  it('says it stopped, and how far it got, when the worker fails mid-import', async () => {
    const { result } = ready()
    importZip(result)
    act(() => worker().reply({ type: 'progress', filesRead: 12, filesTotal: 30 }))
    act(() => worker().fail())
    await act(async () => undefined)
    expect(result.current.incompleteImport).toMatchObject({
      state: 'interrupted',
      read: 12,
      expected: 30,
    })
  })

  it('says it stopped when the athlete stops it', async () => {
    const { result } = ready()
    importZip(result)
    act(() => worker().reply({ type: 'progress', filesRead: 2, filesTotal: 30 }))
    act(() => result.current.stop())
    await act(async () => undefined)
    expect(result.current.incompleteImport).toMatchObject({ state: 'interrupted', read: 2 })
  })

  it('says it stopped when the import fails', async () => {
    const { result } = ready()
    importZip(result)
    act(() => worker().reply({ type: 'error', message: 'It failed' }))
    await act(async () => undefined)
    expect(result.current.incompleteImport).toMatchObject({ state: 'interrupted' })
  })

  it('does not record the analysis made while the account loads, which is sent again', async () => {
    const { result } = renderHook(() => useAnalysis(SETTINGS, { status: 'loading', me: null }))
    act(() => result.current.addFiles([ZIP]))
    act(() => worker().fail())
    await act(async () => undefined)
    expect(result.current.incompleteImport).toBeNull()
  })

  it('goes when the athlete goes on with what the library holds', async () => {
    const { result } = ready()
    importZip(result)
    act(() => worker().fail())
    await act(async () => undefined)
    expect(result.current.incompleteImport).not.toBeNull()

    act(() => result.current.acceptIncompleteImport())

    expect(result.current.incompleteImport).toBeNull()
  })

  it('goes when everything is removed', async () => {
    const { result } = ready()
    importZip(result)
    act(() => worker().fail())
    await act(async () => undefined)

    act(() => result.current.clear())
    await act(async () => undefined)

    expect(result.current.incompleteImport).toBeNull()
  })

  it('goes when the same files are added again and the import finishes', async () => {
    const { result } = ready()
    importZip(result)
    act(() => worker().fail())
    await act(async () => undefined)
    expect(result.current.incompleteImport).not.toBeNull()

    // The restart reloads the kept library; the athlete adds the same zip again.
    act(() => worker().reply({ type: 'state', state: stateWith(0) }))
    importZip(result)
    act(() => worker().reply({ type: 'state', state: stateWith(5) }))
    await act(async () => undefined)

    expect(result.current.incompleteImport).toBeNull()
  })

  it('says it stopped when a sign-in replaces the worker that was running it', async () => {
    const { result, rerender } = renderHook(({ account }) => useAnalysis(SETTINGS, account), {
      initialProps: {
        account: SIGNED_OUT as { status: 'signed-out' | 'signed-in'; me: Me | null },
      },
    })
    act(() => worker().reply({ type: 'state', state: stateWith(0) }))
    importZip(result)
    act(() => worker().reply({ type: 'progress', filesRead: 4, filesTotal: 30 }))

    rerender({ account: { status: 'signed-in', me: ME } })
    await act(async () => undefined)

    // The record is not left running: its lock would be held and the tab would nag for good.
    expect(await recordedStates()).toEqual(['interrupted'])
  })

  it('does not end the wrong import when the next finishes after one was cut off', async () => {
    const { result } = ready()
    importZip(result)
    act(() => worker().fail())
    await act(async () => undefined)

    act(() => worker().reply({ type: 'state', state: stateWith(0) }))
    importZip(result)
    act(() => worker().reply({ type: 'state', state: stateWith(5) }))
    await act(async () => undefined)

    expect(await recordedStates()).toEqual(['complete'])
  })
})
