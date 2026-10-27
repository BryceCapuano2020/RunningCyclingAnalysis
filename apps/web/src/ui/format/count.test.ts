import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatCount } from './count'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('formatCount', () => {
  it('groups thousands with commas whatever the browser locale, as whole() does', () => {
    // A German browser would write 1.234 here. The app's numbers do not follow the browser.
    vi.spyOn(Number.prototype, 'toLocaleString').mockReturnValue('1.234')
    expect(formatCount(1234)).toBe('1,234')
  })

  it('groups every group of three digits from the right', () => {
    expect(formatCount(999)).toBe('999')
    expect(formatCount(1000)).toBe('1,000')
    expect(formatCount(1234567)).toBe('1,234,567')
  })

  it('writes a small count as its digits', () => {
    expect(formatCount(7)).toBe('7')
    expect(formatCount(0)).toBe('0')
  })
})
