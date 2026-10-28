import { describe, expect, it } from 'vitest'
import { MEASUREMENT_LIMITS } from '@rca/contract'
import {
  displaySetting,
  readSetting,
  SETTING_CHOICES,
  settingLabel,
  settingOrder,
} from './measurementInput'

describe('the settings the form offers', () => {
  it('names each by its kind and sport, in list order', () => {
    expect(SETTING_CHOICES.map((choice) => choice.label)).toEqual([
      'Body weight',
      'Max heart rate (run)',
      'Max heart rate (ride)',
      'Threshold power (ride)',
      'Threshold pace (run)',
    ])
    expect(settingLabel('thresholdPace', 'run')).toBe('Threshold pace (run)')
    expect(settingOrder({ kind: 'maxHeartRate', sport: 'ride' })).toBe(2)
  })
})

describe('readSetting', () => {
  it('reads a body weight in the units typed, as kilograms', () => {
    expect(readSetting('massKg', '82.5', 'metric')).toEqual({ value: 82.5 })
    const pounds = readSetting('massKg', '165', 'imperial')
    expect(pounds).toEqual({ value: expect.closeTo(74.84, 2) })
    expect(readSetting('massKg', 'heavy', 'metric')).toHaveProperty('error')
  })

  it('reads a whole number of beats or watts within the limits', () => {
    expect(readSetting('maxHeartRate', ' 188 ', 'metric')).toEqual({ value: 188 })
    expect(readSetting('thresholdPower', '250', 'imperial')).toEqual({ value: 250 })
    for (const text of ['', '18', '188.5', '5000', 'abc']) {
      expect(readSetting('maxHeartRate', text, 'metric')).toHaveProperty('error')
    }
    const { min } = MEASUREMENT_LIMITS.thresholdPower
    expect(readSetting('thresholdPower', String(min - 1), 'metric')).toHaveProperty('error')
  })

  it('reads a pace per kilometre or per mile as a speed', () => {
    expect(readSetting('thresholdPace', '5:00', 'metric')).toEqual({ value: 1000 / 300 })
    expect(readSetting('thresholdPace', '8:00', 'imperial')).toEqual({ value: 1609.344 / 480 })
    for (const text of ['', '5', '5:75', '0:30', '30:00', 'fast']) {
      expect(readSetting('thresholdPace', text, 'metric')).toHaveProperty('error')
    }
  })

  it('says the range a pace may take in the units asked for', () => {
    const reading = readSetting('thresholdPace', '30:00', 'metric')
    expect(reading).toEqual({ error: 'Enter a pace from 2:13 to 11:07 /km, such as 5:30' })
  })
})

describe('displaySetting', () => {
  it('writes each value with its unit', () => {
    expect(displaySetting('massKg', 82.5, 'metric')).toBe('82.5 kg')
    expect(displaySetting('massKg', 75, 'imperial')).toBe('165.3 lb')
    expect(displaySetting('maxHeartRate', 188, 'metric')).toBe('188 bpm')
    expect(displaySetting('thresholdPower', 250.4, 'metric')).toBe('250 W')
    expect(displaySetting('thresholdPace', 1000 / 330, 'metric')).toBe('5:30 /km')
  })
})
