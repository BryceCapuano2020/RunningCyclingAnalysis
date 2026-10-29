import { describe, expect, it } from 'vitest'
import { readingParts, valueTicks } from './workbenchScale'

describe('readingParts', () => {
  it('splits a written reading into its number and its unit', () => {
    expect(readingParts('5:03 /km')).toEqual({ value: '5:03', unit: '/km' })
    expect(readingParts('152 bpm')).toEqual({ value: '152', unit: 'bpm' })
    expect(readingParts('1,215 ft')).toEqual({ value: '1,215', unit: 'ft' })
    expect(readingParts('12.5°C')).toEqual({ value: '12.5', unit: '°C' })
    expect(readingParts('176 steps/min')).toEqual({ value: '176', unit: 'steps/min' })
  })

  it('keeps a dash for a reading it cannot split', () => {
    expect(readingParts('—')).toEqual({ value: '—', unit: '' })
  })
})

describe('valueTicks', () => {
  it('puts a pace on round times, in the order it sits on the axis, from the speed it is at', () => {
    // 3.3 to 3.9 m/s is 5:03 to 4:16 a kilometre: ticks fall on 4:30, 4:45 and 5:00, not on the ends.
    const ticks = valueTicks('speed', 'run', 'metric', 3.3, 3.9, 3)
    expect(ticks.map((tick) => tick.label)).toEqual(['4:30', '4:45', '5:00'])
    expect(ticks[0]!.value).toBeCloseTo(1000 / 270, 5)
    expect(ticks[0]!.value).toBeGreaterThan(ticks[2]!.value)
  })

  it('counts a ride’s speed in km/h or mph, and elevation in feet when imperial', () => {
    expect(valueTicks('speed', 'ride', 'metric', 5, 10, 3).map((tick) => tick.label)).toEqual([
      '20',
      '25',
      '30',
      '35',
    ])
    const feet = valueTicks('altitude', 'ride', 'imperial', 100, 200, 3).map((tick) => tick.label)
    expect(feet.every((label) => Number.isFinite(Number(label.replace(',', ''))))).toBe(true)
    expect(Number(feet[0])).toBeGreaterThan(300)
  })

  it('keeps to about as many ticks as the row has room for', () => {
    expect(valueTicks('heartRate', 'run', 'metric', 119, 129, 3).length).toBeLessThanOrEqual(4)
    expect(valueTicks('heartRate', 'run', 'metric', 119, 129, 2).length).toBeLessThanOrEqual(3)
  })
})
