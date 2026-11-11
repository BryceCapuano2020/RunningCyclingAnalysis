// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import type { Me } from '@rca/contract'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeBroadcastChannel } from '../../test/fakeBroadcastChannel'
import { resetTabSync } from '../tabSync'
import type { Account } from './model'
import { RELOAD_DEBOUNCE_MS, useLibraryTabs } from './libraryTabs'

const SETTINGS = { massKg: 75, bikeMassKg: 9 }
const meWith = (libraryRevision: string): Me => ({
  user: { id: 'u1', email: 'a@example.com', name: 'Ada', pictureUrl: null },
  profile: {
    massKg: 75,
    bikeMassKg: 9,
    units: 'metric',
    keepFiles: true,
    birthYear: null,
    sex: null,
    updatedAt: 1,
  },
  libraryRevision,
})

function setVisibility(state: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
}

let otherTab: FakeBroadcastChannel
let sent: unknown[]

beforeEach(() => {
  vi.useFakeTimers()
  FakeBroadcastChannel.reset()
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
  resetTabSync()
  otherTab = FakeBroadcastChannel.other('rca-sync-v1')
  sent = []
  otherTab.onmessage = (event) => sent.push(event.data)
})

afterEach(() => {
  resetTabSync()
  setVisibility('visible')
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

interface Setup {
  account: Account
  libraryStatus?: 'loaded' | 'loading'
  busy?: boolean
}

function setup({ account, libraryStatus = 'loaded', busy = false }: Setup) {
  const send = vi.fn(() => true)
  const loadLibrary = vi.fn()
  const accountRef = { current: account }
  const props = { busy, libraryStatus }
  const hook = renderHook(
    (current: typeof props) =>
      useLibraryTabs({
        accountRef,
        settingsRef: { current: SETTINGS },
        send,
        libraryStatus: current.libraryStatus,
        loadLibrary,
        busy: current.busy,
      }),
    { initialProps: props },
  )
  return { ...hook, send, loadLibrary, accountRef, props }
}

const signedOut: Account = { status: 'signed-out', me: null }
const signedIn = (revision: string, refreshesTo: string = revision): Account => ({
  status: 'signed-in',
  me: meWith(revision),
  refresh: vi.fn(async () => meWith(refreshesTo)),
})
const settle = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(RELOAD_DEBOUNCE_MS)
  })
}

describe('the library kept in this browser', () => {
  it('is read again, once, a moment after other tabs change it', async () => {
    const { send } = setup({ account: signedOut })

    act(() => otherTab.postMessage({ type: 'library', scope: 'device' }))
    act(() => otherTab.postMessage({ type: 'library', scope: 'device' }))
    expect(send).not.toHaveBeenCalled()
    await settle()

    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'loadDevice', reload: true }))
  })

  it('is left alone when the tab is signed in, whose library is the account’s', async () => {
    const { send } = setup({ account: signedIn('1.10') })
    act(() => otherTab.postMessage({ type: 'library', scope: 'device' }))
    await settle()
    expect(send).not.toHaveBeenCalled()
  })

  it('waits for the tab to come into view', async () => {
    const { send } = setup({ account: signedOut })
    setVisibility('hidden')
    act(() => otherTab.postMessage({ type: 'library', scope: 'device' }))
    await settle()
    expect(send).not.toHaveBeenCalled()

    setVisibility('visible')
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    await settle()

    expect(send).toHaveBeenCalledTimes(1)
  })

  it('waits for the tab’s own work to end, and does not cut across it', async () => {
    const { send, rerender, props } = setup({ account: signedOut, busy: true })
    act(() => otherTab.postMessage({ type: 'library', scope: 'device' }))
    await settle()
    await settle()
    expect(send).not.toHaveBeenCalled()

    rerender({ ...props, busy: false })
    await settle()

    expect(send).toHaveBeenCalledTimes(1)
  })

  it('gives up after waiting five times for a tab that stays busy', async () => {
    const { send } = setup({ account: signedOut, busy: true })
    act(() => otherTab.postMessage({ type: 'library', scope: 'device' }))
    for (let i = 0; i < 8; i++) await settle()
    expect(send).not.toHaveBeenCalled()
  })
})

describe('the account’s library', () => {
  it('is read again when another tab says it changed', async () => {
    const { loadLibrary } = setup({ account: signedIn('1.10', '1.10') })
    act(() => otherTab.postMessage({ type: 'library', scope: 'account' }))
    await settle()
    expect(loadLibrary).toHaveBeenCalledWith('u1')
  })

  it('is not looked for on coming back into view: the results are asked for by their own hook, and /api/me is not polled', async () => {
    const account = signedIn('1.10', '3.30')
    const { loadLibrary } = setup({ account })
    for (let i = 0; i < 3; i++) {
      setVisibility('hidden')
      act(() => document.dispatchEvent(new Event('visibilitychange')))
      setVisibility('visible')
      act(() => document.dispatchEvent(new Event('visibilitychange')))
      await act(async () => void (await vi.advanceTimersByTimeAsync(30_000)))
      await settle()
    }
    expect(loadLibrary).not.toHaveBeenCalled()
    expect(account.refresh).not.toHaveBeenCalled()
  })

  it('does not take this tab’s own change for another’s, and tells the others', async () => {
    const { result, loadLibrary } = setup({ account: signedIn('1.10', '2.20') })
    await act(async () => {
      result.current.libraryChanged('account')
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(sent).toContainEqual({ type: 'library', scope: 'account' })
    await settle()
    expect(loadLibrary).not.toHaveBeenCalled()
  })

  it('is not read while it is still loading', async () => {
    const { loadLibrary } = setup({ account: signedIn('1.10', '2.20'), libraryStatus: 'loading' })
    act(() => otherTab.postMessage({ type: 'library', scope: 'account' }))
    await settle()
    expect(loadLibrary).not.toHaveBeenCalled()
  })
})
