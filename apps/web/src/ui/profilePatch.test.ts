import { describe, expect, it } from 'vitest'
import type { Profile } from '@rca/contract'
import { applyPatch, athleteValuesOf, profileFields } from './profilePatch'
import type { AthleteValues } from './profilePatch'

const SAVED: Profile = {
  massKg: null,
  bikeMassKg: 9,
  units: 'imperial',
  keepFiles: false,
  birthYear: null,
  sex: null,
  updatedAt: 1,
}

const VALUES: AthleteValues = {
  settings: { massKg: 80, bikeMassKg: 9 },
  units: 'metric',
  birthYear: 1990,
  sex: 'female',
}

describe('profileFields', () => {
  it('sends only the body mass a patch sets', () => {
    expect(profileFields({ settings: { massKg: 80 } })).toEqual({ massKg: 80 })
  })

  it('sends only the bike mass a patch sets, so the body mass is left as saved', () => {
    expect(profileFields({ settings: { bikeMassKg: 12 } })).toEqual({ bikeMassKg: 12 })
  })

  it('sends a body mass that is cleared as null, so the profile holds no weight', () => {
    expect(profileFields({ settings: { massKg: null } })).toEqual({ massKg: null })
  })

  it('leaves the body mass out of a write that does not change the settings', () => {
    expect(profileFields({ units: 'metric' })).toEqual({ units: 'metric' })
  })
})

describe('athleteValuesOf', () => {
  it('reads a profile with no body mass as no weight, not as a weight', () => {
    expect(athleteValuesOf(SAVED).settings).toEqual({ massKg: null, bikeMassKg: 9 })
  })

  it('reads a saved body mass as the weight the athlete entered', () => {
    expect(athleteValuesOf({ ...SAVED, massKg: 75 }).settings).toEqual({
      massKg: 75,
      bikeMassKg: 9,
    })
  })
})

describe('applyPatch', () => {
  it('clears the body mass when the patch sets it to null, and keeps the bike mass', () => {
    expect(applyPatch(VALUES, { settings: { massKg: null } }).settings).toEqual({
      massKg: null,
      bikeMassKg: 9,
    })
  })

  it('keeps the body mass when the patch sets only the bike mass', () => {
    expect(applyPatch(VALUES, { settings: { bikeMassKg: 11 } }).settings).toEqual({
      massKg: 80,
      bikeMassKg: 11,
    })
  })
})
