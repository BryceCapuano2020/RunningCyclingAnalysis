// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import type { Me } from '@rca/contract'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api/client'
import { ApiRequestError } from '../api/client'
import { FakeBroadcastChannel } from '../test/fakeBroadcastChannel'
import { resetTabSync } from './tabSync'
import { useAccount } from './useAccount'

vi.mock('../worker/deleteAccountDetails', () => ({ deleteAccountDetails: vi.fn(async () => null) }))
vi.mock('../worker/sweepAccountDetails', () => ({ sweepAccountDetails: vi.fn(async () => {}) }))
vi.mock('../worker/forgetAccountDetails', () => ({
  forgetAccountDetails: vi.fn(async () => null),
}))
vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>()
  return {
    ApiRequestError: actual.ApiRequestError,
    signInUrl: actual.signInUrl,
    getMe: vi.fn(),
    logout: vi.fn(),
    deleteAccount: vi.fn(),
    updateProfile: vi.fn(),
  }
})

const mocked = vi.mocked(api)
const ME: Me = {
  user: { id: 'u1', email: 'a@example.com', name: 'Ada', pictureUrl: null },
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

let otherTab: FakeBroadcastChannel
let sent: unknown[]

beforeEach(() => {
  FakeBroadcastChannel.reset()
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
  resetTabSync()
  otherTab = FakeBroadcastChannel.other('rca-sync-v1')
  sent = []
  otherTab.onmessage = (event) => sent.push(event.data)
  mocked.getMe.mockReset()
  mocked.logout.mockReset().mockResolvedValue(undefined)
  mocked.deleteAccount.mockReset().mockResolvedValue(undefined)
  mocked.updateProfile.mockReset()
})

afterEach(() => {
  resetTabSync()
  vi.unstubAllGlobals()
})

async function signedIn() {
  mocked.getMe.mockResolvedValue(ME)
  const hook = renderHook(() => useAccount())
  await waitFor(() => expect(hook.result.current.status).toBe('signed-in'))
  return hook
}

describe('what this tab tells the others', () => {
  it('says a profile was saved', async () => {
    const { result } = await signedIn()
    mocked.updateProfile.mockResolvedValue({ ...ME.profile, units: 'imperial' })

    await act(async () => {
      await result.current.updateProfile({ units: 'imperial' })
    })

    expect(sent).toContainEqual({ type: 'profile' })
  })

  it('says it signed out, and that it deleted the account', async () => {
    const first = await signedIn()
    await act(async () => first.result.current.signOut())
    expect(sent).toContainEqual({ type: 'account', change: 'signed-out' })

    sent.length = 0
    const second = await signedIn()
    await act(async () => second.result.current.deleteAccount())
    expect(sent).toContainEqual({ type: 'account', change: 'deleted' })
  })

  it('says the session ended when the server refuses it', async () => {
    const { result } = await signedIn()
    act(() => result.current.markExpired())
    expect(sent).toContainEqual({ type: 'account', change: 'expired' })
  })
})

describe('what this tab does when another tab speaks', () => {
  it('reads the profile again when another tab saved it', async () => {
    const { result } = await signedIn()
    mocked.getMe.mockResolvedValue({ ...ME, profile: { ...ME.profile, units: 'imperial' } })

    act(() => otherTab.postMessage({ type: 'profile' }))

    await waitFor(() => expect(result.current.me?.profile.units).toBe('imperial'))
  })

  it('does not ask for a profile when nobody is signed in here', async () => {
    mocked.getMe.mockResolvedValue(null)
    const { result } = renderHook(() => useAccount())
    await waitFor(() => expect(result.current.status).toBe('signed-out'))
    const calls = mocked.getMe.mock.calls.length

    act(() => otherTab.postMessage({ type: 'profile' }))

    expect(mocked.getMe.mock.calls.length).toBe(calls)
  })

  it('says why the account is gone when another tab signed out', async () => {
    const { result } = await signedIn()
    mocked.getMe.mockResolvedValue(null)

    act(() => otherTab.postMessage({ type: 'account', change: 'signed-out' }))

    await waitFor(() => expect(result.current.status).toBe('signed-out'))
    await waitFor(() => expect(result.current.error).toMatch(/signed out in another tab/))
    expect(result.current.sessionExpired).toBe(true)
  })

  it('says so when another tab deleted the account, and when it found the session ended', async () => {
    const first = await signedIn()
    mocked.getMe.mockResolvedValue(null)
    act(() => otherTab.postMessage({ type: 'account', change: 'deleted' }))
    await waitFor(() => expect(first.result.current.error).toMatch(/deleted in another tab/))

    const second = await signedIn()
    mocked.getMe.mockResolvedValue(null)
    act(() => otherTab.postMessage({ type: 'account', change: 'expired' }))
    await waitFor(() => expect(second.result.current.error).toMatch(/session ended/))
  })

  it('takes up a different account another tab signed in, without an error', async () => {
    const { result } = await signedIn()
    mocked.getMe.mockResolvedValue({ ...ME, user: { ...ME.user, id: 'u2' } })

    act(() => otherTab.postMessage({ type: 'account', change: 'signed-out' }))

    await waitFor(() => expect(result.current.me?.user.id).toBe('u2'))
    expect(result.current.error).toBeNull()
  })
})

/** Makes the tab hidden or visible, as the browser reports it. */
function setVisibility(state: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
}

describe('a tab that is out of view', () => {
  afterEach(() => setVisibility('visible'))

  it('waits to read the account until it is in view, and then reads it once', async () => {
    const { result } = await signedIn()
    const calls = mocked.getMe.mock.calls.length
    mocked.getMe.mockResolvedValue(null)
    setVisibility('hidden')

    act(() => otherTab.postMessage({ type: 'account', change: 'signed-out' }))
    act(() => otherTab.postMessage({ type: 'account', change: 'signed-out' }))
    expect(mocked.getMe.mock.calls.length).toBe(calls)

    setVisibility('visible')
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    await waitFor(() => expect(result.current.error).toMatch(/signed out in another tab/))
    expect(mocked.getMe.mock.calls.length).toBe(calls + 1)
  })

  it('keeps the notice that another tab signed out when it comes back into view', async () => {
    // The probe: the notice is set while the tab is out of view, and the check on coming back must not wipe it.
    vi.useFakeTimers()
    try {
      mocked.getMe.mockResolvedValue(ME)
      const { result } = renderHook(() => useAccount())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(result.current.status).toBe('signed-in')
      mocked.getMe.mockResolvedValue(null)
      setVisibility('hidden')
      act(() => otherTab.postMessage({ type: 'account', change: 'signed-out' }))
      setVisibility('visible')

      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'))
        await vi.advanceTimersByTimeAsync(0)
      })
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'))
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(result.current.status).toBe('signed-out')
      expect(result.current.error).toMatch(/signed out in another tab/)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not read the account for a tab that holds none, however often others speak', async () => {
    mocked.getMe.mockResolvedValue(null)
    const { result } = renderHook(() => useAccount())
    await waitFor(() => expect(result.current.status).toBe('signed-out'))
    const calls = mocked.getMe.mock.calls.length

    act(() => otherTab.postMessage({ type: 'account', change: 'signed-out' }))
    act(() => otherTab.postMessage({ type: 'account', change: 'deleted' }))

    expect(mocked.getMe.mock.calls.length).toBe(calls)
  })

  it('says so when it cannot confirm the account after another tab changed it', async () => {
    const { result } = await signedIn()
    mocked.getMe.mockRejectedValue(new ApiRequestError(0, 'network_error', 'Offline'))

    act(() => otherTab.postMessage({ type: 'profile' }))

    await waitFor(() => expect(result.current.error).toMatch(/Could not confirm your account/))
    expect(result.current.status).toBe('signed-in')
  })
})

describe('coming back to a signed-out tab', () => {
  afterEach(() => setVisibility('visible'))

  it('looks for a sign-in made elsewhere only once in view, and at most every 30 seconds', async () => {
    vi.useFakeTimers()
    try {
      mocked.getMe.mockResolvedValue(null)
      const { result } = renderHook(() => useAccount())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(result.current.status).toBe('signed-out')
      const calls = () => mocked.getMe.mock.calls.length
      const before = calls()
      const flip = async (state: 'hidden' | 'visible') => {
        setVisibility(state)
        await act(async () => {
          document.dispatchEvent(new Event('visibilitychange'))
          await vi.advanceTimersByTimeAsync(0)
        })
      }

      await flip('hidden')
      expect(calls()).toBe(before)
      await flip('visible')
      expect(calls()).toBe(before + 1)
      await flip('hidden')
      await flip('visible')
      expect(calls()).toBe(before + 1)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000)
      })
      mocked.getMe.mockResolvedValue(ME)
      await flip('hidden')
      await flip('visible')
      expect(calls()).toBe(before + 2)
      expect(result.current.status).toBe('signed-in')
    } finally {
      vi.useRealTimers()
    }
  })
})
