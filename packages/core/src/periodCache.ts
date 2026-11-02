import { sameAnalysisSettings } from './athlete/references'
import { sameDigests } from './sameDigests'
import { TrendMemo } from './trendMemo'
import { calendarWatch } from './calendar'
import { changeEvidence } from './change/evidence'
import type { ChangeEvidence } from './change/types'
import { EVERY_EFFORT_KEYED } from './digest/readingRule'
import type { KeyedReadingRule } from './digest/readingRule'
import { combine, sportCurves } from './digest/combine'
import type { CombineOptions } from './digest/combine'
import type { AnalysisResult } from './digest/combine'
import { rideGateKey } from './digest/estimatedRide'
import type { JudgedWork } from './digest/judgedWork'
import type { EstimatedRideGate } from './digest/estimatedRide'
import type { EffortReference } from './effort'
import type { LateReference } from './digest/lateEvidence'
import type { LateEvidenceBySport } from './digest/lateEvidenceTypes'
import type { SameHeartRateBySport } from './digest/sameHeartRateTypes'
import { EvidenceMemo } from './evidenceMemo'
import type { TrendPoint } from './digest/trend'
import type { DotsWithheld, EffortLengthS } from './digest/trendPoints'
import type {
  ActivityDigest,
  AthleteSettings,
  BikeModel,
  HrCalibration,
  Sport,
  SportCurves,
} from './types'

/* The cache behind a session's periods: each period's analysis, trends and same-heart-rate points, reused while their inputs hold. */

export { sameDigests }

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
  return sameAnalysisSettings(cached.settings, settings) && sameDigests(cached.selected, selected)
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
  private moved = { trend: calendarWatch() }
  private evidence = new EvidenceMemo()
  private trendMemo = new TrendMemo()
  // Newest use first, a few kept like the analyses, so going back to a period already shown is free.
  private changeEntries: (Inputs & {
    previous: ActivityDigest[]
    gate: string
    reading: string
    evidence: ChangeEvidence
  })[] = []
  private previousEntry:
    | (Inputs & { previous: ActivityDigest[]; gate: string; hardness: string; curves: SportCurves })
    | null = null
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
    judged?: JudgedWork,
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
      judged,
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
    this.evidence.releaseAbsent(held)
    // The previous period's curves and the change test hold both periods' digests.
    const heldBoth = (entry: { selected: ActivityDigest[]; previous: ActivityDigest[] }) =>
      entry.selected.every((digest) => held.has(digest)) &&
      entry.previous.every((digest) => held.has(digest))
    if (this.previousEntry !== null && !heldBoth(this.previousEntry)) this.previousEntry = null
    this.changeEntries = this.changeEntries.filter(heldBoth)
  }

  /**
   * The weekly trend of each effort length over the selected period, reused while its inputs are the same, and which lengths
   * the dots' rule left too few dots to draw (see `TrendMemo.withheld`).
   */
  trends(
    selected: ActivityDigest[],
    settings: AthleteSettings,
    rangeDays: number | null,
    startMs: number | null,
    bikeModel: BikeModel | undefined,
    rideGate?: EstimatedRideGate | null,
    rule?: KeyedReadingRule,
  ): Record<EffortLengthS, TrendPoint[]> {
    if (this.moved.trend()) this.trendMemo.clear()
    return this.trendMemo.trends(
      { selected, settings, rangeDays, startMs, bikeModel },
      { rideGate, rule },
    )
  }

  /** The lengths the rule left without dots that the period has without it: asked after `trends`, with the same inputs. */
  dotsWithheld(
    selected: ActivityDigest[],
    settings: AthleteSettings,
    rangeDays: number | null,
    startMs: number | null,
    bikeModel: BikeModel | undefined,
    shown: Readonly<Record<EffortLengthS, readonly TrendPoint[]>>,
    rideGate?: EstimatedRideGate | null,
    rule?: KeyedReadingRule,
  ): DotsWithheld {
    return this.trendMemo.withheld(
      { selected, settings, rangeDays, startMs, bikeModel },
      { rideGate, rule },
      shown,
    )
  }

  /** Output at the same heart rate over the selected period; see `EvidenceMemo`. */
  sameHeartRate(
    selected: ActivityDigest[],
    library: ActivityDigest[],
    fromMs: number | null,
    setAside: readonly string[],
    referenceHr: Readonly<Record<Sport, number | null>>,
  ): SameHeartRateBySport {
    return this.evidence.sameHeartRate(selected, library, fromMs, setAside, referenceHr)
  }

  /** Late-effort evidence over the selected period, pooled with the library where the period holds too little; see `EvidenceMemo`. */
  late(
    selected: ActivityDigest[],
    library: ActivityDigest[],
    setAside: readonly string[],
    judged?: LateReference,
  ): LateEvidenceBySport {
    return this.evidence.late(selected, library, setAside, judged)
  }

  /** The curves of the period before, priced with the selected period's bike model. */
  previousCurves(
    selected: ActivityDigest[],
    previous: ActivityDigest[],
    settings: AthleteSettings,
    bikeModel: BikeModel,
    rideGate?: EstimatedRideGate | null,
    judged?: { effortReference: EffortReference; setAside: readonly string[] },
  ): SportCurves {
    const cached = this.previousEntry
    const gate = rideGateKey(rideGate)
    // The effort check reads the library's reference heart rates and the set-aside among the previous period's digests.
    const hardness =
      judged === undefined
        ? 'none'
        : `${JSON.stringify(judged.effortReference)}|${setAsideAmong(previous, judged.setAside)}`
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
        : { effort: judged.effortReference, setAside: new Set(judged.setAside) },
    )
    this.previousEntry = { selected, settings, previous, gate, hardness, curves }
    return curves
  }

  /**
   * Whether the selected period's bests differ from the previous period's by more than chance. Priced with the
   * selected period's bike model, so its key is the same as the previous curves': the two period lists, the masses
   * and the library's ride gate; and the reading rule the readings are taken through (`reading`, with the key that
   * says what it was made from), so a change of the effort gate's references or set-aside list re-reads. The last few are kept, so going back to a
   * period just shown costs nothing.
   */
  change(
    selected: ActivityDigest[],
    previous: ActivityDigest[],
    settings: AthleteSettings,
    bikeModel: BikeModel,
    rideGate?: EstimatedRideGate | null,
    reading: KeyedReadingRule = EVERY_EFFORT_KEYED,
  ): ChangeEvidence {
    const gate = rideGateKey(rideGate)
    const hit = this.changeEntries.findIndex(
      (entry) =>
        entry.gate === gate &&
        entry.reading === reading.key &&
        sameInputs(entry, selected, settings) &&
        sameDigests(entry.previous, previous),
    )
    if (hit >= 0) {
      const [entry] = this.changeEntries.splice(hit, 1)
      this.changeEntries.unshift(entry!)
      return entry!.evidence
    }
    const evidence = changeEvidence(selected, previous, settings, bikeModel, rideGate, reading.rule)
    this.changeEntries.unshift({
      selected,
      settings,
      previous,
      gate,
      reading: reading.key,
      evidence,
    })
    this.changeEntries.length = Math.min(this.changeEntries.length, ANALYSES_KEPT)
    return evidence
  }
}
