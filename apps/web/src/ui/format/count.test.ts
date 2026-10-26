import { describe, expect, it, vi } from 'vitest'
import { formatCount } from './count'

describe('formatCount', () => {
  it('asks the browser locale for the digit grouping, rather than a fixed one', () => {
    const spy = vi.spyOn(Number.prototype, 'toLocaleString')
    formatCount(1234)
    expect(spy).toHaveBeenCalledWith(undefined)
    spy.mockRestore()
  })

  it('groups the digits as the runner locale does, computed with Intl so any locale passes', () => {
    expect(formatCount(1234)).toBe(new Intl.NumberFormat(undefined).format(1234))
    expect(formatCount(7)).toBe('7')
  })
})
