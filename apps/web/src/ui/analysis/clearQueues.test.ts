// @vitest-environment jsdom
import { NO_WINDOW } from '@rca/core/answer'
import { act, renderHook } from '@testing-library/react'
import { NO_LATE_EVIDENCE } from '@rca/core/digest/lateEvidenceTypes'
import { NO_SAME_HEART_RATE } from '@rca/core/digest/sameHeartRateTypes'
import { NONE_WITHHELD, NO_TRENDS } from '@rca/core/digest/trendPoints'
import { NO_HEART_RATE_JUDGEMENT } from '@rca/core/digest/setAsideTypes'
import { NO_FITNESS } from '@rca/core/fitness/types'
import { NO_LOOKBACK } from '@rca/core/lookback'
import { NO_ZONE_TIMES } from '@rca/core/zones'
import type { Me } from '@rca/contract'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { FakeWorker } from '../../test/fakeWorker'
import { useAnalysis } from '../useAnalysis'
import { EMPTY_PERIOD } from './model'

vi.mock('./workerStart', async () => (await import('../../test/workerStartsAtOnce')).workerStart)

type Account = Parameters<typeof useAnalysis>[1]
type Settings = Parameters<typeof useAnalysis>[0]

const SETTINGS: Settings = { massKg: 75, bikeMassKg: 9 }
const CHANGED_SETTINGS: Settings = { massKg: 80, bikeMassKg: 9 }
const FILE = new File(['x'], 'run.fit')
const EXPORT_INTERRUPTED = 'The download was interrupted. Download your data again.'

const STATE = {
  result: null,
  rejected: [],
  unsupportedFiles: 0,
  isSample: false,
  totalActivities: 0,
  period: EMPTY_PERIOD,
  library: [],
  syncIssues: [],
  outdatedActivities: 0,
  incompatibleActivities: 0,
  libraryActivities: 0,
  heldOut: [],
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
  zoneEstimates: null,
  timeInZones: NO_ZONE_TIMES,
  records: new Map(),
}

function me(id: string): Me {
  return {
    user: { id, email: `${id}@example.com`, name: id, pictureUrl: null },
    profile: {
      massKg: 75,
      bikeMassKg: 9,
      units: 'metric',
      keepFiles: true,
      birthYear: null,
      sex: null,
      updatedAt: 1000,
    },
  }
}

const LOADING: Account = { status: 'loading', me: null }
const SIGNED_OUT: Account = { status: 'signed-out', me: null }
const SIGNED_IN_A: Account = { status: 'signed-in', me: me('u1') }
const SIGNED_IN_B: Account = { status: 'signed-in', me: me('u2') }

function setup(initial: Account, settings: Settings = SETTINGS) {
  return renderHook(
    ({ account, current }: { account: Account; current: Settings }) =>
      useAnalysis(current, account),
    { initialProps: { account: initial, current: settings } },
  )
}

function worker(): FakeWorker {
  const found = FakeWorker.instances.at(-1)
  if (found === undefined) throw new Error('no worker was created')
  return found
}

/** Fails the worker twice, so it stops for good and a settings change waits in the unsent queue. */
function stopWorkerForGood() {
  act(() => worker().fail())
  act(() => worker().fail())
}

beforeEach(() => {
  FakeWorker.instances = []
  vi.stubGlobal('Worker', FakeWorker)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('stop empties every queue', () => {
  it('drops the files analysed while the account loads, so a visitor who then signs out does not get them again', () => {
    const { result, rerender } = setup(LOADING)
    act(() => result.current.addFiles([FILE]))
    act(() => result.current.stop())

    rerender({ account: SIGNED_OUT, current: SETTINGS })
    expect(worker().posted).toEqual([{ type: 'loadDevice', settings: SETTINGS }])
  })

  it('drops the imports held for a library that is still loading', () => {
    const { result } = setup(SIGNED_IN_A)
    act(() => result.current.addFiles([FILE]))
    act(() => result.current.stop())

    act(() => worker().reply({ type: 'state', state: STATE }))
    expect(worker().posted).toEqual([{ type: 'loadServer', settings: SETTINGS, userId: 'u1' }])
  })

  it('drops the requests queued for a stopped worker', () => {
    const { result, rerender } = setup(SIGNED_OUT)
    stopWorkerForGood()
    rerender({ account: SIGNED_OUT, current: CHANGED_SETTINGS })

    act(() => result.current.stop())
    expect(worker().posted).toEqual([{ type: 'loadDevice', settings: CHANGED_SETTINGS }])
  })

  it('ends the requests the worker still owes, so the page stops being busy', () => {
    const { result } = setup(SIGNED_OUT)
    act(() => worker().reply({ type: 'state', state: STATE }))
    act(() => result.current.addFiles([FILE]))
    expect(result.current.busy).toBe(true)

    act(() => result.current.stop())
    // The replacement worker only reloads the device library, which does not hold the page busy.
    expect(worker().posted).toEqual([{ type: 'loadDevice', settings: SETTINGS }])
    expect(result.current.busy).toBe(false)
  })

  it('ends a pending export', async () => {
    const { result } = setup(SIGNED_IN_A)
    let exported: Promise<Blob> = Promise.resolve(new Blob())
    act(() => {
      exported = result.current.exportData()
    })

    act(() => result.current.stop())
    await expect(exported).rejects.toThrow(EXPORT_INTERRUPTED)
  })
})

describe('an account change empties every queue', () => {
  it('drops the files analysed while the account loads when the account changes', () => {
    const { result, rerender } = setup(LOADING)
    act(() => result.current.addFiles([FILE]))
    rerender({ account: { status: 'signed-in', me: null }, current: SETTINGS })

    rerender({ account: SIGNED_IN_B, current: SETTINGS })
    act(() => worker().reply({ type: 'state', state: STATE }))
    expect(worker().posted).toEqual([{ type: 'loadServer', settings: SETTINGS, userId: 'u2' }])
  })

  it('drops the imports held for the library of the previous account', () => {
    const { result, rerender } = setup(SIGNED_IN_A)
    act(() => result.current.addFiles([FILE]))

    rerender({ account: SIGNED_IN_B, current: SETTINGS })
    act(() => worker().reply({ type: 'state', state: STATE }))
    expect(worker().posted).toEqual([{ type: 'loadServer', settings: SETTINGS, userId: 'u2' }])
  })

  it('drops the requests queued for a stopped worker', () => {
    const { rerender } = setup(SIGNED_IN_A)
    stopWorkerForGood()
    rerender({ account: SIGNED_IN_A, current: CHANGED_SETTINGS })

    rerender({ account: SIGNED_IN_B, current: CHANGED_SETTINGS })
    expect(worker().posted).toEqual([
      { type: 'loadServer', settings: CHANGED_SETTINGS, userId: 'u2' },
    ])
  })

  it('ends a pending export', async () => {
    const { result, rerender } = setup(SIGNED_IN_A)
    let exported: Promise<Blob> = Promise.resolve(new Blob())
    act(() => {
      exported = result.current.exportData()
    })

    rerender({ account: SIGNED_IN_B, current: SETTINGS })
    await expect(exported).rejects.toThrow(EXPORT_INTERRUPTED)
  })
})
