// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import type { Me, Profile } from '@rca/contract'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api/client'
import { ApiRequestError } from '../api/client'
import { useAccount } from './useAccount'

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
  profile: { massKg: 75, bikeMassKg: 9, units: 'metric', keepFiles: true, updatedAt: 1000 },
}

const INPUT = { massKg: 80, bikeMassKg: 10, units: 'imperial', keepFiles: false } as const

/** Renders the hook signed in (or in the given state) and waits for the first lookup. */
async function renderSignedIn() {
  mocked.getMe.mockResolvedValue(ME)
  const hook = renderHook(() => useAccount())
  await waitFor(() => expect(hook.result.current.status).toBe('signed-in'))
  return hook
}

/** Runs an action that may reject, and returns what it rejected with (undefined on success). */
async function attempt(action: () => Promise<void>): Promise<unknown> {
  let thrown: unknown = undefined
  await act(async () => {
    await action().catch((failure: unknown) => {
      thrown = failure
    })
  })
  return thrown
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useAccount', () => {
  it('starts loading and becomes signed in when the account is found', async () => {
    mocked.getMe.mockResolvedValue(ME)
    const { result } = renderHook(() => useAccount())
    expect(result.current.status).toBe('loading')
    expect(result.current.me).toBeNull()

    await waitFor(() => expect(result.current.status).toBe('signed-in'))
    expect(result.current.me).toEqual(ME)
    expect(result.current.error).toBeNull()
  })

  it('becomes signed out when nobody is signed in', async () => {
    mocked.getMe.mockResolvedValue(null)
    const { result } = renderHook(() => useAccount())
    await waitFor(() => expect(result.current.status).toBe('signed-out'))
    expect(result.current.me).toBeNull()
  })

  it.each([
    ['a network failure', new ApiRequestError(0, 'network_error', 'Could not reach the server')],
    ['a 404 from a static host', new ApiRequestError(404, 'http_error', 'Not Found')],
    ['a 500 from the API', new ApiRequestError(500, 'internal_error', 'Something went wrong')],
  ])('becomes unavailable on %s, with the reason as the error', async (_label, failure) => {
    vi.useFakeTimers()
    try {
      mocked.getMe.mockRejectedValue(failure)
      const { result } = renderHook(() => useAccount())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(14_000)
      })
      expect(result.current.status).toBe('unavailable')
      expect(result.current.me).toBeNull()
      expect(result.current.error).toBe(failure.message)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not update after unmounting while the lookup is still running', async () => {
    let finish: (me: Me | null) => void = () => undefined
    mocked.getMe.mockReturnValue(new Promise<Me | null>((resolve) => (finish = resolve)))
    const { result, unmount } = renderHook(() => useAccount())
    unmount()
    await act(async () => {
      finish(ME)
    })
    expect(result.current.status).toBe('loading')
  })

  it('does not update after unmounting when the lookup fails', async () => {
    let fail: (reason: unknown) => void = () => undefined
    mocked.getMe.mockReturnValue(new Promise<Me | null>((_resolve, reject) => (fail = reject)))
    const { result, unmount } = renderHook(() => useAccount())
    unmount()
    await act(async () => {
      fail(new ApiRequestError(500, 'internal_error', 'Down'))
    })
    expect(result.current.status).toBe('loading')
    expect(result.current.error).toBeNull()
  })

  it('signIn starts Google sign-in by navigating to the API route', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { assign })
    const { result } = await renderSignedIn()
    result.current.signIn()
    expect(assign).toHaveBeenCalledWith('/api/auth/google')
  })

  it('signOut ends the session, becoming signed out with no account', async () => {
    mocked.logout.mockResolvedValue(undefined)
    const { result } = await renderSignedIn()
    await act(async () => {
      await result.current.signOut()
    })
    expect(mocked.logout).toHaveBeenCalledOnce()
    expect(result.current.status).toBe('signed-out')
    expect(result.current.me).toBeNull()
  })

  it('signOut keeps the account, reports the error and rethrows it when the server refuses', async () => {
    const failure = new ApiRequestError(500, 'internal_error', 'Try again')
    mocked.logout.mockRejectedValue(failure)
    const { result } = await renderSignedIn()
    expect(await attempt(() => result.current.signOut())).toBe(failure)
    expect(result.current.status).toBe('signed-in')
    expect(result.current.me).toEqual(ME)
    expect(result.current.error).toBe('Try again')
  })

  it('deleteAccount removes the account and becomes signed out', async () => {
    mocked.deleteAccount.mockResolvedValue(undefined)
    const { result } = await renderSignedIn()
    await act(async () => {
      await result.current.deleteAccount()
    })
    expect(mocked.deleteAccount).toHaveBeenCalledOnce()
    expect(result.current.status).toBe('signed-out')
    expect(result.current.me).toBeNull()
  })

  it('deleteAccount keeps the account, reports the error and rethrows it when it fails', async () => {
    const failure = new ApiRequestError(503, 'http_error', 'Busy')
    mocked.deleteAccount.mockRejectedValue(failure)
    const { result } = await renderSignedIn()
    expect(await attempt(() => result.current.deleteAccount())).toBe(failure)
    expect(result.current.status).toBe('signed-in')
    expect(result.current.me).toEqual(ME)
    expect(result.current.error).toBe('Busy')
  })

  it('updateProfile replaces the profile in place and clears an earlier error', async () => {
    const stored = { ...INPUT, updatedAt: 2000 }
    const { result } = await renderSignedIn()

    const failure = new Error('first try failed')
    mocked.updateProfile.mockRejectedValueOnce(failure).mockResolvedValueOnce(stored)
    expect(await attempt(() => result.current.updateProfile(INPUT))).toBe(failure)
    expect(result.current.error).toBe('first try failed')

    await act(async () => {
      await result.current.updateProfile(INPUT)
    })
    expect(mocked.updateProfile).toHaveBeenLastCalledWith(INPUT, ME.user.id)
    expect(result.current.me).toEqual({ user: ME.user, profile: stored })
    expect(result.current.error).toBeNull()
    expect(result.current.status).toBe('signed-in')
  })

  it('serializes full-profile writes so a late response cannot overwrite a later edit', async () => {
    const firstStored = { ...INPUT, updatedAt: 2000 }
    const secondInput = { ...INPUT, units: 'metric' as const }
    const secondStored = { ...secondInput, updatedAt: 3000 }
    let finishFirst: (profile: typeof firstStored) => void = () => undefined
    mocked.updateProfile
      .mockImplementationOnce(() => new Promise((resolve) => (finishFirst = resolve)))
      .mockResolvedValueOnce(secondStored)
    const { result } = await renderSignedIn()

    let first: Promise<void> = Promise.resolve()
    let second: Promise<void> = Promise.resolve()
    act(() => {
      first = result.current.updateProfile(INPUT)
      second = result.current.updateProfile(secondInput)
    })
    await vi.waitFor(() => expect(mocked.updateProfile).toHaveBeenCalledTimes(1))

    await act(async () => {
      finishFirst(firstStored)
      await Promise.all([first, second])
    })

    expect(mocked.updateProfile).toHaveBeenCalledTimes(2)
    expect(mocked.updateProfile).toHaveBeenNthCalledWith(1, INPUT, ME.user.id)
    expect(mocked.updateProfile).toHaveBeenNthCalledWith(2, secondInput, ME.user.id)
    expect(result.current.me?.profile).toEqual(secondStored)
  })

  it('flushProfileWrites waits and returns the authoritative updated account', async () => {
    const stored = { ...INPUT, updatedAt: 2000 }
    let finish: (profile: typeof stored) => void = () => undefined
    mocked.updateProfile.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
    const { result } = await renderSignedIn()
    let update: Promise<void> = Promise.resolve()
    let flushed: Promise<Me | null> = Promise.resolve(null)
    act(() => {
      update = result.current.updateProfile(INPUT)
      flushed = result.current.flushProfileWrites()
    })

    let flushFinished = false
    void flushed.then(() => {
      flushFinished = true
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(flushFinished).toBe(false)

    await act(async () => {
      finish(stored)
      await update
      expect(await flushed).toEqual({ user: ME.user, profile: stored })
    })
  })

  it('flushProfileWrites adopts the saved profile after a failed write, so imports can go on', async () => {
    const failure = new ApiRequestError(429, 'rate_limited', 'Slow down')
    const saved = { ...ME.profile, keepFiles: false, updatedAt: 5000 }
    mocked.updateProfile.mockRejectedValueOnce(failure)
    const { result } = await renderSignedIn()
    mocked.getMe.mockResolvedValue({ user: ME.user, profile: saved })
    let flushed: Me | null = null
    await act(async () => {
      void result.current.updateProfile(INPUT).catch(() => undefined)
      flushed = await result.current.flushProfileWrites()
    })

    expect(flushed).toEqual({ user: ME.user, profile: saved })
    expect(result.current.me?.profile).toEqual(saved)
  })

  it('flushProfileWrites refuses to continue only while the server cannot be read', async () => {
    mocked.updateProfile.mockRejectedValueOnce(new ApiRequestError(429, 'rate_limited', 'Slow'))
    const { result } = await renderSignedIn()
    mocked.getMe.mockResolvedValueOnce(ME)
    mocked.getMe.mockRejectedValue(new Error('offline'))
    let flush: Promise<Me | null> = Promise.resolve(null)
    act(() => {
      void result.current.updateProfile(INPUT).catch(() => undefined)
      flush = result.current.flushProfileWrites()
    })
    await expect(flush).rejects.toThrow('offline')

    mocked.getMe.mockResolvedValue(ME)
    expect(await attempt(() => result.current.flushProfileWrites().then(() => undefined))).toBe(
      undefined,
    )
  })

  it('finishes queued profile writes before logging out', async () => {
    let finishUpdate: (profile: typeof ME.profile) => void = () => undefined
    mocked.updateProfile
      .mockImplementationOnce(() => new Promise((resolve) => (finishUpdate = resolve)))
      .mockResolvedValueOnce({ ...INPUT, units: 'metric', updatedAt: 3000 })
    mocked.logout.mockResolvedValue(undefined)
    const { result } = await renderSignedIn()
    let update: Promise<void> = Promise.resolve()
    let secondUpdate: Promise<void> = Promise.resolve()
    let logout: Promise<void> = Promise.resolve()

    act(() => {
      update = result.current.updateProfile(INPUT)
      secondUpdate = result.current.updateProfile({ ...INPUT, units: 'metric' })
      logout = result.current.signOut()
    })
    await vi.waitFor(() => expect(mocked.updateProfile).toHaveBeenCalledOnce())
    expect(mocked.logout).not.toHaveBeenCalled()

    await act(async () => {
      finishUpdate({ ...INPUT, updatedAt: 2000 })
      await Promise.all([update, secondUpdate, logout])
    })

    expect(mocked.updateProfile).toHaveBeenCalledTimes(2)
    expect(mocked.logout).toHaveBeenCalledOnce()
    expect(mocked.logout).toHaveBeenCalledWith(ME.user.id)
    expect(result.current.status).toBe('signed-out')
  })

  it('updateProfile leaves a signed-out account without a profile', async () => {
    mocked.getMe.mockResolvedValue(null)
    mocked.updateProfile.mockResolvedValue({ ...INPUT, updatedAt: 2000 })
    const { result } = renderHook(() => useAccount())
    await waitFor(() => expect(result.current.status).toBe('signed-out'))

    await act(async () => {
      await result.current.updateProfile(INPUT)
    })
    expect(result.current.me).toBeNull()
  })

  it('reports a failure that is not an Error as text, and rethrows the original value', async () => {
    mocked.logout.mockRejectedValue('offline')
    const { result } = await renderSignedIn()
    expect(await attempt(() => result.current.signOut())).toBe('offline')
    expect(result.current.error).toBe('offline')
  })

  it('clears the error when a later sign-out succeeds', async () => {
    mocked.logout.mockRejectedValueOnce(new Error('first'))
    mocked.logout.mockResolvedValueOnce(undefined)
    const { result } = await renderSignedIn()
    await attempt(() => result.current.signOut())
    expect(result.current.error).toBe('first')
    expect(await attempt(() => result.current.signOut())).toBeUndefined()
    expect(result.current.error).toBeNull()
    expect(result.current.status).toBe('signed-out')
  })

  it('clears the error when a later account deletion succeeds', async () => {
    mocked.deleteAccount.mockRejectedValueOnce(new Error('first'))
    mocked.deleteAccount.mockResolvedValueOnce(undefined)
    const { result } = await renderSignedIn()
    await attempt(() => result.current.deleteAccount())
    expect(result.current.error).toBe('first')
    expect(await attempt(() => result.current.deleteAccount())).toBeUndefined()
    expect(result.current.error).toBeNull()
    expect(result.current.status).toBe('signed-out')
  })
  it('merges an edit onto the latest saved profile, so a stale tab cannot revert another tab', async () => {
    mocked.getMe.mockReset()
    mocked.updateProfile.mockReset()
    let saved: Profile = { ...ME.profile, keepFiles: false }
    mocked.getMe.mockImplementation(async () => ({ user: ME.user, profile: saved }))
    mocked.updateProfile.mockImplementation(async (input) => {
      saved = { ...input, updatedAt: saved.updatedAt + 1 }
      return saved
    })
    const tabA = renderHook(() => useAccount())
    const tabB = renderHook(() => useAccount())
    await waitFor(() => expect(tabA.result.current.status).toBe('signed-in'))
    await waitFor(() => expect(tabB.result.current.status).toBe('signed-in'))

    // Tab B turns original-file retention on after tab A was opened.
    await act(async () => {
      await tabB.result.current.updateProfile({ keepFiles: true })
    })
    // Tab A still shows retention off, and changes only its weight.
    await act(async () => {
      await tabA.result.current.updateProfile({ massKg: 80 })
    })

    expect(mocked.updateProfile).toHaveBeenLastCalledWith(
      { massKg: 80, bikeMassKg: 9, units: 'metric', keepFiles: true },
      ME.user.id,
    )
    expect(saved).toMatchObject({ massKg: 80, keepFiles: true, units: 'metric' })
    expect(tabA.result.current.me?.profile).toMatchObject({ massKg: 80, keepFiles: true })
    mocked.getMe.mockReset()
    mocked.updateProfile.mockReset()
  })

  it('does not write a profile edit into a different account that signed in another tab', async () => {
    mocked.getMe.mockResolvedValueOnce(ME)
    const { result } = renderHook(() => useAccount())
    await waitFor(() => expect(result.current.status).toBe('signed-in'))
    mocked.getMe.mockResolvedValue({ ...ME, user: { ...ME.user, id: 'u2' } })

    const failure = await attempt(() => result.current.updateProfile({ units: 'imperial' }))
    expect(failure).toMatchObject({ status: 409, code: 'account_changed' })
    expect(mocked.updateProfile).not.toHaveBeenCalled()
    expect(result.current.me?.user.id).toBe('u2')
  })

  it('ends an expired session when a profile save is refused as unauthenticated', async () => {
    mocked.updateProfile.mockRejectedValueOnce(
      new ApiRequestError(401, 'unauthenticated', 'Sign in required'),
    )
    const { result } = await renderSignedIn()
    mocked.getMe.mockResolvedValue(null)
    await attempt(() => result.current.updateProfile(INPUT))

    expect(result.current.status).toBe('signed-out')
    expect(result.current.me).toBeNull()
    expect(result.current.sessionExpired).toBe(true)
    expect(result.current.error).toMatch(/session ended/i)
  })

  it('markExpired ends the session without signing the user out on the server', async () => {
    mocked.logout.mockClear()
    const { result } = await renderSignedIn()
    act(() => result.current.markExpired())

    expect(result.current.status).toBe('signed-out')
    expect(result.current.me).toBeNull()
    expect(result.current.sessionExpired).toBe(true)
    expect(mocked.logout).not.toHaveBeenCalled()
  })

  it('refresh adopts the account the server now reports', async () => {
    const { result } = await renderSignedIn()
    mocked.getMe.mockResolvedValue({ ...ME, user: { ...ME.user, id: 'u2' } })

    await act(async () => {
      await result.current.refresh()
    })
    expect(result.current.me?.user.id).toBe('u2')
    expect(result.current.status).toBe('signed-in')
    expect(result.current.sessionExpired).toBe(false)
  })

  it('refresh reports an expired session when the server no longer knows the user', async () => {
    const { result } = await renderSignedIn()
    mocked.getMe.mockResolvedValue(null)

    await act(async () => {
      await result.current.refresh()
    })
    expect(result.current.status).toBe('signed-out')
    expect(result.current.sessionExpired).toBe(true)
  })

  it('retries a failed account lookup with backoff, and signs in when a retry succeeds', async () => {
    vi.useFakeTimers()
    try {
      mocked.getMe.mockReset()
      mocked.getMe
        .mockRejectedValueOnce(new ApiRequestError(0, 'network_error', 'Offline'))
        .mockResolvedValue(ME)
      const { result } = renderHook(() => useAccount())
      expect(mocked.getMe).toHaveBeenCalledTimes(1)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000)
      })
      expect(mocked.getMe).toHaveBeenCalledTimes(2)
      expect(result.current.status).toBe('signed-in')
    } finally {
      vi.useRealTimers()
    }
  })

  it('tries the account lookup at 1 s, 3 s and 10 s after the first failure, then reports it unavailable', async () => {
    vi.useFakeTimers()
    try {
      mocked.getMe.mockReset()
      mocked.getMe.mockRejectedValue(new ApiRequestError(0, 'network_error', 'Offline'))
      const { result } = renderHook(() => useAccount())

      await act(async () => {
        await vi.advanceTimersByTimeAsync(999)
      })
      expect(mocked.getMe).toHaveBeenCalledTimes(1)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1)
      })
      expect(mocked.getMe).toHaveBeenCalledTimes(2)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000)
      })
      expect(mocked.getMe).toHaveBeenCalledTimes(3)
      expect(result.current.status).toBe('loading')
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000)
      })
      expect(mocked.getMe).toHaveBeenCalledTimes(4)
      expect(result.current.status).toBe('unavailable')

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000)
      })
      expect(mocked.getMe).toHaveBeenCalledTimes(4)
    } finally {
      vi.useRealTimers()
    }
  })
})
