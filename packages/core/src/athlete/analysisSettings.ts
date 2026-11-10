import type { Sex } from '../grade/ageGrade'
import type { Measurement } from './measurements'
import type { AthleteSettings } from './settings'

/**
 * The body mass the analysis runs on while none is entered. The analysis needs a number, and this is
 * the 75 kg the app used before weights were optional, so ride results keep today's numbers. It is a
 * placeholder, not the athlete's weight: anything built on it must be held while the weight is unknown.
 */
export const PLACEHOLDER_BODY_KG = 75

/** The two weights the app keeps; the body weight is null until the athlete enters it. */
export interface WeightSettings {
  massKg: number | null
  bikeMassKg: number
}

/**
 * The settings the analysis runs on, in the browser and on the server alike (one function, so the two build the same
 * object from the same choices). See PLACEHOLDER_BODY_KG. Dated settings and the rides whose power the athlete kept are
 * carried only when there are some, so an athlete with none has exactly the two masses.
 */
export function analysisSettings(
  settings: WeightSettings,
  measurements: readonly Measurement[] = [],
  birthYear: number | null = null,
  countedRuns: readonly string[] = [],
  keepPower: readonly string[] = [],
  sex: Sex | null = null,
): AthleteSettings {
  return {
    massKg: settings.massKg ?? PLACEHOLDER_BODY_KG,
    bikeMassKg: settings.bikeMassKg,
    // The placeholder is not the athlete's weight: ride power is not judged against it.
    ...(settings.massKg === null ? { massAssumed: true as const } : {}),
    ...(measurements.length > 0 ? { measurements } : {}),
    ...(birthYear === null ? {} : { birthYear }),
    ...(sex === null ? {} : { sex }),
    ...(countedRuns.length > 0 ? { countedRuns } : {}),
    ...(keepPower.length > 0 ? { keepPower } : {}),
  }
}
