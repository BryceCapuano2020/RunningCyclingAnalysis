// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dedupeKey } from '@rca/core/session'
import {
  COUNTED_RUNS_KEY,
  isCountableKey,
  loadCountedRuns,
  MAX_COUNTED_RUNS,
  parseCountedRuns,
  storeCountedRuns,
  subscribeCountedRuns,
} from './countedRunsStore'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('the counted runs kept in this browser', () => {
  it('survives a reload: what is stored is read back, sorted', () => {
    expect(storeCountedRuns(['run-200', 'run-100'])).toBe(true)
    expect(loadCountedRuns()).toEqual(['run-100', 'run-200'])
  })

  it('drops anything that is not a run’s workout key, and repeats', () => {
    expect(
      parseCountedRuns(JSON.stringify(['run-5', 'run-5', 'ride-5', 7, 'run-x', null])),
    ).toEqual(['run-5'])
  })

  it('reads damaged storage as no choices', () => {
    expect(parseCountedRuns('{')).toEqual([])
    expect(parseCountedRuns('{"a":1}')).toEqual([])
    expect(parseCountedRuns(null)).toEqual([])
  })

  it('never drops a stored choice for being many', () => {
    const many = Array.from({ length: MAX_COUNTED_RUNS + 5 }, (_, i) => `run-${i}`)
    expect(parseCountedRuns(JSON.stringify(many))).toHaveLength(MAX_COUNTED_RUNS + 5)
  })

  it('accepts exactly the keys dedupeKey writes for a run, and no other sport’s or shape', () => {
    expect(isCountableKey(dedupeKey('run', 1_700_000_123_456))).toBe(true)
    expect(isCountableKey(dedupeKey('ride', 1_700_000_123_456))).toBe(false)
    expect(isCountableKey('run-')).toBe(false)
    expect(isCountableKey('run-12x')).toBe(false)
    expect(isCountableKey('xrun-12')).toBe(false)
  })

  it('tells its subscribers of a change made here, and of the same key changed in another tab', () => {
    const heard = vi.fn()
    const stop = subscribeCountedRuns(heard)
    storeCountedRuns(['run-1'])
    expect(heard).toHaveBeenCalledTimes(1)
    window.dispatchEvent(new StorageEvent('storage', { key: COUNTED_RUNS_KEY }))
    window.dispatchEvent(new StorageEvent('storage', { key: 'rca.period.v1' }))
    expect(heard).toHaveBeenCalledTimes(2)
    stop()
    storeCountedRuns(['run-2'])
    expect(heard).toHaveBeenCalledTimes(2)
  })

  it('does not tell them of a change the browser refused', () => {
    const heard = vi.fn()
    const stop = subscribeCountedRuns(heard)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full')
    })
    expect(storeCountedRuns(['run-1'])).toBe(false)
    expect(heard).not.toHaveBeenCalled()
    stop()
  })

  it('removes the entry when the list is emptied', () => {
    storeCountedRuns(['run-1'])
    storeCountedRuns([])
    expect(localStorage.getItem('rca.countedRuns.v1')).toBeNull()
  })

  it('says false when the browser refuses the store, and reads empty when it refuses the read', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(storeCountedRuns(['run-1'])).toBe(false)
    expect(loadCountedRuns()).toEqual([])
  })
})
