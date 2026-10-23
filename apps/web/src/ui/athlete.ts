import { FIRST_GRADED_AGE, LAST_GRADED_AGE } from '@rca/core/grade'
import type { AthleteSettings } from '@rca/core/types'
import { kgToLb, lbToKg } from '@rca/core/units'
import type { UnitSystem } from '@rca/core/units'

/** The two weights the app keeps. The bike weight keeps its default unless the athlete edits it. */
export type WeightField = 'body' | 'bike'

/** Limits in kg, checked after converting what was typed. */
const WEIGHT_LIMITS_KG: Record<WeightField, { min: number; max: number }> = {
  body: { min: 30, max: 200 },
  bike: { min: 3, max: 30 },
}

export const UNIT_OPTIONS: { value: UnitSystem; label: string }[] = [
  { value: 'imperial', label: 'Imperial' },
  { value: 'metric', label: 'Metric' },
]

const DECIMAL = /^(\d+\.?\d*|\.\d+)$/

export function weightKg(settings: AthleteSettings, field: WeightField): number {
  return field === 'body' ? settings.massKg : settings.bikeMassKg
}

export function weightUnit(units: UnitSystem): string {
  return units === 'imperial' ? 'lb' : 'kg'
}

/** One decimal, or a whole number when the value is within 0.05 of one. */
export function displayWeight(kg: number, units: UnitSystem): string {
  const value = units === 'imperial' ? kgToLb(kg) : kg
  const whole = Math.round(value)
  if (Math.abs(value - whole) < 0.05) return String(whole)
  return value.toFixed(1)
}

/** Whole display-unit limits, inside the kg limits. */
function displayLimits(field: WeightField, units: UnitSystem): { lo: number; hi: number } {
  const { min, max } = WEIGHT_LIMITS_KG[field]
  if (units === 'metric') return { lo: min, hi: max }
  return { lo: Math.ceil(kgToLb(min)), hi: Math.floor(kgToLb(max)) }
}

export type WeightReading = { kg: number } | { error: string }

/** The kilograms typed into a weight field, or why the text cannot be used. */
export function readWeight(text: string, field: WeightField, units: UnitSystem): WeightReading {
  const trimmed = text.trim()
  if (!DECIMAL.test(trimmed)) return { error: 'Enter a number' }
  const value = Number(trimmed)
  const kg = units === 'imperial' ? lbToKg(value) : value
  const { min, max } = WEIGHT_LIMITS_KG[field]
  if (kg < min || kg > max) {
    const { lo, hi } = displayLimits(field, units)
    return { error: `Enter a weight from ${lo} to ${hi} ${weightUnit(units)}` }
  }
  return { kg }
}

/**
 * Birth years for the ages the grading covers, counted this year. The year is only asked for age
 * grading, so a year outside this range is either a typing slip or not a person it applies to.
 */
export function birthYearLimits(thisYear = new Date().getFullYear()): { min: number; max: number } {
  return { min: thisYear - LAST_GRADED_AGE, max: thisYear - FIRST_GRADED_AGE }
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
