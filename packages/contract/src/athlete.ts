/**
 * The weight limits in kg. The API refuses a weight outside them, and the web app checks the same
 * limits in whichever units the athlete typed.
 */
export const WEIGHT_LIMITS_KG = {
  body: { min: 30, max: 200 },
  bike: { min: 3, max: 30 },
} as const

/** The bike weight a new profile or device starts with. */
export const DEFAULT_BIKE_MASS_KG = 9

export type UnitPreference = 'imperial' | 'metric'

/** The locales that start in pounds. Every other locale starts in metric. */
const POUND_LOCALES = new Set(['en-us', 'en-lr', 'my-mm'])

/** The units a language starts with: pounds for POUND_LOCALES, metric otherwise. */
export function unitsForLocale(language: string | undefined): UnitPreference {
  const pounds = language !== undefined && POUND_LOCALES.has(language.trim().toLowerCase())
  return pounds ? 'imperial' : 'metric'
}

/** The first language tag of an Accept-Language header, without its quality, or undefined. */
export function primaryLanguageTag(header: string | null | undefined): string | undefined {
  const first = header?.split(',')[0]?.split(';')[0]?.trim()
  return first ? first : undefined
}

/** The units a sign-in request starts a new account in: its primary language, else metric. */
export function unitsForAcceptLanguage(header: string | null | undefined): UnitPreference {
  return unitsForLocale(primaryLanguageTag(header))
}
