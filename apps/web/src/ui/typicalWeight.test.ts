import { describe, expect, it } from 'vitest'
import { isTypicalBodyKg, unusualKgText, unusualWeightSentence } from './typicalWeight'

describe('isTypicalBodyKg', () => {
  it('takes a body weight from 45 to 160 kg at face value, with both ends included', () => {
    expect(isTypicalBodyKg(45)).toBe(true)
    expect(isTypicalBodyKg(160)).toBe(true)
    expect(isTypicalBodyKg(75)).toBe(true)
  })

  it('asks for a second look at a weight just outside that range', () => {
    expect(isTypicalBodyKg(44.9)).toBe(false)
    expect(isTypicalBodyKg(160.1)).toBe(false)
    expect(isTypicalBodyKg(34)).toBe(false)
  })
})

describe('unusualKgText', () => {
  it('shows one decimal, rounded out of the range, so the figure never reads inside it', () => {
    expect(unusualKgText(34.02)).toBe('34.0')
    expect(unusualKgText(44.96)).toBe('44.9')
    expect(unusualKgText(160.04)).toBe('160.1')
    expect(unusualKgText(160.1)).toBe('160.1')
    expect(unusualKgText(44.6)).toBe('44.6')
  })

  it('steps a tenth outward when the rounded figure would sit on the range edge', () => {
    expect(unusualKgText(44.9999999999)).toBe('44.9')
    expect(unusualKgText(160.0000000001)).toBe('160.1')
  })
})

describe('unusualWeightSentence', () => {
  it('states a metric weight as the kilograms it is', () => {
    expect(unusualWeightSentence(34.02, '34', 'metric')).toBe(
      'That is 34.0 kg, outside 45 to 160 kg.',
    )
  })

  it('quotes a pound figure as typed, with the kilograms it comes to', () => {
    expect(unusualWeightSentence(34.02, '75', 'imperial')).toBe(
      '75 lb is 34.0 kg, outside 45 to 160 kg.',
    )
  })

  it('reads a unit typed after the number as the unit it names', () => {
    expect(unusualWeightSentence(34.02, '34 kg', 'imperial')).toBe(
      'That is 34.0 kg, outside 45 to 160 kg.',
    )
    expect(unusualWeightSentence(34.02, '75 lb', 'metric')).toBe(
      '75 lb is 34.0 kg, outside 45 to 160 kg.',
    )
  })
})
