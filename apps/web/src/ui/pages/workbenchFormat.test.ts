import { describe, expect, it } from 'vitest'
import {
  defaultMetrics,
  displayValue,
  metricUnit,
  rangeHeadings,
  readingRange,
} from './workbenchFormat'
import { parseClockTime } from './workbenchTime'

describe('workbenchFormat', () => {
  it('labels run and ride cadence in their normalized units', () => {
    expect(metricUnit('cadence', 'run', 'metric')).toBe('steps/min')
    expect(metricUnit('cadence', 'ride', 'metric')).toBe('rev/min')
    expect(metricUnit('cadence', 'run', 'metric', 'unknown')).toBe('counts/min')
    expect(displayValue('cadence', 176.4, 'run', 'metric', 'unknown')).toBe('176 counts/min')
  })

  it('reads a run’s speed as a pace and a ride’s as a speed', () => {
    expect(displayValue('speed', 3, 'run', 'metric')).toBe('5:33 /km')
    expect(displayValue('speed', 8, 'ride', 'metric')).toBe('28.8 km/h')
    expect(metricUnit('speed', 'run', 'imperial')).toBe('min/mi')
    expect(metricUnit('speed', 'ride', 'imperial')).toBe('mph')
  })

  it('puts a pace’s fastest reading first in its range', () => {
    expect(readingRange('speed', 'run', 2, 4)).toEqual({ lowest: 4, highest: 2 })
    expect(readingRange('speed', 'ride', 2, 4)).toEqual({ lowest: 2, highest: 4 })
    expect(readingRange('heartRate', 'run', 100, 160)).toEqual({ lowest: 100, highest: 160 })
  })

  it('names a pace’s extremes fastest and slowest, and any other measure’s lowest and highest', () => {
    expect(rangeHeadings('speed', 'run')).toEqual(['Fastest', 'Slowest'])
    expect(rangeHeadings('speed', 'ride')).toEqual(['Lowest', 'Highest'])
    expect(rangeHeadings('heartRate', 'run')).toEqual(['Lowest', 'Highest'])
  })
})

describe('defaultMetrics', () => {
  const all = ['speed', 'power', 'heartRate', 'cadence', 'altitude', 'temperature'] as const

  it('opens a ride on its power, heart rate and altitude, in the order of the stack', () => {
    expect(defaultMetrics(all, 'ride')).toEqual(['power', 'heartRate', 'altitude'])
  })

  it('opens a ride with no power on its speed, heart rate and altitude', () => {
    expect(defaultMetrics(['speed', 'heartRate', 'cadence', 'altitude'], 'ride')).toEqual([
      'speed',
      'heartRate',
      'altitude',
    ])
  })

  it('opens a run on its pace, heart rate and altitude, even with power recorded', () => {
    expect(defaultMetrics(all, 'run')).toEqual(['speed', 'heartRate', 'altitude'])
  })

  it('leaves out what the activity did not record, and plots at most three', () => {
    expect(defaultMetrics(['speed', 'cadence'], 'run')).toEqual(['speed'])
    expect(defaultMetrics([], 'ride')).toEqual([])
    for (const sport of ['run', 'ride'] as const) {
      expect(defaultMetrics(all, sport).length).toBeLessThanOrEqual(3)
    }
  })
})

describe('parseClockTime', () => {
  it('reads m:ss, h:mm:ss and plain seconds', () => {
    expect(parseClockTime('12:34')).toBe(754)
    expect(parseClockTime('1:02:03')).toBe(3723)
    expect(parseClockTime(' 90 ')).toBe(90)
  })

  it('refuses anything else', () => {
    for (const text of ['', ':', '1:2', '1:75', '1:61:00', '1.5', '-3', 'abc', '12:34:56:78'])
      expect(parseClockTime(text)).toBeNull()
  })
})
