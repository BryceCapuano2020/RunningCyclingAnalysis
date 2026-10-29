import { DEFAULT_ATHLETE, SAMPLE_REFERENCE_NOW_MS } from '@rca/core/synthetic'
import type { AthleteSettings } from '@rca/core/types'
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
  return { birthYear: new Date(newestMs).getFullYear() - SAMPLE_AGE, sex: SAMPLE_SEX }
}

/** The profile of the fixed reference season, which tests and fixtures use. */
export const SAMPLE_PROFILE: AgeProfile = sampleProfileAt(SAMPLE_REFERENCE_NOW_MS)

/** The body and bike masses the sample is analysed with, whatever the visitor has entered. */
export const SAMPLE_SETTINGS: AthleteSettings = {
  massKg: DEFAULT_ATHLETE.massKg,
  bikeMassKg: DEFAULT_ATHLETE.bikeMassKg,
}

/** The persona in words, for the banner and the landing example: "a 37-year-old man at 75 kg". */
export const SAMPLE_DESCRIPTION = `a ${SAMPLE_AGE}-year-old man at ${SAMPLE_SETTINGS.massKg} kg`
