import { describe, expect, it } from 'vitest'
import { lowerFirst, upperFirst } from './firstLetter'

describe('first letter', () => {
  it('lowers the first letter only', () => {
    expect(lowerFirst('Easy ride')).toBe('easy ride')
    expect(lowerFirst('')).toBe('')
  })

  it('raises the first letter only', () => {
    expect(upperFirst('easy ride')).toBe('Easy ride')
    expect(upperFirst('')).toBe('')
  })
})
