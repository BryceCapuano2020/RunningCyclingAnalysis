// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { dayNoonMs } from './liftDay'
import { useLiftDay } from './useLiftDay'

afterEach(() => {
  window.location.hash = ''
})

describe('useLiftDay', () => {
  it('reads today with no day in the address, and opens another day as a step in history', () => {
    const now = dayNoonMs('2031-01-10')!
    const view = renderHook(() => useLiftDay(now))
    expect(view.result.current).toMatchObject({ day: '2031-01-10', today: '2031-01-10' })

    act(() => view.result.current.openDay('2031-01-08'))
    // The hashchange event comes after the assignment; the hook follows the address it reads.
    act(() => void window.dispatchEvent(new HashChangeEvent('hashchange')))
    expect(view.result.current.day).toBe('2031-01-08')
    expect(window.location.hash).toContain('2031-01-08')
  })
})
