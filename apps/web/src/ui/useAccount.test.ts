// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import type { Me, Profile } from '@rca/contract'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api/client'
import { ApiRequestError } from '../api/client'
import { useAccount } from './useAccount'
import { deleteAccountDetails } from '../worker/deleteAccountDetails'
import { forgetAccountDetails } from '../worker/forgetAccountDetails'
import { sweepAccountDetails } from '../worker/sweepAccountDetails'

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

const INPUT = {
  massKg: 80,
  bikeMassKg: 10,
  units: 'imperial',
  keepFiles: false,
  birthYear: null,
  sex: null,
} as const

/** Renders the hook signed in (or in the given state) and waits for the first lookup. */
async function renderSignedIn() {
  mocked.getMe.mockResolvedValue(ME)
  const hook = renderHook(() => useAccount())
  await waitFor(() => expect(hook.result.current.status).toBe('signed-in'))
  return hook
}

/** Runs an action that may reject, and returns what it rejected with (undefined on success). */
async function attempt(action: () => Promise<unknown>): Promise<unknown> {
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
  vi.mocked(deleteAccountDetails).mockResolvedValue(null)
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
    expect(forgetAccountDetails).toHaveBeenCalledExactlyOnceWith('u1')
    expect(result.current.status).toBe('signed-out')
    expect(result.current.me).toBeNull()
  })

  it('signOut reports a refused local recording cleanup once the session has ended', async () => {
    mocked.logout.mockResolvedValue(undefined)
    vi.mocked(forgetAccountDetails).mockResolvedValueOnce('Recordings could not be cleared')
    const { result } = await renderSignedIn()
    await act(async () => {
      await result.current.signOut()
    })
    expect(result.current.status).toBe('signed-out')
    expect(result.current.error).toBe('Recordings could not be cleared')
  })

  it('signOut keeps the account, reports the error and rethrows it when the server refuses', async () => {
    const failure = new ApiRequestError(500, 'internal_error', 'Try again')
    mocked.logout.mockRejectedValue(failure)
    const { result } = await renderSignedIn()
    expect(await attempt(() => result.current.signOut())).toBe(failure)
    expect(forgetAccountDetails).not.toHaveBeenCalled()
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
    expect(deleteAccountDetails).toHaveBeenCalledExactlyOnceWith('u1')
    expect(mocked.deleteAccount.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(deleteAccountDetails).mock.invocationCallOrder[0]!,
    )
    expect(result.current.status).toBe('signed-out')
    expect(result.current.me).toBeNull()
  })

  it('deleteAccount keeps the account, reports the error and rethrows it when it fails', async () => {
    const failure = new ApiRequestError(503, 'http_error', 'Busy')
    mocked.deleteAccount.mockRejectedValue(failure)
    const { result } = await renderSignedIn()
    expect(await attempt(() => result.current.deleteAccount())).toBe(failure)
    expect(deleteAccountDetails).not.toHaveBeenCalled()
    expect(result.current.status).toBe('signed-in')
    expect(result.current.me).toEqual(ME)
    expect(result.current.error).toBe('Busy')
  })

  it('reports refused local recording cleanup after a successful account deletion', async () => {
    mocked.deleteAccount.mockResolvedValue(undefined)
    vi.mocked(deleteAccountDetails).mockResolvedValue('Local recordings could not be removed')
    const { result } = await renderSignedIn()
    await attempt(() => result.current.deleteAccount())
    expect(result.current.status).toBe('signed-out')
    expect(result.current.error).toBe('Local recordings could not be removed')
  })

  it('updateProfile sends a body mass only when the patch sets it, so a write leaves it alone', async () => {
    const { result } = await renderSignedIn()
    mocked.updateProfile.mockResolvedValueOnce({ ...ME.profile, updatedAt: 2000 })
    await act(async () => {
      await result.current.updateProfile({ units: 'imperial' })
    })
    const [sent] = mocked.updateProfile.mock.calls.at(-1) ?? []
    expect(sent).not.toHaveProperty('massKg')
    expect(sent).toMatchObject({ units: 'imperial', bikeMassKg: 9 })
  })

  it('updateProfile sends a cleared body mass as null, not as the saved one', async () => {
    const { result } = await renderSignedIn()
    mocked.updateProfile.mockResolvedValueOnce({ ...ME.profile, massKg: null, updatedAt: 2000 })
    await act(async () => {
      await result.current.updateProfile({ massKg: null })
    })
    expect(mocked.updateProfile).toHaveBeenLastCalledWith(
      expect.objectContaining({ massKg: null }),
      ME.user.id,
    )
    expect(result.current.me?.profile.massKg).toBeNull()
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

    let first: Promise<unknown> = Promise.resolve()
    let second: Promise<unknown> = Promise.resolve()
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
    let update: Promise<unknown> = Promise.resolve()
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
    let update: Promise<unknown> = Promise.resolve()
    let secondUpdate: Promise<unknown> = Promise.resolve()
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

  it('updateProfile refuses a signed-out account, so nothing is taken to be saved', async () => {
    mocked.getMe.mockResolvedValue(null)
    mocked.updateProfile.mockResolvedValue({ ...INPUT, updatedAt: 2000 })
    const { result } = renderHook(() => useAccount())
    await waitFor(() => expect(result.current.status).toBe('signed-out'))

    const failure = await attempt(() => result.current.updateProfile(INPUT))

    expect(failure).toMatchObject({ status: 401, message: 'Sign in required' })
    expect(mocked.updateProfile).not.toHaveBeenCalled()
    expect(result.current.me).toBeNull()
  })

  it('updateProfile resolves with the profile the server stored', async () => {
    const stored = { ...INPUT, updatedAt: 2000 }
    mocked.updateProfile.mockResolvedValueOnce(stored)
    const { result } = await renderSignedIn()

    let saved: unknown
    await act(async () => {
      saved = await result.current.updateProfile({ massKg: 80 })
    })

    expect(saved).toEqual(stored)
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

  it('refuses a profile edit made while signing out, and says why', async () => {
    let finishLogout: () => void = () => undefined
    mocked.logout.mockReturnValue(
      new Promise<void>((resolve) => {
        finishLogout = () => resolve()
      }),
    )
    const { result } = await renderSignedIn()
    act(() => {
      void result.current.signOut()
    })

    expect(await attempt(() => result.current.updateProfile(INPUT))).toBeInstanceOf(ApiRequestError)
    expect(result.current.error).toBe(
      'This change was not saved, because the account is being signed out or deleted.',
    )
    expect(mocked.updateProfile).not.toHaveBeenCalled()

    await act(async () => {
      finishLogout()
    })
    expect(result.current.status).toBe('signed-out')
  })

  it('sends year of birth and sex only in a write that sets them, so the server keeps the rest', async () => {
    mocked.updateProfile.mockReset()
    mocked.getMe.mockResolvedValue({
      ...ME,
      profile: { ...ME.profile, birthYear: 1990, sex: 'female' },
    })
    mocked.updateProfile.mockImplementation(async (input) => ({
      ...input,
      massKg: input.massKg !== undefined ? input.massKg : ME.profile.massKg,
      birthYear: input.birthYear ?? 1990,
      sex: input.sex ?? 'female',
      updatedAt: 2000,
    }))
    const { result } = renderHook(() => useAccount())
    await waitFor(() => expect(result.current.status).toBe('signed-in'))

    await act(async () => {
      await result.current.updateProfile({ units: 'metric' })
    })
    const [unrelated] = mocked.updateProfile.mock.calls.at(-1) ?? []
    expect(unrelated).toEqual({ bikeMassKg: 9, units: 'metric', keepFiles: true })
    expect(unrelated).not.toHaveProperty('birthYear')
    expect(unrelated).not.toHaveProperty('sex')

    await act(async () => {
      await result.current.updateProfile({ birthYear: null })
    })
    expect(mocked.updateProfile).toHaveBeenLastCalledWith(
      expect.objectContaining({ birthYear: null }),
      ME.user.id,
    )
    expect(mocked.updateProfile.mock.calls.at(-1)?.[0]).not.toHaveProperty('sex')
  })

  it('merges an edit onto the latest saved profile, so a stale tab cannot revert another tab', async () => {
    mocked.getMe.mockReset()
    mocked.updateProfile.mockReset()
    let saved: Profile = { ...ME.profile, keepFiles: false }
    mocked.getMe.mockImplementation(async () => ({ user: ME.user, profile: saved }))
    mocked.updateProfile.mockImplementation(async (input) => {
      saved = {
        ...input,
        massKg: input.massKg !== undefined ? input.massKg : saved.massKg,
        birthYear: input.birthYear ?? null,
        sex: input.sex ?? null,
        updatedAt: saved.updatedAt + 1,
      }
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

  describe('an account that ends without a sign-out here', () => {
    it('clears its detail recordings when the session is marked expired', async () => {
      const { result } = await renderSignedIn()
      expect(forgetAccountDetails).not.toHaveBeenCalled()
      act(() => result.current.markExpired())

      expect(forgetAccountDetails).toHaveBeenCalledExactlyOnceWith('u1')
    })

    it('clears them when the server no longer knows the user', async () => {
      const { result } = await renderSignedIn()
      mocked.getMe.mockResolvedValue(null)
      await act(async () => {
        await result.current.refresh()
      })

      expect(forgetAccountDetails).toHaveBeenCalledExactlyOnceWith('u1')
    })

    it('clears the earlier account when a different one signs in', async () => {
      const { result } = await renderSignedIn()
      mocked.getMe.mockResolvedValue({ ...ME, user: { ...ME.user, id: 'u2' } })
      await act(async () => {
        await result.current.refresh()
      })

      expect(forgetAccountDetails).toHaveBeenCalledExactlyOnceWith('u1')
    })

    it('clears nothing while the same account stays signed in, or for a visitor who was signed out', async () => {
      mocked.getMe.mockResolvedValue(null)
      const signedOut = renderHook(() => useAccount())
      await waitFor(() => expect(signedOut.result.current.status).toBe('signed-out'))
      await act(async () => {
        await signedOut.result.current.refresh()
      })
      const { result } = await renderSignedIn()
      await act(async () => {
        await result.current.refresh()
      })

      expect(forgetAccountDetails).not.toHaveBeenCalled()
    })

    it('sweeps the other accounts on a definite answer from the server, keeping the signed-in one', async () => {
      const { result } = await renderSignedIn()
      expect(sweepAccountDetails).toHaveBeenLastCalledWith('u1')
      mocked.getMe.mockResolvedValue(null)
      await act(async () => {
        await result.current.refresh()
      })

      expect(sweepAccountDetails).toHaveBeenLastCalledWith(null)
    })

    it('sweeps on a load that finds nobody signed in, as when the session ended with the tab closed', async () => {
      mocked.getMe.mockResolvedValue(null)
      renderHook(() => useAccount())

      await waitFor(() => expect(sweepAccountDetails).toHaveBeenCalledExactlyOnceWith(null))
    })

    it('sweeps every account when the session is marked expired', async () => {
      const { result } = await renderSignedIn()
      act(() => result.current.markExpired())

      expect(sweepAccountDetails).toHaveBeenLastCalledWith(null)
    })

    it('does not sweep, or clear anything, when the lookup fails on the network', async () => {
      mocked.getMe.mockRejectedValue(new ApiRequestError(0, 'network_error', 'Offline'))
      const { result } = renderHook(() => useAccount())

      await waitFor(() => expect(result.current.status).toBe('unavailable'))
      expect(sweepAccountDetails).not.toHaveBeenCalled()
      expect(forgetAccountDetails).not.toHaveBeenCalled()
    })

    it('reports a refused cleanup after the session ended notice', async () => {
      vi.mocked(forgetAccountDetails).mockResolvedValueOnce('Recordings could not be cleared')
      const { result } = await renderSignedIn()
      act(() => result.current.markExpired())

      await waitFor(() => expect(result.current.error).toMatch(/Recordings could not be cleared/))
      expect(result.current.error).toMatch(/session ended/i)
    })
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

  it('reports the account unavailable at the first failure, and tries again at 1 s, 3 s and 10 s', async () => {
    vi.useFakeTimers()
    try {
      mocked.getMe.mockReset()
      mocked.getMe.mockRejectedValue(new ApiRequestError(0, 'network_error', 'Offline'))
      const { result } = renderHook(() => useAccount())

      await act(async () => {
        await vi.advanceTimersByTimeAsync(999)
      })
      expect(mocked.getMe).toHaveBeenCalledTimes(1)
      // Signed-out use does not wait for the retries.
      expect(result.current.status).toBe('unavailable')
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1)
      })
      expect(mocked.getMe).toHaveBeenCalledTimes(2)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000)
      })
      expect(mocked.getMe).toHaveBeenCalledTimes(3)
      expect(result.current.status).toBe('unavailable')
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

  it('signs the account in when a retry gets through after the first lookup failed, and drops the error', async () => {
    vi.useFakeTimers()
    try {
      mocked.getMe.mockReset()
      mocked.getMe
        .mockRejectedValueOnce(new ApiRequestError(502, 'http_error', 'Bad Gateway'))
        .mockResolvedValue(ME)
      const { result } = renderHook(() => useAccount())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(result.current.status).toBe('unavailable')
      // The first miss is a slow moment the retry usually clears, so it raises no error.
      expect(result.current.error).toBeNull()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000)
      })
      expect(result.current.status).toBe('signed-in')
      expect(result.current.me).toEqual(ME)
      expect(result.current.error).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports the failure once a second lookup also misses', async () => {
    vi.useFakeTimers()
    try {
      mocked.getMe.mockReset()
      mocked.getMe.mockRejectedValue(new ApiRequestError(502, 'http_error', 'Bad Gateway'))
      const { result } = renderHook(() => useAccount())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(result.current.error).toBeNull()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000)
      })
      expect(result.current.error).toBe('Bad Gateway')
      expect(result.current.status).toBe('unavailable')
    } finally {
      vi.useRealTimers()
    }
  })

  it('asks for the account with a short deadline, and no second try after a timeout', async () => {
    mocked.getMe.mockReset()
    mocked.getMe.mockResolvedValue(null)
    renderHook(() => useAccount())
    await waitFor(() => expect(mocked.getMe).toHaveBeenCalled())
    expect(mocked.getMe).toHaveBeenCalledWith({ timeoutMs: 5_000, retryWithinMs: 1_000 })
  })

  it('gives the last attempt the normal deadline, so a slow link is not signed out for good', async () => {
    vi.useFakeTimers()
    try {
      mocked.getMe.mockReset()
      mocked.getMe.mockRejectedValue(new ApiRequestError(0, 'network_error', 'Offline'))
      renderHook(() => useAccount())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000 + 3_000 + 10_000)
      })
      const options = mocked.getMe.mock.calls.map(([option]) => option)
      expect(options).toEqual([
        { timeoutMs: 5_000, retryWithinMs: 1_000 },
        { timeoutMs: 5_000, retryWithinMs: 1_000 },
        { timeoutMs: 5_000, retryWithinMs: 1_000 },
        undefined,
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  describe('after the retries gave up', () => {
    async function gaveUp() {
      mocked.getMe.mockReset()
      mocked.getMe.mockRejectedValue(new ApiRequestError(0, 'network_error', 'Offline'))
      const hook = renderHook(() => useAccount())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(14_000)
      })
      expect(hook.result.current.status).toBe('unavailable')
      expect(hook.result.current.lookupPending).toBe(false)
      return hook
    }

    it('asks once more when the browser comes back online, and signs the account in', async () => {
      vi.useFakeTimers()
      try {
        const { result } = await gaveUp()
        mocked.getMe.mockResolvedValue(ME)
        await act(async () => {
          window.dispatchEvent(new Event('online'))
          await vi.advanceTimersByTimeAsync(0)
        })
        expect(result.current.status).toBe('signed-in')
        // The "could not reach the server" the lookup left behind goes with it.
        expect(result.current.error).toBeNull()
      } finally {
        vi.useRealTimers()
      }
    })

    it('asks once more when the tab becomes visible again', async () => {
      vi.useFakeTimers()
      try {
        const { result } = await gaveUp()
        mocked.getMe.mockResolvedValue(ME)
        await act(async () => {
          document.dispatchEvent(new Event('visibilitychange'))
          await vi.advanceTimersByTimeAsync(0)
        })
        expect(result.current.status).toBe('signed-in')
        expect(result.current.error).toBeNull()
      } finally {
        vi.useRealTimers()
      }
    })

    it('stays unavailable, quietly, when that last ask fails too', async () => {
      vi.useFakeTimers()
      try {
        const { result } = await gaveUp()
        const calls = mocked.getMe.mock.calls.length
        await act(async () => {
          window.dispatchEvent(new Event('online'))
          await vi.advanceTimersByTimeAsync(0)
        })
        expect(mocked.getMe.mock.calls.length).toBe(calls + 1)
        expect(result.current.status).toBe('unavailable')
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('the floor between asks', () => {
    it('asks at most once in 30 seconds however often the browser comes back', async () => {
      vi.useFakeTimers()
      try {
        mocked.getMe.mockReset()
        mocked.getMe.mockRejectedValue(new ApiRequestError(0, 'network_error', 'Offline'))
        renderHook(() => useAccount())
        await act(async () => {
          await vi.advanceTimersByTimeAsync(14_000)
        })
        const calls = () => mocked.getMe.mock.calls.length
        const before = calls()
        const ask = async () => {
          await act(async () => {
            window.dispatchEvent(new Event('online'))
            await vi.advanceTimersByTimeAsync(0)
          })
        }
        await ask()
        await ask()
        expect(calls()).toBe(before + 1)
        await act(async () => {
          await vi.advanceTimersByTimeAsync(30_000)
        })
        await ask()
        expect(calls()).toBe(before + 2)
      } finally {
        vi.useRealTimers()
      }
    })
  })

  it('does not ask again on coming online while the account is signed in or still being looked up', async () => {
    mocked.getMe.mockReset()
    mocked.getMe.mockResolvedValue(ME)
    const { result } = renderHook(() => useAccount())
    await waitFor(() => expect(result.current.status).toBe('signed-in'))
    const calls = mocked.getMe.mock.calls.length
    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })
    expect(mocked.getMe.mock.calls.length).toBe(calls)
  })

  it('becomes signed out, not expired, when a retry finds nobody signed in', async () => {
    vi.useFakeTimers()
    try {
      mocked.getMe.mockReset()
      mocked.getMe
        .mockRejectedValueOnce(new ApiRequestError(0, 'network_error', 'Offline'))
        .mockResolvedValue(null)
      const { result } = renderHook(() => useAccount())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000)
      })
      expect(result.current.status).toBe('signed-out')
      expect(result.current.sessionExpired).toBe(false)
      expect(result.current.error).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
