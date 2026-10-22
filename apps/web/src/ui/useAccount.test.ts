// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import type { Me } from '@rca/contract'
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
    mocked.getMe.mockRejectedValue(failure)
    const { result } = renderHook(() => useAccount())
    await waitFor(() => expect(result.current.status).toBe('unavailable'))
    expect(result.current.me).toBeNull()
    expect(result.current.error).toBe(failure.message)
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
    mocked.updateProfile.mockRejectedValueOnce(new Error('first try failed'))
    mocked.updateProfile.mockResolvedValueOnce(stored)
    const { result } = await renderSignedIn()

    await act(async () => {
      await result.current.updateProfile(INPUT)
    })
    expect(result.current.error).toBe('first try failed')

    await act(async () => {
      await result.current.updateProfile(INPUT)
    })
    expect(mocked.updateProfile).toHaveBeenLastCalledWith(INPUT)
    expect(result.current.me).toEqual({ user: ME.user, profile: stored })
    expect(result.current.error).toBeNull()
    expect(result.current.status).toBe('signed-in')
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
})
