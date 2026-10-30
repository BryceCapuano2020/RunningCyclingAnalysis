import { HEADLINE_DURATION_S } from './constants'
import { sameMasses } from './athlete/mass'
import { changeEvidence } from './change/evidence'
import type { ChangeEvidence } from './change/types'
import { combine, sportCurves } from './digest/combine'
import type { CombineOptions } from './digest/combine'
import type { AnalysisResult } from './digest/combine'
import { rideGateKey } from './digest/estimatedRide'
import type { EstimatedRideGate } from './digest/estimatedRide'
import type { MaxHeartRates } from './effort'
import { lateEvidence } from './digest/lateEvidence'
import type { LateEvidenceBySport } from './digest/lateEvidenceTypes'
import { sameHeartRate } from './digest/sameHeartRate'
import type { SameHeartRateBySport } from './digest/sameHeartRateTypes'
import { fitnessTrend } from './digest/trend'
import type { TrendPoint } from './digest/trend'
import { EFFORT_LENGTHS_S, trendWindowDays } from './digest/trendPoints'
import type { EffortLengthS } from './digest/trendPoints'
import type {
  ActivityDigest,
  AthleteSettings,
  BikeModel,
  HrCalibration,
  SportCurves,
} from './types'

/*
 * The cache behind a session's periods: the analysis, trends and same-heart-rate points of each period, reused
 * while their inputs hold. Split from period.ts, which dates the periods.
 */

/** Whether two lists hold the same digest objects in the same order. */
export function sameDigests(a: ActivityDigest[], b: ActivityDigest[]): boolean {
  return a.length === b.length && a.every((digest, i) => digest === b[i])
}

/** The settings and digests that a cached result was computed from. */
interface Inputs {
  selected: ActivityDigest[]
  settings: AthleteSettings
}

function sameInputs(
  cached: Inputs,
  selected: ActivityDigest[],
  settings: AthleteSettings,
): boolean {
  return sameMasses(cached.settings, settings) && sameDigests(cached.selected, selected)
}

/** The ids of a set among these digests, sorted and joined: what in a library's set-aside can move their analysis. */
function setAsideAmong(digests: ActivityDigest[], setAside: readonly string[]): string {
  const named = new Set(setAside)
  return digests
    .filter((digest) => named.has(digest.id))
    .map((digest) => digest.id)
    .sort()
    .join(',')
}

/** A calibration as a key: equal calibrations are the same key; none, and the period's own, are each their own. */
function calibrationKey(calibration: HrCalibration | null | undefined): string {
  if (calibration === undefined) return 'own'
  return calibration === null ? 'none' : `${calibration.kappa}|${calibration.lnKappaSe}`
}

/** How many analyses are kept: the few periods the control offers, so that switching between them is free. */
const ANALYSES_KEPT = 4

/**
 * The analysis, the trend and the previous period's curves, reused between calls while their inputs
 * are the same. All are priced with the bike model of the selected period, which depends only on the
 * selected digests and the masses, so those are the whole key. The heart-rate model behind the
 * running equivalents also depends only on the selected digests and the masses, so it needs no key of
 * its own; whether the equivalents are wanted does, and it is in the key.
 */
export class PeriodCache {
  private trendEntries = new Map<
    EffortLengthS,
    Inputs & {
      rangeDays: number | null
      startMs: number | null
      equivalence: boolean
      calibration: string
      gate: string
      points: TrendPoint[]
    }
  >()
  private changeEntry:
    (Inputs & { previous: ActivityDigest[]; gate: string; evidence: ChangeEvidence }) | null = null
  private previousEntry:
    | (Inputs & { previous: ActivityDigest[]; gate: string; hardness: string; curves: SportCurves })
    | null = null
  // Output at the same heart rate reads no mass, so its key is the digests, the period's start and the set-aside.
  // Newest use first, a few kept like the analyses, so going back to a period already shown is free.
  private sameEntries: {
    selected: ActivityDigest[]
    library: ActivityDigest[]
    fromMs: number | null
    setAside: string
    result: SameHeartRateBySport
  }[] = []
  // Late-effort evidence reads no mass either: its key is the digests and the set-aside, newest use first.
  private lateEntries: {
    selected: ActivityDigest[]
    setAside: string
    result: LateEvidenceBySport
  }[] = []
  // Newest use first. A digest that is added, replaced or removed is a different object, so the
  // analysis of a changed library has a different key and is never found for the old one.
  private analysisEntries: (Inputs & {
    setAside: string
    calibration: string
    references: string
    gate: string
    analysis: AnalysisResult
  })[] = []

  /**
   * The analysis of the selected digests, reused while they, both masses and the heart rates set aside among
   * them are the same. The last few are kept, so going back to a period already shown costs nothing.
   *
   * `setAside` is the library's judgement (`judgeHeartRate`), which the analysis takes as it is rather
   * than judging the period alone. Only the ids in this period's digests can change its analysis, so those
   * are the key: an activity added outside the period does not redo it. The library's `calibration` and
   * `references` (its reference heart rates) are part of the key too, since they set the equivalents and the
   * effort checks, and are read by every period alike. So is the library's `rideGate`, which decides which
   * rides without a power meter count.
   */
  analysis(
    selected: ActivityDigest[],
    settings: AthleteSettings,
    setAside: readonly string[],
    calibration?: HrCalibration | null,
    references?: CombineOptions['references'],
    rideGate?: EstimatedRideGate | null,
  ): AnalysisResult {
    const key = setAsideAmong(selected, setAside)
    const calibrationId = calibrationKey(calibration)
    const referencesId = JSON.stringify(references ?? null)
    const gateId = rideGateKey(rideGate)
    const hit = this.analysisEntries.findIndex(
      (entry) =>
        entry.setAside === key &&
        entry.calibration === calibrationId &&
        entry.references === referencesId &&
        entry.gate === gateId &&
        sameInputs(entry, selected, settings),
    )
    if (hit >= 0) {
      const [entry] = this.analysisEntries.splice(hit, 1)
      this.analysisEntries.unshift(entry!)
      return entry!.analysis
    }
    const analysis = combine(selected, settings, {
      heartRateSetAside: new Set(setAside),
      calibration,
      references,
      rideGate,
    })
    this.analysisEntries.unshift({
      selected,
      settings,
      setAside: key,
      calibration: calibrationId,
      references: referencesId,
      gate: gateId,
      analysis,
    })
    this.analysisEntries.length = Math.min(this.analysisEntries.length, ANALYSES_KEPT)
    return analysis
  }

  /**
   * Releases the analyses that select a digest the library no longer holds. A removed or replaced
   * digest is never in a new selection, so such an analysis can no longer be found and only holds a
   * slot and memory. Analyses of digests still held are kept.
   */
  releaseAbsent(library: readonly ActivityDigest[]): void {
    const held = new Set(library)
    this.analysisEntries = this.analysisEntries.filter((entry) =>
      entry.selected.every((digest) => held.has(digest)),
    )
    // The library holds the selection, so one test covers both.
    this.sameEntries = this.sameEntries.filter((entry) =>
      entry.library.every((digest) => held.has(digest)),
    )
  }

  /**
   * The weekly trend of each effort length over the selected period, reused while its inputs are the
   * same. The headline trend also carries each week's running equivalent, with the heart-rate model
   * of the selected analysis, when hr is given.
   */
  trends(
    selected: ActivityDigest[],
    settings: AthleteSettings,
    rangeDays: number | null,
    startMs: number | null,
    bikeModel: BikeModel | undefined,
    hr: HrCalibration | null | undefined,
    rideGate?: EstimatedRideGate | null,
  ): Record<EffortLengthS, TrendPoint[]> {
    return Object.fromEntries(
      EFFORT_LENGTHS_S.map((durationS) => [
        durationS,
        this.trend(selected, settings, rangeDays, startMs, bikeModel, durationS, hr, rideGate),
      ]),
    ) as Record<EffortLengthS, TrendPoint[]>
  }

  /** The weekly trend of one effort length: a third of the period in each window, within the period. */
  private trend(
    selected: ActivityDigest[],
    settings: AthleteSettings,
    rangeDays: number | null,
    startMs: number | null,
    bikeModel: BikeModel | undefined,
    durationS: EffortLengthS,
    hr: HrCalibration | null | undefined,
    rideGate: EstimatedRideGate | null | undefined,
  ): TrendPoint[] {
    const equivalence = hr !== undefined && durationS === HEADLINE_DURATION_S
    const cached = this.trendEntries.get(durationS)
    if (
      cached &&
      cached.rangeDays === rangeDays &&
      cached.startMs === startMs &&
      cached.equivalence === equivalence &&
      cached.calibration === calibrationKey(hr) &&
      cached.gate === rideGateKey(rideGate) &&
      sameInputs(cached, selected, settings)
    ) {
      return cached.points
    }
    const points = fitnessTrend(selected, settings, {
      durationS,
      windowDays: trendWindowDays(rangeDays),
      fromMs: startMs ?? undefined,
      bikeModel,
      rideGate,
      equivalence: equivalence && hr !== undefined ? { hr } : undefined,
    })
    this.trendEntries.set(durationS, {
      selected,
      settings,
      rangeDays,
      startMs,
      equivalence,
      calibration: calibrationKey(hr),
      gate: rideGateKey(rideGate),
      points,
    })
    return points
  }

  /**
   * Each sport's output at the same heart rate over the selected period, reused while the digests, the
   * library (which sets the reference heart rate), the period's start and the activities set aside are the same. Masses do not enter, so a change of
   * weight does not redo it.
   */
  sameHeartRate(
    selected: ActivityDigest[],
    library: ActivityDigest[],
    fromMs: number | null,
    setAside: readonly string[],
  ): SameHeartRateBySport {
    const key = setAside.join(',')
    const hit = this.sameEntries.findIndex(
      (entry) =>
        entry.fromMs === fromMs &&
        entry.setAside === key &&
        sameDigests(entry.selected, selected) &&
        sameDigests(entry.library, library),
    )
    if (hit >= 0) {
      const [entry] = this.sameEntries.splice(hit, 1)
      this.sameEntries.unshift(entry!)
      return entry!.result
    }
    const result = sameHeartRate(selected, new Set(setAside), {
      fromMs: fromMs ?? undefined,
      library,
    })
    this.sameEntries.unshift({ selected, library, fromMs, setAside: key, result })
    this.sameEntries.length = Math.min(this.sameEntries.length, ANALYSES_KEPT)
    return result
  }

  /** Each sport's late-effort evidence over the selected period, reused while the digests and the set-aside are the same. */
  late(selected: ActivityDigest[], setAside: readonly string[]): LateEvidenceBySport {
    const key = setAside.join(',')
    const hit = this.lateEntries.findIndex(
      (entry) => entry.setAside === key && sameDigests(entry.selected, selected),
    )
    if (hit >= 0) {
      const [entry] = this.lateEntries.splice(hit, 1)
      this.lateEntries.unshift(entry!)
      return entry!.result
    }
    const result = lateEvidence(selected, new Set(setAside))
    this.lateEntries.unshift({ selected, setAside: key, result })
    this.lateEntries.length = Math.min(this.lateEntries.length, ANALYSES_KEPT)
    return result
  }

  /** The curves of the period before, priced with the selected period's bike model. */
  previousCurves(
    selected: ActivityDigest[],
    previous: ActivityDigest[],
    settings: AthleteSettings,
    bikeModel: BikeModel,
    rideGate?: EstimatedRideGate | null,
    judged?: { referenceHr: MaxHeartRates; setAside: readonly string[] },
  ): SportCurves {
    const cached = this.previousEntry
    const gate = rideGateKey(rideGate)
    // The effort check reads the library's reference heart rates and the set-aside among the previous period's digests.
    const hardness =
      judged === undefined
        ? 'none'
        : `${judged.referenceHr.run}|${judged.referenceHr.ride}|${setAsideAmong(previous, judged.setAside)}`
    if (
      cached !== null &&
      cached.gate === gate &&
      cached.hardness === hardness &&
      sameInputs(cached, selected, settings) &&
      sameDigests(cached.previous, previous)
    ) {
      return cached.curves
    }
    const curves = sportCurves(
      previous,
      settings,
      bikeModel,
      rideGate,
      judged === undefined
        ? undefined
        : { reference: judged.referenceHr, setAside: new Set(judged.setAside) },
    )
    this.previousEntry = { selected, settings, previous, gate, hardness, curves }
    return curves
  }

  /**
   * Whether the selected period's bests differ from the previous period's by more than chance. Priced with the
   * selected period's bike model, so its key is the same as the previous curves': the two period lists, the masses
   * and the library's ride gate. Going back to a period just shown costs nothing.
   */
  change(
    selected: ActivityDigest[],
    previous: ActivityDigest[],
    settings: AthleteSettings,
    bikeModel: BikeModel,
    rideGate?: EstimatedRideGate | null,
  ): ChangeEvidence {
    const cached = this.changeEntry
    const gate = rideGateKey(rideGate)
    if (
      cached !== null &&
      cached.gate === gate &&
      sameInputs(cached, selected, settings) &&
      sameDigests(cached.previous, previous)
    ) {
      return cached.evidence
    }
    const evidence = changeEvidence(selected, previous, settings, bikeModel, rideGate)
    this.changeEntry = { selected, settings, previous, gate, evidence }
    return evidence
  }
}
