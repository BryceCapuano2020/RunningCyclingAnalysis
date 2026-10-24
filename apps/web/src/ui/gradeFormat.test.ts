import { describe, expect, it } from 'vitest'
import { formatGrade, wholeGrade } from './gradeFormat'

describe('wholeGrade', () => {
  it('floors a grade to its whole percent, so 64.5% reads as 64%', () => {
    expect(wholeGrade(0.6451)).toBe(64)
    expect(wholeGrade(0.5849)).toBe(58)
  })

  it('never reads above its level band: 89.6% is 89%, not 90%', () => {
    expect(wholeGrade(0.896)).toBe(89)
  })
})

describe('formatGrade', () => {
  it('writes the whole percent the cards show', () => {
    expect(formatGrade(0.6451)).toBe('64%')
    expect(formatGrade(0.5849)).toBe('58%')
    expect(formatGrade(0.896)).toBe('89%')
  })
})
