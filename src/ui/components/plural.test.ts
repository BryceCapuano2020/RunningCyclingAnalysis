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
})
