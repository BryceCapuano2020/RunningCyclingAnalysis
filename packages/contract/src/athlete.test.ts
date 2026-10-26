import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BIKE_MASS_KG,
  WEIGHT_LIMITS_KG,
  primaryLanguageTag,
  unitsForAcceptLanguage,
  unitsForLocale,
} from './athlete.ts'

describe('unitsForLocale', () => {
  it('starts in pounds for en-US, en-LR and my-MM, whatever the case', () => {
    for (const locale of ['en-US', 'en-LR', 'my-MM', 'en-us', 'MY-mm']) {
      expect(unitsForLocale(locale), locale).toBe('imperial')
    }
  })

  it('starts in metric for every other locale, and when there is none', () => {
    for (const locale of ['en-GB', 'en', 'fr-FR', '']) {
      expect(unitsForLocale(locale), locale).toBe('metric')
    }
    expect(unitsForLocale(undefined)).toBe('metric')
  })
})

describe('primaryLanguageTag', () => {
  it('reads the first tag of an Accept-Language header, without its quality', () => {
    expect(primaryLanguageTag('en-US,en;q=0.9,fr;q=0.8')).toBe('en-US')
    expect(primaryLanguageTag(' en-GB ;q=0.8,en-US')).toBe('en-GB')
    expect(primaryLanguageTag('my-MM')).toBe('my-MM')
  })

  it('gives no tag for a missing or empty header', () => {
    expect(primaryLanguageTag(null)).toBeUndefined()
    expect(primaryLanguageTag(undefined)).toBeUndefined()
    expect(primaryLanguageTag('')).toBeUndefined()
    expect(primaryLanguageTag(' ,en-US')).toBeUndefined()
  })
})

describe('unitsForAcceptLanguage', () => {
  it('uses the primary tag of the sign-in request', () => {
    expect(unitsForAcceptLanguage('en-US,en;q=0.9')).toBe('imperial')
    expect(unitsForAcceptLanguage('en-GB,en-US;q=0.8')).toBe('metric')
  })

  it('gives metric when the request has no language', () => {
    expect(unitsForAcceptLanguage(undefined)).toBe('metric')
  })
})

describe('shared athlete limits', () => {
  it('hold the body and bike weight limits in kg, and the bike default', () => {
    expect(WEIGHT_LIMITS_KG).toEqual({ body: { min: 30, max: 200 }, bike: { min: 3, max: 30 } })
    expect(DEFAULT_BIKE_MASS_KG).toBe(9)
  })
})
