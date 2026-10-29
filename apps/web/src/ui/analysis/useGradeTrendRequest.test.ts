// @vitest-environment jsdom
import { StrictMode } from 'react'
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useGradeTrendRequest } from './useGradeTrendRequest'

const SETTINGS = { massKg: 75, bikeMassKg: 9 }

function setup(gradeTrend: boolean, options?: { strict: boolean }) {
  const send = vi.fn()
  const settings = { current: SETTINGS }
  const hook = renderHook(
    ({ grade, generation }: { grade: boolean; generation: number }) =>
      useGradeTrendRequest(grade, settings, send, generation),
    {
      initialProps: { grade: gradeTrend, generation: 0 },
      ...(options?.strict ? { wrapper: StrictMode } : {}),
    },
  )
  return { send, ...hook }
}

describe('useGradeTrendRequest', () => {
  it('tells a restarted worker, which starts without grading, and only while grading is on', () => {
    const { send, rerender } = setup(true)
    expect(send).toHaveBeenCalledExactlyOnceWith({
      type: 'setGradeTrend',
      on: true,
      settings: SETTINGS,
    })

    rerender({ grade: true, generation: 0 })
    expect(send).toHaveBeenCalledTimes(1)

    rerender({ grade: true, generation: 1 })
    expect(send).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenLastCalledWith({ type: 'setGradeTrend', on: true, settings: SETTINGS })
  })

  it('does not tell a restarted worker that grading is off, as it already is', () => {
    const { send, rerender } = setup(false)
    rerender({ grade: false, generation: 1 })
    expect(send).not.toHaveBeenCalled()
  })

  it('turns grading off when it stops being known, and leaves a later worker as it starts', () => {
    const { send, rerender } = setup(true)
    rerender({ grade: false, generation: 0 })
    expect(send).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenLastCalledWith({ type: 'setGradeTrend', on: false, settings: SETTINGS })
    rerender({ grade: false, generation: 1 })
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('tells the worker that development mode creates again', () => {
    const { send } = setup(true, { strict: true })
    expect(send).toHaveBeenCalledTimes(2)
  })
})
