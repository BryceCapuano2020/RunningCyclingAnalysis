import type { ActivityDigest, PowerSource, Sport } from './types'
import { DIGEST_VERSION } from './constants'
import { asDistributions, asDrift, asDurability } from './serializeEvidence'
import {
  asBetween,
  asBoolean,
  asInteger,
  asIntegerBetween,
  asNumberOrNaNBetween,
  asObject,
  asOneOf,
  asString,
  fail,
  failRange,
  whenOutOfRange,
} from './parseValue'
import {
  nanIn,
  nullIn,
  readCalibration,
  readClimbSections,
  readCurve,
  readFlagCounts,
  readFlags,
  readHrBlocks,
} from './readParts'
import { coveredBests, readDistanceBests, readSplits } from './readLists'
import {
  EARLIEST_ACTIVITY_START_MS,
  LATEST_ACTIVITY_START_MS,
  MAX_ACTIVITY_CLIMB_M,
  MAX_ACTIVITY_DISTANCE_M,
  MAX_ACTIVITY_S,
  MAX_DIGEST_HEART_RATE,
  MAX_DIGEST_OUTPUT,
  MAX_DIGEST_REVISION,
} from './readLimits'
import { RULES_OF_VIEW } from './readRules'
import type { DigestRules, DigestView } from './readRules'

const SPORTS: readonly Sport[] = ['run', 'ride']
const POWER_SOURCES: readonly PowerSource[] = ['measured', 'virtual', 'none']

/** Whether a sport's digests can be at walking pace: a ride is not judged against one. */
const HAS_WALKING_PACE: Record<Sport, boolean> = { run: true, ride: false }
/** Whether a sport's digests keep the best time over each record distance. */
const HAS_DISTANCE_BESTS: Record<Sport, boolean> = { run: true, ride: false }

/** Stands for a field a digest does not have: the key is left out, not set to undefined. */
const ABSENT = Symbol('absent')
type Absent = typeof ABSENT

/**
 * Every key of an ActivityDigest, with its optional keys required and allowed to be absent. The
 * reader builds this object, so a key added to ActivityDigest is a compile error here until the
 * reader says what to do with it. A new optional field cannot be left out of the reader unnoticed.
 *
 * The check covers the top level only. A key added to a nested type (a split, a curve point, a flag)
 * is not a compile error here: a reader that builds that part by listing its keys leaves it out
 * without a word. `packages/contract/src/digestFields.test.ts` is the guard for those, and only for
 * the nested keys its maximal digest sets.
 */
type DigestSlots = { [K in keyof ActivityDigest]-?: ActivityDigest[K] | Absent }

function present(slots: DigestSlots): ActivityDigest {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(slots)) {
    if (value !== ABSENT) out[key] = value
  }
  // Every key is a key of ActivityDigest and every value is the type of its key, from DigestSlots.
  return out as unknown as ActivityDigest
}

/** A field present only on some digests: read when the digest has it. */
function optional<T>(value: unknown, read: (value: unknown) => T | Absent): T | Absent {
  return value === undefined ? ABSENT : read(value)
}

/**
 * A mark whose only value is true: absent when the digest does not carry it. Anything else is refused,
 * except by a tolerant reader, which reads it as absent: the mark is another build's to say.
 */
function onlyTrue(value: unknown, path: string, rules: DigestRules): true | Absent {
  if (value === undefined) return ABSENT
  if (value === true) return true
  if (rules.tolerant) return ABSENT
  return failRange(path, 'must be true when present')
}

/**
 * Reads a digest from a parsed value: the one reader every part of the app uses, under the rules of
 * a view (see DigestRules). Throws a DigestReadError naming the first field that is wrong. Fields it
 * does not know are left out of what it returns.
 */
export function readDigest(value: unknown, view: DigestView): ActivityDigest {
  const rules = RULES_OF_VIEW[view]
  const o = asObject(value, 'digest')
  if (o.version !== DIGEST_VERSION) {
    fail('version', `must be ${DIGEST_VERSION}, got ${JSON.stringify(o.version)}`)
  }
  const sport = asOneOf(o.sport, SPORTS, 'sport')
  const powerSource = asOneOf(o.powerSource, POWER_SOURCES, 'powerSource')
  const hasHeartRate = asBoolean(o.hasHeartRate, 'hasHeartRate')
  const durationS = readDuration(o.durationS, rules)
  const distanceM = nanIn(rules, o.distanceM, 'distanceM', 0, MAX_ACTIVITY_DISTANCE_M)
  const distanceBests = optional(o.distanceBests, (v) => {
    if (!HAS_DISTANCE_BESTS[sport]) {
      if (rules.tolerant) return ABSENT
      failRange('distanceBests', 'is only kept for runs')
    }
    return coveredBests(readDistanceBests(v, durationS, rules), distanceM, rules)
  })
  const movingS = optional(o.movingS, (v) => {
    const moving = whenOutOfRange<number | Absent>(rules.tolerant, ABSENT, () =>
      asIntegerBetween(v, 'movingS', 0, MAX_ACTIVITY_S),
    )
    if (moving === ABSENT || !(moving > durationS)) return moving
    if (rules.tolerant) return durationS
    return failRange('movingS', 'must not exceed durationS')
  })
  let walkingPace = onlyTrue(o.walkingPace, 'walkingPace', rules)
  if (walkingPace === true && !HAS_WALKING_PACE[sport]) {
    if (!rules.tolerant) failRange('walkingPace', 'is only kept for runs')
    walkingPace = ABSENT
  }
  const evidence = {
    sport,
    durationS,
    hasHeartRate,
    measuredPower: powerSource === 'measured',
    tolerant: rules.tolerant,
  }
  return present({
    version: DIGEST_VERSION,
    modelRevision: readRevision(o.modelRevision),
    id: asString(o.id, 'id'),
    name: asString(o.name, 'name'),
    sport,
    startMs: asBetween(o.startMs, 'startMs', EARLIEST_ACTIVITY_START_MS, LATEST_ACTIVITY_START_MS),
    durationS,
    distanceM,
    elevationGainM: nanIn(rules, o.elevationGainM, 'elevationGainM', 0, MAX_ACTIVITY_CLIMB_M),
    hasHeartRate,
    indoor: asBoolean(o.indoor, 'indoor'),
    powerSource,
    flags: readFlags(o.flags, durationS, rules),
    flagCounts: readFlagCounts(o.flagCounts, rules),
    maxHeartRate: nullIn(rules, o.maxHeartRate, 'maxHeartRate', 0, MAX_DIGEST_HEART_RATE),
    curve: readCurve(o.curve, rules),
    hrBlocks: readHrBlocks(o.hrBlocks, durationS, rules),
    calibration: readCalibration(o.calibration, 'calibration', rules),
    climbSections: readClimbSections(o.climbSections, durationS, rules),
    distanceBests,
    splits: optional(o.splits, (v) => readSplits(v, rules)),
    movingS,
    avgHeartRate: optional(o.avgHeartRate, (v) =>
      nullIn(rules, v, 'avgHeartRate', 0, MAX_DIGEST_HEART_RATE),
    ),
    avgPowerW: optional(o.avgPowerW, (v) => nullIn(rules, v, 'avgPowerW', 0, MAX_DIGEST_OUTPUT)),
    sessionKey: optional(o.sessionKey, (v) =>
      whenOutOfRange<string | Absent>(rules.tolerant, ABSENT, () => asString(v, 'sessionKey')),
    ),
    race: onlyTrue(o.race, 'race', rules),
    walkingPace,
    distributions: optional(o.distributions, (v) => asDistributions(v, evidence)),
    durability: optional(o.durability, (v) => asDurability(v, evidence)),
    drift: optional(o.drift, (v) => asDrift(v, evidence)),
  })
}

/** Missing on the oldest rows, which means the first revision. */
function readRevision(value: unknown): number {
  if (value === undefined) return 1
  const revision = asInteger(value, 'modelRevision')
  if (revision < 1 || revision > MAX_DIGEST_REVISION) {
    fail('modelRevision', `must be a positive safe integer, got ${revision}`)
  }
  return revision
}

/** A new digest's duration is whole seconds; a stored row's may be missing (null, which reads as NaN). */
function readDuration(value: unknown, rules: DigestRules): number {
  return rules.lenient
    ? asNumberOrNaNBetween(value, 'durationS', 0, MAX_ACTIVITY_S)
    : asIntegerBetween(value, 'durationS', 0, MAX_ACTIVITY_S)
}

export type { DigestView } from './readRules'
