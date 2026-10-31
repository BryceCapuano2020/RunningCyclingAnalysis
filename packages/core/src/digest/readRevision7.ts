import type { AthleteType, DigestTemperature, LocalDayShift } from '../types'
import {
  asBetween,
  asIntegerBetween,
  asObject,
  asOneOf,
  failRange,
  whenOutOfRange,
} from './parseValue'
import {
  MAX_DIGEST_TEMPERATURE_C,
  MIN_DIGEST_TEMPERATURE_C,
  MIN_TEMPERATURE_COVERAGE,
} from './readLimits'
import type { DigestRules } from './readRules'

/**
 * The fields revision 7 first writes, read here so a build can list and analyse a digest that has them
 * before it writes any. Each is optional and checked to its bounds. Under the rules of stored data a
 * value this build cannot place is the field being absent: it is the athlete's label or a reading, not
 * what names the activity, and an unknown class is another build's to say. A digest being created is
 * refused instead.
 */

const ATHLETE_TYPES: readonly AthleteType[] = ['walk', 'hike', 'ski', 'other']

/** The temperature summary: a median in degrees Celsius and the share of seconds behind it. */
export function readTemperature(
  value: unknown,
  path: string,
  rules: DigestRules,
): DigestTemperature | undefined {
  return whenOutOfRange<DigestTemperature | undefined>(rules.tolerant, undefined, () => {
    const o = asObject(value, path)
    return {
      c: asBetween(o.c, `${path}.c`, MIN_DIGEST_TEMPERATURE_C, MAX_DIGEST_TEMPERATURE_C),
      coverage: asBetween(o.coverage, `${path}.coverage`, MIN_TEMPERATURE_COVERAGE, 1),
    }
  })
}

/** The athlete's own label. A name outside the four classes is another build's, so a tolerant reader leaves it out. */
export function readAthleteType(
  value: unknown,
  path: string,
  rules: DigestRules,
): AthleteType | undefined {
  if (rules.tolerant && typeof value === 'string' && !ATHLETE_TYPES.some((t) => t === value)) {
    return undefined
  }
  return asOneOf(value, ATHLETE_TYPES, path)
}

/** The local date minus the UTC date: a whole number from -1 to 1. */
export function readLocalDayShift(
  value: unknown,
  path: string,
  rules: DigestRules,
): LocalDayShift | undefined {
  const shift = whenOutOfRange<number | undefined>(rules.tolerant, undefined, () =>
    asIntegerBetween(value, path, -1, 1),
  )
  if (shift === undefined) return undefined
  if (shift === -1 || shift === 0 || shift === 1) return shift
  return failRange(path, 'must be -1, 0 or 1')
}
