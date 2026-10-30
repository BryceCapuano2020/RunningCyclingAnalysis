import { describe, expect, it } from 'vitest'
import { bodyMassOn, hasDatedMass, massAtFor, sameMasses } from './mass'
import type { Measurement } from './measurements'
import type { AthleteSettings } from './settings'

/** A local time, so the tests mean the same day in every time zone. */
const local = (year: number, month: number, day: number, hour = 12, minute = 0) =>
  new Date(year, month - 1, day, hour, minute).getTime()

const mass = (value: number, from: string): Measurement => ({ kind: 'massKg', value, from })

function settingsWith(...measurements: Measurement[]): AthleteSettings {
  return { massKg: 72, bikeMassKg: 9, measurements }
}

describe('massAtFor', () => {
  it('gives every activity the profile mass when none is dated', () => {
    expect(massAtFor({ massKg: 72, bikeMassKg: 9 })(local(2020, 1, 1))).toBe(72)
    expect(massAtFor(settingsWith())(local(2020, 1, 1))).toBe(72)
  })

  it('gives each activity the mass in effect on its local date', () => {
    const at = massAtFor(settingsWith(mass(90, '2023-01-01'), mass(80, '2024-06-01')))
    expect(at(local(2023, 3, 1))).toBe(90)
    expect(at(local(2024, 5, 31, 23, 59))).toBe(90)
    expect(at(local(2024, 6, 1, 0, 0))).toBe(80)
    expect(at(local(2026, 1, 1))).toBe(80)
  })

  it('applies the earliest mass before the first entry', () => {
    const at = massAtFor(settingsWith(mass(90, '2023-01-01'), mass(80, '2024-06-01')))
    expect(at(local(2019, 7, 4))).toBe(90)
  })

  it('does not depend on the order the entries were added in', () => {
    const at = massAtFor(settingsWith(mass(80, '2024-06-01'), mass(90, '2023-01-01')))
    expect(at(local(2023, 12, 31))).toBe(90)
    expect(at(local(2024, 6, 2))).toBe(80)
  })

  it('ignores entries of other kinds', () => {
    const entries: Measurement[] = [
      { kind: 'maxHeartRate', sport: 'run', value: 190, from: '2020-01-01' },
    ]
    expect(massAtFor(settingsWith(...entries))(local(2021, 1, 1))).toBe(72)
    expect(hasDatedMass(settingsWith(...entries))).toBe(false)
    expect(hasDatedMass(settingsWith(mass(70, '2020-01-01')))).toBe(true)
  })
})

describe('sameMasses', () => {
  it('is equal for equal masses whatever the other settings', () => {
    const hr: Measurement = { kind: 'maxHeartRate', sport: 'ride', value: 180, from: '2025-01-01' }
    expect(
      sameMasses(settingsWith(mass(90, '2023-01-01')), settingsWith(mass(90, '2023-01-01'), hr)),
    ).toBe(true)
  })

  it('differs when a mass, a date, the profile mass or the bike changes', () => {
    const base = settingsWith(mass(90, '2023-01-01'))
    expect(sameMasses(base, settingsWith(mass(91, '2023-01-01')))).toBe(false)
    expect(sameMasses(base, settingsWith(mass(90, '2023-01-02')))).toBe(false)
    expect(sameMasses(base, settingsWith())).toBe(false)
    expect(sameMasses(base, { ...base, massKg: 73 })).toBe(false)
    expect(sameMasses(base, { ...base, bikeMassKg: 10 })).toBe(false)
  })

  it('differs when the rides kept despite implausible power differ, whatever their order', () => {
    const base = settingsWith()
    expect(sameMasses(base, { ...base, keepPower: ['a'] })).toBe(false)
    expect(sameMasses({ ...base, keepPower: ['a', 'b'] }, { ...base, keepPower: ['b', 'a'] })).toBe(
      true,
    )
    expect(sameMasses({ ...base, keepPower: ['a'] }, { ...base, keepPower: ['b'] })).toBe(false)
    expect(sameMasses(base, { ...base, keepPower: [] })).toBe(true)
  })
})

describe('bodyMassOn', () => {
  it('is the profile mass with no dated mass, and stays null when the profile has none', () => {
    expect(bodyMassOn(72, [], local(2024, 1, 1))).toBe(72)
    expect(bodyMassOn(null, [], local(2024, 1, 1))).toBeNull()
  })

  it('is the dated mass in effect, whatever the profile holds, and the same as the analysis prices an activity at', () => {
    const entries = [mass(90, '2023-01-01'), mass(80, '2024-06-01')]
    for (const date of [
      local(2022, 1, 1),
      local(2023, 5, 1),
      local(2024, 6, 1),
      local(2026, 1, 1),
    ]) {
      expect(bodyMassOn(72, entries, date)).toBe(massAtFor(settingsWith(...entries))(date))
    }
    // A later dated mass takes effect on its day with no edit to the profile.
    expect(bodyMassOn(72, entries, local(2024, 5, 31))).toBe(90)
    expect(bodyMassOn(72, entries, local(2024, 6, 1))).toBe(80)
  })
})
