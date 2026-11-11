import { levelBands } from '../../grade/levelBands'
import type { LevelBand } from '../../grade/levelBands'
import type { AgeProfile } from '../../grade/effortGrade'
import { kgToLb, lbToKg } from '../../units'
import type { UnitSystem } from '../../units'
import { liftAgeOn, liftStandard } from './liftStandard'
import { LIFTS } from './standard'

/**
 * The big three total at each level, in kg, for the athlete's age on `date` (YYYY-MM-DD), sex and body mass: a level's floor share
 * of the three standards summed, which is the share `liftCornerGrade` grades (the sum of the e1RMs over the sum of the standards).
 * Totals are whole in the athlete's unit (a pound or a kilogram) and rounded up, so a total that earns a level grades at its floor
 * or better. Null when the age or mass is outside what the standard is fitted for, as the corner's grade is.
 */
export function liftLevelTotals(
  profile: AgeProfile,
  date: string,
  massKg: number,
  units: UnitSystem,
): LevelBand[] | null {
  const age = liftAgeOn(profile.birthYear, date)
  const standards = LIFTS.map((lift) => liftStandard(lift, profile.sex, age, massKg))
  if (!Number.isFinite(age) || standards.some((standard) => standard.outOfRange)) return null
  const standardKg = standards.reduce((sum, standard) => sum + standard.kg, 0)
  const toUnit = (kg: number) => (units === 'imperial' ? kgToLb(kg) : kg)
  const fromUnit = (value: number) => (units === 'imperial' ? lbToKg(value) : value)
  return levelBands(
    (floor) => {
      let whole = Math.ceil(toUnit(standardKg * floor))
      // A pound converted back can land a hair under the floor: one more is the entry.
      while (fromUnit(whole) / standardKg < floor) whole += 1
      return fromUnit(whole)
    },
    fromUnit(1),
    true,
  )
}
