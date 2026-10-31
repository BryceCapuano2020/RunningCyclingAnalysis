// @vitest-environment jsdom
import { act } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  apart,
  ready,
  SETTINGS,
  stateWith,
  types,
  stubFakeWorker,
  worker,
} from '../test/signedInAnalysis'

stubFakeWorker()

describe('what the browser kept before sign-in', () => {
  it('has no offer until the worker makes one', () => {
    const { result } = ready()
    expect(result.current.deviceOffer).toBeNull()
    expect(result.current.adoption).toBeNull()
  })

  it('shows the worker’s offer, and forgets it when the library is read again', () => {
    const { result } = ready()
    apart({ type: 'deviceOffer', adoptable: 3, again: 1, held: 0 })
    expect(result.current.deviceOffer).toEqual({ adoptable: 3, again: 1, held: 0 })

    act(() => result.current.retryLibrary())
    expect(result.current.deviceOffer).toBeNull()
  })

  it('asks the worker to add them for the signed-in account', () => {
    const { result } = ready()
    act(() => result.current.adoptDevice())

    expect(worker().posted.at(-1)).toMatchObject({
      type: 'adoptDevice',
      userId: 'u1',
      settings: SETTINGS,
    })
  })

  it('holds the page busy while they are added, and shows how it ended', () => {
    const { result } = ready()
    act(() => result.current.adoptDevice())
    expect(result.current.busy).toBe(true)

    apart({ type: 'adoption', saved: 2, conflicts: 1, failed: 0, again: 0, held: 0 })
    act(() => worker().reply({ type: 'state', state: stateWith(2) }))

    expect(result.current.busy).toBe(false)
    expect(result.current.adoption).toEqual({
      saved: 2,
      conflicts: 1,
      failed: 0,
      again: 0,
      held: 0,
    })
    expect(result.current.state.totalActivities).toBe(2)
  })

  it('puts the result away on request', () => {
    const { result } = ready()
    apart({ type: 'adoption', saved: 1, conflicts: 0, failed: 0, again: 0, held: 0 })
    act(() => result.current.dismissAdoption())
    expect(result.current.adoption).toBeNull()
  })

  it('asks the worker to remove the kept library without holding the page busy', () => {
    const { result } = ready()
    act(() => result.current.forgetDeviceLibrary())

    expect(types().at(-1)).toBe('forgetDeviceLibrary')
    expect(result.current.busy).toBe(false)
  })

  it('shows the account’s state that answers the removal', () => {
    const { result } = ready()
    apart({ type: 'deviceOffer', adoptable: 2, again: 0, held: 0 })
    act(() => result.current.forgetDeviceLibrary())
    apart({ type: 'deviceOffer', adoptable: 0, again: 0, held: 0 })
    act(() => worker().reply({ type: 'state', state: stateWith(4) }))

    expect(result.current.deviceOffer).toEqual({ adoptable: 0, again: 0, held: 0 })
    expect(result.current.state.totalActivities).toBe(4)
  })
})
