// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SIGN_IN_FAILED, signInProblemText, useSignInProblem } from './signInProblem'

afterEach(() => {
  window.history.replaceState(null, '', '#/')
})

describe('signInProblemText', () => {
  it('words each code the API sends back, in the app’s own sentence', () => {
    expect(signInProblemText('#/?signin=rate_limited')).toMatch(/^Too many sign-in attempts/)
    expect(signInProblemText('#/?signin=oauth_denied')).toMatch(/cancelled/)
    expect(signInProblemText('#/?signin=oauth_state_mismatch')).toBe(
      'That sign-in could not be matched to this browser, or it expired. Start it again.',
    )
  })

  it('words a sign-in refused while the service is read-only', () => {
    expect(signInProblemText('#/?signin=read_only')).toMatch(/^Signing in is paused/)
  })

  it('words the refusals of the sign-up list and of account states, which the API sends as codes', () => {
    expect(signInProblemText('#/?signin=not_on_list')).toMatch(
      /is not on the list, so nothing was created/,
    )
    expect(signInProblemText('#/?signin=signup_limit')).toMatch(/Try again after midnight UTC/)
    expect(signInProblemText('#/?signin=account_deleting')).toMatch(/not finished yet/)
    expect(signInProblemText('#/?signin=account_conflict')).toMatch(
      /linked to a different Google account/,
    )
  })

  it('gives the general line for a code it does not know, and never the address’s own words', () => {
    expect(signInProblemText('#/?signin=internal_error')).toBe(SIGN_IN_FAILED)
    expect(signInProblemText('#/?signin=Send%20money%20now')).toBe(SIGN_IN_FAILED)
    expect(signInProblemText('#/?signin=__proto__')).toBe(SIGN_IN_FAILED)
  })

  it('has nothing to say when the address carries no code', () => {
    expect(signInProblemText('')).toBeNull()
    expect(signInProblemText('#/run?page=2')).toBeNull()
  })
})

describe('useSignInProblem', () => {
  it('reads the reason on arrival, takes it out of the address, and drops it when the visitor moves on', () => {
    window.history.replaceState(null, '', '#/?signin=rate_limited')
    const { result } = renderHook(() => useSignInProblem())

    expect(result.current).toMatch(/^Too many sign-in attempts/)
    expect(window.location.hash).toBe('#/')

    act(() => {
      window.location.hash = '#/run'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(result.current).toBeNull()
  })

  it('says nothing on an ordinary visit', () => {
    const { result } = renderHook(() => useSignInProblem())
    expect(result.current).toBeNull()
  })
})
