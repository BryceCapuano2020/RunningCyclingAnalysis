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
