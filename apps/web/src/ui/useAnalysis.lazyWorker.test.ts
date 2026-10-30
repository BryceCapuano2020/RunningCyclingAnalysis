// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import type { Me } from '@rca/contract'
import type { AthleteSettings } from '@rca/core/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeWorker } from '../test/fakeWorker'
import { setKeptLibraryHinted } from './analysis/keptLibrary'
import type { AccountStatus } from './useAccount'
import { DEVICE_GRACE_MS, useAnalysis } from './useAnalysis'

/*
 * The analysis worker is a separate 350 KB script. A visit that kept nothing has nothing to analyse until
 * someone adds files, so the worker is not created until a request needs it; a browser that kept results
 * starts it with the page. These tests use the real policy (the other hook tests start the worker at once).
 */

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
    updatedAt: 1000,
  },
}

interface Account {
  status: AccountStatus
  me: Me | null
}
const LOADING: Account = { status: 'loading', me: null }
const SIGNED_OUT: Account = { status: 'signed-out', me: null }
const SIGNED_IN: Account = { status: 'signed-in', me: ME }
const FILE = new File(['x'], 'run.fit')

const types = () => FakeWorker.instances.at(-1)?.posted.map((request) => request.type) ?? []

function setup(initial: Account = LOADING) {
  return renderHook(
    ({ account, settings }: { account: Account; settings: AthleteSettings }) =>
      useAnalysis(settings, account),
    { initialProps: { account: initial, settings: SETTINGS } },
  )
}

beforeEach(() => {
  FakeWorker.instances = []
  vi.stubGlobal('Worker', FakeWorker)
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  setKeptLibraryHinted(false)
})

describe('a first visit', () => {
  it('creates no worker while it has nothing to analyse, however the account answers', () => {
    const { rerender } = setup()
    expect(FakeWorker.instances).toHaveLength(0)
    rerender({ account: SIGNED_OUT, settings: SETTINGS })
    act(() => vi.advanceTimersByTime(60_000))
    expect(FakeWorker.instances).toHaveLength(0)
  })

  it('creates the worker for the first files, which read the kept library before they are added', () => {
    const { result } = setup(SIGNED_OUT)
    act(() => result.current.addFiles([FILE]))
    expect(FakeWorker.instances).toHaveLength(1)
    expect(types()).toEqual(['loadDevice', 'addFiles'])
  })

  it('creates the worker for the sample', () => {
    const { result } = setup(SIGNED_OUT)
    act(() => result.current.loadSample())
    expect(FakeWorker.instances).toHaveLength(1)
    expect(types()).toEqual(['loadDevice', 'loadSample'])
  })

  it('creates the worker for files added while the account loads', () => {
    const { result } = setup(LOADING)
    act(() => result.current.addFiles([FILE]))
    expect(FakeWorker.instances).toHaveLength(1)
    expect(types()).toEqual(['addFiles'])
  })

  it('keeps one worker for every request after the first', () => {
    const { result } = setup(SIGNED_OUT)
    act(() => result.current.addFiles([FILE]))
    act(() => result.current.loadSample())
    expect(FakeWorker.instances).toHaveLength(1)
  })

  it('does not create the worker for a change of weight, which waits for the next one', () => {
    const { result, rerender } = setup(SIGNED_OUT)
    rerender({ account: SIGNED_OUT, settings: { massKg: 80, bikeMassKg: 9 } })
    expect(FakeWorker.instances).toHaveLength(0)
    act(() => result.current.addFiles([FILE]))
    expect(types()).toEqual(['loadDevice', 'setSettings', 'addFiles'])
  })

  it('creates the worker to load the account library when someone is signed in', () => {
    const { rerender } = setup(LOADING)
    expect(FakeWorker.instances).toHaveLength(0)
    rerender({ account: SIGNED_IN, settings: SETTINGS })
    expect(FakeWorker.instances).toHaveLength(1)
    expect(types()).toEqual(['loadServer'])
  })
})

describe('a browser that kept results', () => {
  it('creates the worker with the page and loads the kept library after the grace', () => {
    setKeptLibraryHinted(true)
    const { result } = setup(LOADING)
    expect(FakeWorker.instances).toHaveLength(1)
    expect(result.current.restoring).toBe(true)
    act(() => vi.advanceTimersByTime(DEVICE_GRACE_MS))
    expect(types()).toEqual(['loadDevice'])
  })
})
