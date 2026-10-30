import type { UnitSystem } from '@rca/core/units'

/**
 * The body weights taken at face value. A typed weight outside them is kept only once the athlete
 * confirms it, so a kilogram figure typed into a pound field does not quietly become a headline.
 * The API accepts a wider range (WEIGHT_LIMITS_KG); this confirmation is the web's alone.
 */
export const TYPICAL_BODY_KG = { min: 45, max: 160 } as const

export function isTypicalBodyKg(kg: number): boolean {
  return kg >= TYPICAL_BODY_KG.min && kg <= TYPICAL_BODY_KG.max
}

/**
 * A weight outside the range in kilograms, to one decimal. The nearest tenth is used when it sits
 * outside the range; otherwise it steps a tenth outward, so the figure never reads inside the range:
 * 44.96 is 44.9, and 160.04 is 160.1.
 */
export function unusualKgText(kg: number): string {
  const nearest = Math.round(kg * 10)
  const tenths =
    kg < TYPICAL_BODY_KG.min
      ? Math.min(nearest, TYPICAL_BODY_KG.min * 10 - 1)
      : Math.max(nearest, TYPICAL_BODY_KG.max * 10 + 1)
  return (tenths / 10).toFixed(1)
}

/** A questioned weight in kilograms to one decimal: out of the range as unusualKgText has it, else as it is. */
export function questionedKgText(kg: number): string {
  return isTypicalBodyKg(kg) ? kg.toFixed(1) : unusualKgText(kg)
}

/** The unit a typed weight is read in: the one it names after the number, else the field's units. */
function unitOfText(text: string, units: UnitSystem): UnitSystem {
  const trimmed = text.trim()
  if (/lbs?$/i.test(trimmed)) return 'imperial'
  if (/kgs?$/i.test(trimmed)) return 'metric'
  return units
}

/**
 * Why a weight needs a second look. A pound figure is quoted as typed, with the kilograms it comes
 * to; a kilogram figure is stated in kilograms.
 */
export function unusualWeightSentence(kg: number, text: string, units: UnitSystem): string {
  const range = `${TYPICAL_BODY_KG.min} to ${TYPICAL_BODY_KG.max} kg`
  if (unitOfText(text, units) === 'metric') {
    return `That is ${unusualKgText(kg)} kg, outside ${range}.`
  }
  const typed = text.trim().replace(/\s*lbs?$/i, '')
  return `${typed} lb is ${unusualKgText(kg)} kg, outside ${range}.`
}

/**
 * A weight this far from the one the athlete has already given, either way, is questioned even inside the
 * typical range. 150 lb typed into a kilogram field is 150 kg, which the range alone takes at face value;
 * a pound figure read as kilograms is 2.2 times the weight, a kilogram figure read as pounds 0.45 times.
 */
export const WEIGHT_JUMP_RATIO = 1.4

/**
 * With no weight given before to set a new one against, a weight above this is asked about: it is a heavy
 * athlete or pounds typed as kilograms, and the first weight sets every ride's W/kg.
 */
export const UNREFERENCED_HIGH_KG = 120

/** Kilograms in a pound. */
const KG_PER_LB = 0.45359237

/** A weight the athlete has given before, to set a new one against. */
export interface WeightReference {
  kg: number
  /** Names it in the question: "your saved weight", "your weight from 3 Mar". */
  label: string
}

/**
 * Why a typed body weight needs a second look, or null when it can be taken as typed: it is outside the
 * typical range, or it is far from the weight the athlete gave before (WEIGHT_JUMP_RATIO). The sentence
 * says what the figure comes to in kilograms, so the athlete can see which unit was read.
 */
export function weightQuestion(
  kg: number,
  text: string,
  units: UnitSystem,
  reference: WeightReference | null = null,
): string | null {
  if (!isTypicalBodyKg(kg)) return unusualWeightSentence(kg, text, units)
  if (reference === null || !(reference.kg > 0)) return highFirstWeight(kg, text, units)
  const ratio = kg / reference.kg
  if (ratio < WEIGHT_JUMP_RATIO && ratio > 1 / WEIGHT_JUMP_RATIO) return null
  const percent = Math.round(Math.abs(ratio - 1) * 100)
  const direction = ratio > 1 ? 'higher' : 'lower'
  const subject =
    unitOfText(text, units) === 'metric'
      ? 'That is'
      : `${text.trim().replace(/\s*lbs?$/i, '')} lb is`
  return `${subject} ${kg.toFixed(1)} kg, ${percent}% ${direction} than ${reference.label}, ${reference.kg.toFixed(1)} kg.`
}

/** The question for a first weight above UNREFERENCED_HIGH_KG; a kilogram figure says what it would be in pounds. */
function highFirstWeight(kg: number, text: string, units: UnitSystem): string | null {
  if (kg <= UNREFERENCED_HIGH_KG) return null
  const metric = unitOfText(text, units) === 'metric'
  const subject = metric ? 'That is' : `${text.trim().replace(/\s*lbs?$/i, '')} lb is`
  const ifPounds = metric ? ` If that is pounds, it is ${(kg * KG_PER_LB).toFixed(1)} kg.` : ''
  return `${subject} ${kg.toFixed(1)} kg, a high figure for a first weight.${ifPounds}`
}
