import { localYearOf } from '@rca/core/calendar'
import { DEFAULT_ATHLETE, SAMPLE_REFERENCE_NOW_MS } from '@rca/core/synthetic'
import type { AthleteSettings } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { displayWeight, weightUnit } from './athlete'
import type { AgeProfile } from './grades'

/**
 * The sample athlete: a 37-year-old man at 75 kg. The sample's efforts are drawn relative to the day it
 * is loaded, and the grades count the age from the birth year, so the birth year is set from the year of
 * the newest effort: he is 37 on it, and a year younger on the efforts of the year before.
 */
export const SAMPLE_AGE = 37
export const SAMPLE_SEX = 'male'

/** The sample athlete's profile for a season that ends in the year of `newestMs`. */
export function sampleProfileAt(newestMs: number): AgeProfile {
  return { birthYear: localYearOf(newestMs) - SAMPLE_AGE, sex: SAMPLE_SEX }
}

/** The profile of the fixed reference season, which tests and fixtures use. */
export const SAMPLE_PROFILE: AgeProfile = sampleProfileAt(SAMPLE_REFERENCE_NOW_MS)

/** The body and bike masses the sample is analysed with, whatever the visitor has entered. */
export const SAMPLE_SETTINGS: AthleteSettings = {
  massKg: DEFAULT_ATHLETE.massKg,
  bikeMassKg: DEFAULT_ATHLETE.bikeMassKg,
}

/**
 * The persona in words, with the weight in the visitor's units as Profile shows it: "a 37-year-old man at 75 kg",
 * or "at 165.3 lb" for imperial.
 */
export function sampleDescription(units: UnitSystem): string {
  return `a ${SAMPLE_AGE}-year-old man at ${displayWeight(SAMPLE_SETTINGS.massKg, units)} ${weightUnit(units)}`
}

/** The persona in the metric units the landing example, which is shown before any units are chosen, is captioned in. */
export const SAMPLE_DESCRIPTION = sampleDescription('metric')
