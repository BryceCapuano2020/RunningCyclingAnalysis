// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useSaveStatus } from './useSaveStatus'

describe('useSaveStatus', () => {
  it('moves a field from saving to saved when its change succeeds, and reports success', async () => {
    const { result } = renderHook(() => useSaveStatus<'year'>())
    let finish: () => void = () => undefined

    let outcome: Promise<boolean> | undefined
    act(() => {
      outcome = result.current.save(
        'year',
        () =>
          new Promise<void>((resolve) => {
            finish = resolve
          }),
      )
    })
    expect(result.current.states.year).toBe('saving')

    await act(async () => finish())
    await expect(outcome).resolves.toBe(true)
    expect(result.current.states.year).toBe('saved')
  })

  it('marks the field failed and reports it when its change is refused, without rethrowing', async () => {
    const { result } = renderHook(() => useSaveStatus<'year'>())

    let outcome: Promise<boolean> | undefined
    await act(async () => {
      outcome = result.current.save('year', async () => {
        throw new Error('Offline')
      })
      await outcome
    })

    await expect(outcome).resolves.toBe(false)
    expect(result.current.states.year).toBe('failed')
  })

  it('keeps each field’s state apart from the others', async () => {
    const { result } = renderHook(() => useSaveStatus<'sex' | 'units'>())

    await act(async () => {
      await result.current.save('sex', async () => {})
    })

    expect(result.current.states.sex).toBe('saved')
    expect(result.current.states.units).toBeUndefined()
  })

  it('forgets a field’s state when it is cleared, so a refusal is not kept once the field is edited', async () => {
    const { result } = renderHook(() => useSaveStatus<'year' | 'sex'>())

    await act(async () => {
      await result.current.save('year', async () => {
        throw new Error('Offline')
      })
      await result.current.save('sex', async () => {})
    })
    act(() => result.current.clear('year'))

    expect(result.current.states.year).toBeUndefined()
    expect(result.current.states.sex).toBe('saved')
  })
})
