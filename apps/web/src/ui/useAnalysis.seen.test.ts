// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, renderHook } from '@testing-library/react'
import type { AthleteSettings } from '@rca/core/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeWorker } from '../test/fakeWorker'
import { EMPTY_SESSION } from './analysis/model'
import { useAnalysis } from './useAnalysis'

vi.mock(
  './analysis/workerStart',
  async () => (await import('../test/workerStartsAtOnce')).workerStart,
)

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const SIGNED_OUT = { status: 'signed-out' as const, me: null }
const worker = (): FakeWorker => FakeWorker.instances.at(-1)!

beforeEach(() => {
  FakeWorker.instances = []
  vi.stubGlobal('Worker', FakeWorker)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

function ready() {
  const hook = renderHook(() => useAnalysis(SETTINGS, SIGNED_OUT))
  act(() => worker().reply({ type: 'state', state: EMPTY_SESSION }))
  return hook
}

describe('the rows under the fitness card, seen', () => {
  it('asks the worker to mark the lead of "Your years" opened, and says which lead is seen once it says so', () => {
    const { result } = ready()
    expect(result.current.checkIn.lookBackSeenFor).toBeUndefined()
    act(() => result.current.markLookBackSeen('open', 'run:slip-back:2021-05:2022-01'))
    expect(worker().posted.at(-1)).toEqual({
      type: 'markSeen',
      row: 'lookBack',
      event: 'open',
      lead: 'run:slip-back:2021-05:2022-01',
    })
    act(() => worker().reply({ type: 'checkInSaved', seen: true }))
    expect(result.current.checkIn.lookBackSeenFor).toBe('run:slip-back:2021-05:2022-01')
    expect(result.current.checkIn.seen).toBe(false)
  })

  it('does not call a lead seen that the worker has not', () => {
    const { result } = ready()
    act(() => result.current.markLookBackSeen('impression', 'run:slip-back:2021-05:2022-01'))
    act(() => worker().reply({ type: 'checkInSaved', seen: false }))
    expect(result.current.checkIn.lookBackSeenFor).toBeUndefined()
  })

  it('does the same for the check-in row, apart from the years', () => {
    const { result } = ready()
    act(() => result.current.markCheckInSeen('hide'))
    expect(worker().posted.at(-1)).toEqual({ type: 'markSeen', row: 'checkIn', event: 'hide' })
    act(() => worker().reply({ type: 'checkInSaved', seen: true }))
    expect(result.current.checkIn.seen).toBe(true)
    expect(result.current.checkIn.lookBackSeenFor).toBeUndefined()
  })
})
