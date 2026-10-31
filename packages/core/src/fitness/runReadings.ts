import { isAnalysed } from '../digest/analysed'
import { median } from '../findings/stats'
import { revisionStatus } from '../digest/revisions'
import type { ActivityDigest, DigestSplit, LocalDayShift } from '../types'
import type { KmReading } from './fit'
import { FITNESS } from './params'

const U = FITNESS.unit

/**
 * What a run offers the fitness unit, worked out once for each digest and independent of the library
 * (the reference heart rate and the fit come later). `steadyPace` is the run-level test; `loose` are the
 * kilometres that pass the steady-pace unit's tests, `strict` those that also pass the strict unit's,
 * both before the heart-rate band.
 */
export interface RunReadings {
  id: string
  startMs: number
  steadyPace: boolean
  /** The day's warmth as the file's sensor read it (revision 7), when it had a usable reading. */
  c?: number
  localDayShift: LocalDayShift | undefined
  loose: KmReading[]
  strict: KmReading[]
}

const cache = new WeakMap<ActivityDigest, RunReadings | null>()

const isWhole = (s: DigestSplit | undefined): s is DigestSplit =>
  s !== undefined && s.distanceM >= U.minKmDistanceM && s.seconds !== null

/** The median change of pace between kilometres 2 and 10 (in log), from at least three changes; whole kilometres only. */
function steadyPace(km: readonly DigestSplit[]): boolean {
  const changes: number[] = []
  for (let i = 2; i <= U.lastKm && i < km.length; i++) {
    const s = km[i]
    const p = km[i - 1]
    if (isWhole(s) && isWhole(p)) changes.push(Math.abs(Math.log(s.seconds! / p.seconds!)))
  }
  return changes.length >= U.paceSteps && median(changes) <= U.maxPaceChange
}

function kilometres(km: readonly DigestSplit[]): Pick<RunReadings, 'loose' | 'strict'> {
  const loose: KmReading[] = []
  const strict: KmReading[] = []
  for (let i = U.firstKm; i <= U.lastKm && i < km.length; i++) {
    const s = km[i]!
    const p = km[i - 1]!
    if (!isWhole(s) || s.avgHeartRate === null || s.gradeAdjustedSeconds === null) continue
    if (p.seconds === null || p.avgHeartRate === null) continue
    const seconds = s.seconds!
    const climb = s.elevationGainM ?? Number.POSITIVE_INFINITY
    const gap = Math.abs(s.gradeAdjustedSeconds - seconds) / seconds
    if (climb > U.maxClimbM || gap > U.maxCredit) continue
    const credit = Math.log(seconds / s.gradeAdjustedSeconds)
    const reading = { hr: s.avgHeartRate, lnClock: Math.log(1000 / seconds), credit }
    loose.push(reading)
    const steady =
      Math.abs(p.avgHeartRate - s.avgHeartRate) <= U.strict.steadyBpm &&
      Math.abs(Math.log(p.seconds / seconds)) <= U.strict.steadyPace
    const flat = climb <= U.strict.maxClimbM && gap <= U.strict.maxCredit
    if (steady && flat) strict.push(reading)
  }
  return { loose, strict }
}

/**
 * The readings of a run digest, or null when it is not a candidate: not this sport, indoors, at walking
 * pace, without heart rate or kilometre splits, or flagged for a heart-rate spike, cadence lock or dropout. Whether its
 * heart rate is set aside is the caller's, since that is the library's judgement.
 */
export function runReadings(
  digest: ActivityDigest,
  sport: ActivityDigest['sport'],
): RunReadings | null {
  if (digest.sport !== sport) return null
  if (cache.has(digest)) return cache.get(digest)!
  const km = digest.splits?.km
  const eligible =
    km !== undefined &&
    digest.hasHeartRate &&
    !digest.indoor &&
    isAnalysed(digest) &&
    !digest.flagCounts['hr-spike'] &&
    !digest.flagCounts['hr-cadence-lock'] &&
    !digest.flagCounts['hr-dropout']
  const readings: RunReadings | null = eligible
    ? {
        id: digest.id,
        startMs: digest.startMs,
        steadyPace: steadyPace(km),
        ...(digest.temperature === undefined || revisionStatus(digest.modelRevision) !== 'current'
          ? {}
          : { c: digest.temperature.c }),
        localDayShift: digest.localDayShift,
        ...kilometres(km),
      }
    : null
  cache.set(digest, readings)
  return readings
}
