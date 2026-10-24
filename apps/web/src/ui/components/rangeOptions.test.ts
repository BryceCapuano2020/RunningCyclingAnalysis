import { describe, expect, it } from 'vitest'
import { previousPeriodLabel, rangePeriod } from './rangeOptions'

describe('previousPeriodLabel', () => {
  it('names the period before a selected period of the same length', () => {
    expect(previousPeriodLabel(42)).toBe('Previous 6 weeks')
    expect(previousPeriodLabel(91)).toBe('Previous 3 months')
    expect(previousPeriodLabel(365)).toBe('Previous year')
  })

  it('has no previous period for all time', () => {
    expect(previousPeriodLabel(null)).toBeNull()
  })

  it('counts in days for a period that is not one of the options', () => {
    expect(previousPeriodLabel(7)).toBe('Previous 7 days')
    expect(rangePeriod(7)).toBe('Last 7 days')
  })
})
