import { describe, expect, it } from 'vitest'
import type { Period } from '@rca/core/period'
import {
  CUSTOM_OPTION,
  fallbackNote,
  LIBRARY_RANGE_OPTIONS,
  RANGE_OPTIONS,
  choiceOfValue,
  optionValue,
  periodDates,
  periodName,
  previousPeriodLabel,
} from './rangeOptions'

const JUNE = new Date(2025, 5, 3, 12).getTime()
const MAY = new Date(2025, 4, 12, 12).getTime()

function period(overrides: Partial<Period>): Period {
  return { choice: 'default', startMs: MAY, endMs: JUNE, days: 22, fellBack: false, ...overrides }
}

describe('RANGE_OPTIONS', () => {
  it('offers 6 weeks, then the 12 weeks default, 12 months and all time, in that order', () => {
    expect(RANGE_OPTIONS.map((option) => option.label)).toEqual([
      '6 weeks',
      '12 weeks',
      '12 months',
      'All time',
    ])
  })

  it('labels the default as its 12 weeks, and keeps its stored value', () => {
    expect(RANGE_OPTIONS.find((option) => option.choice === 'default')).toEqual({
      value: 'default',
      label: '12 weeks',
      short: '12 wk',
      choice: 'default',
    })
  })

  it('leaves the default out of the library, which has no default window', () => {
    expect(LIBRARY_RANGE_OPTIONS.map((option) => option.label)).toEqual([
      '6 weeks',
      '12 months',
      'All time',
    ])
  })

  it('round-trips each choice through its control value', () => {
    for (const option of RANGE_OPTIONS) {
      expect(optionValue(option.choice)).toBe(option.value)
      expect(choiceOfValue(option.value)).toEqual(option.choice)
    }
    expect(choiceOfValue('nonsense')).toBeUndefined()
  })

  it('no longer offers 3 months, so its stored value has no option', () => {
    expect(choiceOfValue('91')).toBeUndefined()
  })
})

describe('periodDates', () => {
  it('dates a period from its first day to its last', () => {
    expect(periodDates(period({ startMs: MAY, endMs: JUNE }))).toBe('12 May – 3 Jun 2025')
  })

  it('has no dates for an empty library', () => {
    expect(periodDates(period({ startMs: null, endMs: null, days: null }))).toBe('')
  })
})

describe('periodName', () => {
  it('names the period the figures are for, in the words the control uses', () => {
    expect(periodName(42)).toBe('6 weeks')
    expect(periodName(84)).toBe('12 weeks')
    expect(periodName(365)).toBe('12 months')
    expect(periodName(null)).toBe('All time')
  })

  it('counts days for a custom range', () => {
    expect(periodName(10)).toBe('10 days')
  })
})

describe('previousPeriodLabel', () => {
  it('names the period before a selected period of the same length', () => {
    expect(previousPeriodLabel(42)).toBe('Previous 6 weeks')
    expect(previousPeriodLabel(84)).toBe('Previous 12 weeks')
    expect(previousPeriodLabel(365)).toBe('Previous 12 months')
  })

  it('has no previous period for all time', () => {
    expect(previousPeriodLabel(null)).toBeNull()
  })

  it('counts in days for a period that is not one of the named lengths', () => {
    expect(previousPeriodLabel(55)).toBe('Previous 55 days')
  })

  it('uses the singular for one day', () => {
    expect(previousPeriodLabel(1)).toBe('Previous 1 day')
  })

  it('groups the days from a thousand on', () => {
    expect(previousPeriodLabel(1500)).toBe('Previous 1,500 days')
  })
})

describe('fallbackNote', () => {
  it('names the sport the last 12 weeks lack, and says the period shows all time', () => {
    expect(fallbackNote(['ride'])).toBe('Your last 12 weeks hold no rides, so this shows all time.')
    expect(fallbackNote(['run'])).toBe('Your last 12 weeks hold no runs, so this shows all time.')
  })

  it('names two sports in the order the sports sit, whatever order they are given in', () => {
    expect(fallbackNote(['ride', 'run'])).toBe(
      'Your last 12 weeks hold no runs or rides, so this shows all time.',
    )
  })

  it('has nothing to say when no sport is missing', () => {
    expect(fallbackNote([])).toBeNull()
  })
})

describe('CUSTOM_OPTION', () => {
  it('is the Custom segment, whose value a custom range shares', () => {
    expect(CUSTOM_OPTION).toEqual({ value: 'custom', label: 'Custom' })
    expect(optionValue({ from: '2025-05-12', to: '2025-06-03' })).toBe(CUSTOM_OPTION.value)
    expect(choiceOfValue(CUSTOM_OPTION.value)).toBeUndefined()
  })
})
