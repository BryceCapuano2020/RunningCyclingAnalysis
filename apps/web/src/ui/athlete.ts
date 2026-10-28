import { FIRST_GRADED_AGE } from '@rca/core/grade'
import type { Measurement } from '@rca/core/athlete'
import type { AthleteSettings } from '@rca/core/types'
import { kgToLb, lbToKg } from '@rca/core/units'
import type { UnitSystem } from '@rca/core/units'
import { WEIGHT_LIMITS_KG } from '@rca/contract'

/** The two weights the app keeps. The bike weight keeps its default unless the athlete edits it. */
export type WeightField = 'body' | 'bike'

/**
 * What the athlete has entered. The body weight is null until it is entered: nothing assumes one,
 * so a ride's W/kg, grade and the balance wait for it. The bike weight always has a value.
 */
export interface WeightSettings {
  massKg: number | null
  bikeMassKg: number
}

export const UNIT_OPTIONS: { value: UnitSystem; label: string }[] = [
  { value: 'imperial', label: 'Imperial' },
  { value: 'metric', label: 'Metric' },
]

/**
 * The body mass the analysis runs on while none is entered. The analysis needs a number, and this is
 * the 75 kg the app used before weights were optional, so ride results keep today's numbers. It is a
 * placeholder, not the athlete's weight: anything built on it must be held while weightKnown is false.
 * A stored 75 kg from before setup was answered is read as unset (see parsePreferences).
 */
export const PLACEHOLDER_BODY_KG = 75

const NUMBER_MESSAGE = 'Enter a number, such as 75 or 165.5'

/**
 * A number with a point, or a decimal comma followed by one or two digits, and an optional kg or lb.
 * Three digits after a comma are a thousands separator, which is refused rather than read as decimals.
 */
const WEIGHT_TEXT = /^(\d+(?:\.\d*)?|\d+,\d{1,2}|\.\d+|,\d{1,2})\s*(kgs?|lbs?)?$/i

export function weightKnown(settings: WeightSettings): boolean {
  return typeof settings.massKg === 'number'
}

/**
 * The settings the analysis runs on. See PLACEHOLDER_BODY_KG. Dated settings are carried only when
 * there are some, so an athlete with none has exactly the two masses.
 */
export function analysisSettings(
  settings: WeightSettings,
  measurements: readonly Measurement[] = [],
): AthleteSettings {
  return {
    massKg: settings.massKg ?? PLACEHOLDER_BODY_KG,
    bikeMassKg: settings.bikeMassKg,
    ...(measurements.length > 0 ? { measurements } : {}),
  }
}

export function weightKg(settings: WeightSettings, field: WeightField): number | null {
  return field === 'body' ? settings.massKg : settings.bikeMassKg
}

export function weightUnit(units: UnitSystem): string {
  return units === 'imperial' ? 'lb' : 'kg'
}

/** Whether a weight in kg is within the limits its field accepts. */
export function weightWithinLimits(kg: number, field: WeightField): boolean {
  const { min, max } = WEIGHT_LIMITS_KG[field]
  return kg >= min && kg <= max
}

/** One decimal, or a whole number when the value is within 0.05 of one. Blank when no weight. */
export function displayWeight(kg: number | null, units: UnitSystem): string {
  if (kg === null) return ''
  const value = units === 'imperial' ? kgToLb(kg) : kg
  const whole = Math.round(value)
  if (Math.abs(value - whole) < 0.05) return String(whole)
  return value.toFixed(1)
}

/**
 * The whole-number limits in the given units. In pounds these are the pounds whose kilograms fall
 * inside the kilogram limits, so every value the message names is accepted and nothing else is.
 */
function displayLimits(field: WeightField, units: UnitSystem): { lo: number; hi: number } {
  const { min, max } = WEIGHT_LIMITS_KG[field]
  if (units === 'metric') return { lo: min, hi: max }
  return { lo: Math.ceil(kgToLb(min)), hi: Math.floor(kgToLb(max)) }
}

export type WeightReading = { kg: number } | { error: string }

/**
 * The kilograms typed into a weight field, or why the text cannot be used. A unit typed after the
 * number wins over the units chosen, and the value is checked against the limits in that unit.
 */
export function readWeight(text: string, field: WeightField, units: UnitSystem): WeightReading {
  const match = WEIGHT_TEXT.exec(text.trim())
  if (match === null) return { error: NUMBER_MESSAGE }
  const [, digits = '', unit] = match
  let typedUnits: UnitSystem = units
  if (unit !== undefined) typedUnits = /^lb/i.test(unit) ? 'imperial' : 'metric'
  const value = Number(digits.replace(',', '.'))
  const { lo, hi } = displayLimits(field, typedUnits)
  if (value < lo || value > hi) {
    return { error: `Enter a weight from ${lo} to ${hi} ${weightUnit(typedUnits)}` }
  }
  return { kg: typedUnits === 'imperial' ? lbToKg(value) : value }
}

/**
 * The earliest year of birth the year field accepts. A year before 1920 is refused as a typing slip.
 * A year from 1920 that puts the athlete past the graded ages is kept, and their efforts are not
 * graded: they read AGE_RANGE_TEXT in grades.ts.
 */
const EARLIEST_BIRTH_YEAR = 1920

/**
 * Birth years the year field accepts: from EARLIEST_BIRTH_YEAR to the year the youngest graded age was
 * born, counted this year. The year is only asked for age grading.
 */
export function birthYearLimits(thisYear = new Date().getFullYear()): { min: number; max: number } {
  return { min: EARLIEST_BIRTH_YEAR, max: thisYear - FIRST_GRADED_AGE }
}

/** The earliest year of birth a stored preference may hold. */
const EARLIEST_PLAUSIBLE_BIRTH_YEAR = 1900

/**
 * A stored year of birth that could be real: a whole year from 1900 to this year. Loading keeps it,
 * so a year typed earlier is not cleared, even when its age falls outside the graded ages.
 */
export function isPlausibleBirthYear(
  value: unknown,
  thisYear = new Date().getFullYear(),
): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= EARLIEST_PLAUSIBLE_BIRTH_YEAR &&
    value <= thisYear
  )
}

export function isBirthYear(value: unknown, thisYear?: number): value is number {
  const { min, max } = birthYearLimits(thisYear)
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

export function displayBirthYear(year: number | null): string {
  return year === null ? '' : String(year)
}

export type BirthYearReading = { year: number | null } | { error: string }

/** The year typed, null when the field is empty, or why the text cannot be used. */
export function readBirthYear(text: string, thisYear?: number): BirthYearReading {
  const trimmed = text.trim()
  if (trimmed === '') return { year: null }
  if (/^\d{4}$/.test(trimmed) && isBirthYear(Number(trimmed), thisYear)) {
    return { year: Number(trimmed) }
  }
  const { min, max } = birthYearLimits(thisYear)
  return { error: `Enter a year from ${min} to ${max}` }
}
