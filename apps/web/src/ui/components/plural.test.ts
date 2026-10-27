import { describe, expect, it } from 'vitest'
import { plural } from './plural'

describe('plural', () => {
  it('uses the singular for exactly one', () => {
    expect(plural(1, 'file')).toBe('1 file')
  })

  it('adds an s otherwise, including zero', () => {
    expect(plural(0, 'run')).toBe('0 runs')
    expect(plural(2, 'file')).toBe('2 files')
  })

  it('accepts an irregular plural', () => {
    expect(plural(2, 'activity', 'activities')).toBe('2 activities')
  })

  it('groups a whole count of a thousand or more, as formatCount does', () => {
    expect(plural(1204, 'file')).toBe('1,204 files')
  })

  it('groups the whole part of a fraction too, such as 1,204.5 hours', () => {
    expect(plural(1204.5, 'hour')).toBe('1,204.5 hours')
  })

  it("keeps a fraction's decimals, since an hour or a week is not a count", () => {
    expect(plural(1.5, 'hour')).toBe('1.5 hours')
  })
})
