import { BEST_WINDOW_MIN_MOVING_FRACTION, DEFAULT_BIKE_MODEL, PRIORS } from '../constants'
import type { Occupancy } from '../curves'
import type { HeartRateSource } from '../effort'
import { maxHeartRate, windowHeartRate } from '../effort'
import { averageBlocks } from '../hr'
import { mean } from '../math'
import { runMetabolicPower, smoothGrade, travelledDistance } from '../metabolic'
import { runSplits } from '../splits/splits'
import { airDensityStream } from '../physics/air'
import { assessQuality, rememberTraceQuality } from '../quality'
import { agreedStreams, keepsOwnSpeed } from '../quality/agreement'
import type {
  Activity,
  ActivityDigest,
  DigestClimbSection,
  DigestCurvePoint,
  DigestDistanceBest,
  DigestHrBlock,
  QualityFlag,
  QualityKind,
  QualityReport,
} from '../types'
import { MODEL_REVISION } from './modelRevision'
import { climbMask, estimatePower, findSegments, splitSegment } from '../virtualPower'
import { calibrationSums } from './calibration'
import { valueBlocks, valueCurve, windowedEnvelope, withKnownGrade } from './curveParts'
import { distanceBests } from '../records/distanceBests'
import { elevationGain } from './elevationGain'
import { atWalkingPace } from './walkingPace'
import { hasRevision7, walkingPaceView, withCadenceLock } from './revision7Gate'
import { digestEvidence } from './evidence'
import { revision7Fields } from './revision7Fields'
import type { OutputStream } from './evidence'
import { and, countKept, meanWhere, movingMask, not, recordedSeconds } from './masks'
import type { SampleTerms } from './terms'
import { SELECTION_MASS_KG, sampleTerms, termsOver } from './terms'
import { DIGEST_VERSION } from './modelRevision'
import { MAX_DIGEST_FLAGS } from './readLimits'

export { DIGEST_VERSION }

/** Climbs whose measured mean power is below this are too easy to score meaningfully, W. */
const MIN_MEASURED_W = 50
/** Flags kept per activity are the first MAX_DIGEST_FLAGS. The true count of each kind is kept in flagCounts. */

/** The settings-independent parts of a digest, produced per sport and power source. */
interface Parts {
  powerSource: ActivityDigest['powerSource']
  curve: DigestCurvePoint[]
  hrBlocks: DigestHrBlock[]
  calibration: ActivityDigest['calibration']
  climbSections: DigestClimbSection[]
  /** Runs only. */
  distanceBests?: DigestDistanceBest[]
  /** The stream the curve is built from; null when it is an estimate (rides without a power meter). */
  output: OutputStream | null
}

/** How many flags of each kind an activity has: the true counts, not only the flags a digest keeps. */
export function countFlags(flags: QualityFlag[]): Partial<Record<QualityKind, number>> {
  const counts: Partial<Record<QualityKind, number>> = {}
  for (const flag of flags) counts[flag.kind] = (counts[flag.kind] ?? 0) + 1
  return counts
}

/**
 * `activity` carries the agreed streams; `recorded` is the file's own distance, which decides
 * which distances the run covers.
 */
function runParts(
  activity: Activity,
  recorded: Float64Array,
  quality: QualityReport,
  metabolic: Float64Array,
  source: HeartRateSource,
  occupancy: Occupancy,
): Parts {
  const valid = and(quality.validMotion, quality.validGrade)
  return {
    powerSource: 'none',
    curve: valueCurve(metabolic, valid, source, occupancy),
    hrBlocks: valueBlocks(metabolic, valid, source),
    calibration: null,
    climbSections: [],
    output: { values: metabolic, valid },
    // Only motion and recording decide a distance best: altitude affects grade, not distance or time.
    distanceBests: distanceBests(
      activity.distance,
      and(quality.validMotion, recordedSeconds(activity)),
      recorded,
    ),
  }
}

/**
 * Climb sections of a power-meter ride with measured power at least MIN_MEASURED_W, over the
 * seconds in `allowed` only.
 */
function climbSectionsOf(
  activity: Activity,
  quality: QualityReport,
  grade: Float64Array,
  terms: SampleTerms,
  allowed: Uint8Array,
): DigestClimbSection[] {
  const { power, speed } = activity
  const scorable = new Uint8Array(activity.n)
  for (let i = 0; i < activity.n; i++) {
    const usable =
      allowed[i] === 1 &&
      quality.validMotion[i] === 1 &&
      quality.validGrade[i] === 1 &&
      quality.validPower[i] === 1 &&
      Number.isFinite(power[i]!) &&
      Number.isFinite(terms.gravityAccel[i]!)
    scorable[i] = usable ? 1 : 0
  }
  const sections: DigestClimbSection[] = []
  for (const climb of findSegments(and(climbMask(grade, speed), scorable))) {
    for (const { start, end } of splitSegment(climb)) {
      const measuredW = mean(power.subarray(start, end))
      if (measuredW < MIN_MEASURED_W) continue
      sections.push({ start, end, measuredW, terms: termsOver(terms, start, end) })
    }
  }
  return sections
}

/**
 * `allowed` is 1 for the seconds that may calibrate or score a bike model. The speed here is the
 * file's own, paired with measured power, so a second where the file's speed and distance disagree
 * is left out rather than lowered: the lowering was tuned on runs, and the power does not follow it.
 */
function measuredParts(
  activity: Activity,
  quality: QualityReport,
  grade: Float64Array,
  source: HeartRateSource,
  allowed: Uint8Array,
  occupancy: Occupancy,
): Parts {
  const parts: Parts = {
    powerSource: 'measured',
    curve: valueCurve(activity.power, quality.validPower, source, occupancy),
    hrBlocks: valueBlocks(activity.power, quality.validPower, source),
    calibration: null,
    climbSections: [],
    output: { values: activity.power, valid: quality.validPower },
  }
  // Indoor power is not a gradient being ridden, so it cannot calibrate or score a bike model.
  if (activity.indoor) return parts
  // Air density depends on altitude alone, so it uses the altitude mask, not the grade mask.
  const density = airDensityStream(activity, quality.validAltitude)
  const terms = sampleTerms(activity.speed, grade, density)
  return {
    ...parts,
    calibration: calibrationSums(
      terms,
      activity.speed,
      activity.power,
      and(allowed, and(quality.validMotion, and(quality.validGrade, quality.validPower))),
    ),
    climbSections: climbSectionsOf(activity, quality, grade, terms, allowed),
  }
}

/**
 * Rides without a power meter. Only real outdoor climbs are trusted: wind and drafting dominate
 * elsewhere, and a trainer has no gradient at all. Each duration's best climb window is chosen
 * with the default bike model, and its power terms are kept so the bike model can be applied later.
 */
function virtualParts(
  activity: Activity,
  quality: QualityReport,
  grade: Float64Array,
  source: HeartRateSource,
  occupancy: Occupancy,
): Parts {
  const outdoorClimbs = activity.hasAltitude && !activity.indoor
  const valid = outdoorClimbs
    ? and(and(quality.validMotion, quality.validGrade), climbMask(grade, activity.speed))
    : new Uint8Array(activity.n)
  // Windows are picked with the default model at a fixed mass, so the digest is independent of the
  // athlete's settings. Combine then evaluates the stored terms at the real mass and fitted bike.
  const density = airDensityStream(activity, quality.validAltitude)
  const selection = windowedEnvelope(
    estimatePower(activity.speed, grade, SELECTION_MASS_KG, DEFAULT_BIKE_MODEL, density),
    valid,
    activity.id,
    occupancy,
  )
  const terms = sampleTerms(activity.speed, grade, density)
  // The stored terms are linear, so they omit the clamp at zero that estimatePower applies per
  // sample. See powerAt in terms.ts for the size of that bias.
  const curve: DigestCurvePoint[] = selection.map((w) => ({
    durationS: w.durationS,
    value: NaN,
    startIndex: w.startIndex,
    windowS: w.windowS,
    heartRate: windowHeartRate(source, w.startIndex, w.windowS),
    terms: w.startIndex < 0 ? null : termsOver(terms, w.startIndex, w.startIndex + w.windowS),
  }))
  const hrBlocks: DigestHrBlock[] = activity.hasHeartRate
    ? averageBlocks(
        [terms.gravityAccel, terms.rolling, terms.aero],
        activity.heartRate,
        valid,
        source.validHeartRate,
      ).map((b) => ({
        heartRate: b.heartRate,
        value: NaN,
        terms: { gravityAccel: b.means[0]!, rolling: b.means[1]!, aero: b.means[2]! },
      }))
    : []
  return {
    powerSource: 'virtual',
    curve,
    hrBlocks,
    calibration: null,
    climbSections: [],
    output: null,
  }
}

/**
 * Everything the cross-activity analysis needs from one activity. It depends only on the activity
 * itself, never on the athlete's settings, so it can be computed once at import and combined later.
 */
export function digestActivity(activity: Activity): ActivityDigest {
  return digestActivityAt(activity, MODEL_REVISION)
}

/**
 * The digest as revision `revision` makes it. Below 7 the revision-7 changes are off and the bytes are
 * those of `MODEL_REVISION` 6; tests pass 7 to cover the new behaviour (revision7Gate.ts).
 */
export function digestActivityAt(activity: Activity, revision: number): ActivityDigest {
  const moving = movingMask(activity)
  const seven = hasRevision7(revision)
  // Where the file's speed and distance disagree, efforts credit only what both support. The
  // summary and the splits keep the file's own distance. A power-meter ride keeps its own speed,
  // because its measured power does not follow the lowering: its calibration and climb sections
  // leave out the disagreeing seconds instead.
  const agreed = agreedStreams(activity)
  const measured = keepsOwnSpeed(activity)
  const streams: Activity = measured
    ? activity
    : { ...activity, speed: agreed.speed, distance: agreed.distance }
  // Indoor altitude is barometer drift or a simulated course, not a gradient being ridden. Outdoors
  // the grade is over the distance the speed stream implies, because every cost and power below is
  // grade times that speed: so they credit the climb the altitude records, and no more.
  const rawGrade = activity.indoor
    ? new Float64Array(activity.n)
    : smoothGrade(activity.altitude, travelledDistance(streams.speed, streams.distance))
  const assessed = withKnownGrade(
    assessQuality(activity, agreed.stretches),
    rawGrade,
    activity.paused,
    streams.speed,
  )
  const quality = seven ? withCadenceLock(activity, assessed, moving) : assessed
  rememberTraceQuality(activity, quality, streams.speed)
  // Unknown grade becomes zero here. Where it matters it is masked by validGrade; paused and
  // stationary samples have grade-independent resting cost.
  const grade = rawGrade.map((g) => (Number.isNaN(g) ? 0 : g))
  const source: HeartRateSource = { activity, validHeartRate: quality.validHeartRate }

  // The run's metabolic stream feeds its curve, its heart-rate blocks and its splits, so it is built once.
  const metabolic =
    activity.sport === 'run'
      ? runMetabolicPower(streams.speed, grade, PRIORS.runEconomyScale.mean, {
          steepDescent: seven,
        })
      : null
  const movingS = countKept(moving)
  const occupancy: Occupancy = { moving, minFraction: BEST_WINDOW_MIN_MOVING_FRACTION }
  let parts: Parts
  if (metabolic !== null) {
    parts = runParts(streams, activity.distance, quality, metabolic, source, occupancy)
  } else if (measured) {
    parts = measuredParts(streams, quality, grade, source, not(agreed.covered), occupancy)
  } else {
    parts = virtualParts(streams, quality, grade, source, occupancy)
  }

  return {
    version: DIGEST_VERSION,
    modelRevision: revision,
    id: activity.id,
    name: activity.name,
    sport: activity.sport,
    startMs: activity.startMs,
    durationS: activity.n,
    movingS,
    distanceM: activity.n > 0 ? activity.distance[activity.n - 1]! : 0,
    elevationGainM: elevationGain(activity.altitude, quality.validGrade),
    hasHeartRate: activity.hasHeartRate,
    avgHeartRate: activity.hasHeartRate
      ? meanWhere(activity.heartRate, and(quality.validHeartRate, moving))
      : null,
    indoor: activity.indoor,
    powerSource: parts.powerSource,
    avgPowerW:
      parts.powerSource === 'measured'
        ? meanWhere(activity.power, and(quality.validPower, moving))
        : null,
    flags: quality.flags.slice(0, MAX_DIGEST_FLAGS),
    flagCounts: countFlags(quality.flags),
    maxHeartRate: maxHeartRate([source]),
    curve: parts.curve,
    hrBlocks: parts.hrBlocks,
    calibration: parts.calibration,
    climbSections: parts.climbSections,
    ...(parts.distanceBests === undefined ? {} : { distanceBests: parts.distanceBests }),
    ...(metabolic === null
      ? {}
      : {
          splits: runSplits(
            activity,
            quality,
            metabolic,
            PRIORS.runEconomyScale.mean,
            agreed.covered,
            moving,
            seven ? streams.speed : undefined,
          ),
        }),
    ...(activity.sessionKey === undefined ? {} : { sessionKey: activity.sessionKey }),
    ...(activity.race === true ? { race: true as const } : {}),
    ...(atWalkingPace(seven ? walkingPaceView(activity, moving) : activity, moving, movingS)
      ? { walkingPace: true as const }
      : {}),
    ...digestEvidence(streams, quality, moving, parts.output, parts.powerSource),
    ...revision7Fields(activity, revision),
  }
}
