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
  it('asks the worker to mark "Your years" opened, and shows the row as seen once it says so', () => {
    const { result } = ready()
    expect(result.current.checkIn.lookBackSeen).toBeUndefined()
    act(() => result.current.markLookBackSeen('open'))
    expect(worker().posted.at(-1)).toEqual({ type: 'markSeen', row: 'lookBack', event: 'open' })
    act(() => worker().reply({ type: 'checkInSaved', seen: true }))
    expect(result.current.checkIn.lookBackSeen).toBe(true)
    expect(result.current.checkIn.seen).toBe(false)
  })

  it('does the same for the check-in row, apart from the years', () => {
    const { result } = ready()
    act(() => result.current.markCheckInSeen('hide'))
    expect(worker().posted.at(-1)).toEqual({ type: 'markSeen', row: 'checkIn', event: 'hide' })
    act(() => worker().reply({ type: 'checkInSaved', seen: true }))
    expect(result.current.checkIn.seen).toBe(true)
    expect(result.current.checkIn.lookBackSeen).toBeUndefined()
  })
})
