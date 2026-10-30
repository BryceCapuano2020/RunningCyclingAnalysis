import { describe, expect, it } from 'vitest'
import {
  isTypicalBodyKg,
  questionedKgText,
  unusualKgText,
  unusualWeightSentence,
  weightQuestion,
} from './typicalWeight'

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

describe('weightQuestion', () => {
  const SAVED = { kg: 68, label: 'your saved weight' }

  it('has nothing to ask of a typical weight near the one given before, or a modest one with none given', () => {
    expect(weightQuestion(70, '70', 'metric', SAVED)).toBeNull()
    expect(weightQuestion(70, '70', 'metric')).toBeNull()
    expect(weightQuestion(120, '120', 'metric')).toBeNull()
    expect(weightQuestion(70, '70', 'metric', { kg: 0, label: 'x' })).toBeNull()
  })

  it('asks about a weight outside the typical range, whatever was given before', () => {
    expect(weightQuestion(34.02, '75', 'imperial', SAVED)).toBe(
      '75 lb is 34.0 kg, outside 45 to 160 kg.',
    )
  })

  it('asks about pounds typed into a kilogram field, which the range alone takes at face value', () => {
    expect(weightQuestion(150, '150', 'metric', SAVED)).toBe(
      'That is 150.0 kg, 121% higher than your saved weight, 68.0 kg.',
    )
  })

  it('asks about kilograms typed into a pound field, quoting the figure as typed', () => {
    expect(weightQuestion(30.84, '68', 'imperial', SAVED)).toBe(
      '68 lb is 30.8 kg, outside 45 to 160 kg.',
    )
  })

  it('lets a change of up to 40% through either way, and asks beyond it', () => {
    expect(weightQuestion(68 * 1.39, '94.5', 'metric', SAVED)).toBeNull()
    expect(weightQuestion(96, '96', 'metric', SAVED)).not.toBeNull()
    expect(weightQuestion(68 / 1.39, '48.9', 'metric', SAVED)).toBeNull()
    expect(weightQuestion(48.5, '48.5', 'metric', SAVED)).not.toBeNull()
  })
})

describe('weightQuestion for a first weight', () => {
  it('asks about a high one, and says what it would be if it were pounds', () => {
    expect(weightQuestion(150, '150', 'metric')).toBe(
      'That is 150.0 kg, a high figure for a first weight. If that is pounds, it is 68.0 kg.',
    )
  })

  it('quotes a high pound figure as typed, with no second reading', () => {
    expect(weightQuestion(136.08, '300', 'imperial')).toBe(
      '300 lb is 136.1 kg, a high figure for a first weight.',
    )
  })
})

describe('questionedKgText', () => {
  it('writes a weight inside the range as it is, and one outside as the range reads it', () => {
    expect(questionedKgText(150)).toBe('150.0')
    expect(questionedKgText(44.96)).toBe('44.9')
    expect(questionedKgText(160.04)).toBe('160.1')
  })
})
