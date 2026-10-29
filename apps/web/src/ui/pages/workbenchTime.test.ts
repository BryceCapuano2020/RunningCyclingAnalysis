import { describe, expect, it } from 'vitest'
import { clampSelection } from './workbenchTime'

describe('clampSelection', () => {
  it('pulls a selection inside the activity, at least a second long', () => {
    expect(clampSelection({ startS: -5, endS: 500 }, 100)).toEqual({ startS: 0, endS: 100 })
    expect(clampSelection({ startS: 100, endS: 100 }, 100)).toEqual({ startS: 99, endS: 100 })
  })

  it('never returns a value that is not a number', () => {
    expect(clampSelection({ startS: Number.NaN, endS: 40 }, 100)).toEqual({ startS: 0, endS: 40 })
    expect(clampSelection({ startS: 10, endS: Number.NaN }, 100)).toEqual({ startS: 10, endS: 100 })
    expect(clampSelection({ startS: 10, endS: Number.POSITIVE_INFINITY }, 100)).toEqual({
      startS: 10,
      endS: 100,
    })
  })
})
