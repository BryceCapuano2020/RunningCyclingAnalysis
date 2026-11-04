import { describe, expect, it } from 'vitest'
import type { AgeProfile } from '../grade'
import { historyOf } from '../history'
import { balanceLibrary, REFERENCE, SETTINGS, TWELVE_YEARS } from '../history/test/balanceLibrary'
import { standingOfYears } from './years'

const PROFILE: AgeProfile = { birthYear: 1985, sex: 'male' }
const balance = historyOf(balanceLibrary(TWELVE_YEARS), {
  settings: SETTINGS,
  setAside: new Set(),
  nowMs: Date.UTC(2030, 0, 1),
  gate: null,
  effortReference: REFERENCE,
}).balance

describe('standingOfYears', () => {
  it('leans to the run through 2017, is level in 2019 and leans to the ride from 2020, as the twelve years are written to', () => {
    const leans = standingOfYears(balance, PROFILE, ['run', 'ride']).map(
      ({ year, lead }) => [year, lead?.lean ?? null] as const,
    )
    expect(leans).toEqual([
      [2013, 'run'],
      [2014, 'run'],
      [2015, 'run'],
      [2016, null],
      [2017, 'run'],
      [2019, 'even'],
      [2020, 'ride'],
      [2021, 'ride'],
      [2022, 'ride'],
      [2023, 'ride'],
      [2024, 'ride'],
    ])
  })

  it('has no lead where a sport is left out, and keeps the year', () => {
    const runOnly = standingOfYears(balance, PROFILE, ['run'])
    expect(runOnly).toHaveLength(balance.length)
    expect(runOnly.every(({ lead }) => lead === null)).toBe(true)
    expect(runOnly.every(({ grades }) => grades.ride === undefined)).toBe(true)
  })
})
