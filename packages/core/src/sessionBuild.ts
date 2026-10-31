import { DAY_MS, HEADLINE_DURATION_S } from './constants'
import { activitySummaries } from './digest'
import { hardEffortRule } from './digest/hardEffortRule'
import { NO_LATE_EVIDENCE } from './digest/lateEvidenceTypes'
import { NO_SAME_HEART_RATE } from './digest/sameHeartRateTypes'
import { NO_HEART_RATE_JUDGEMENT } from './digest/setAsideTypes'
import { NO_TRENDS } from './digest/trendPoints'
import { powerSetAsideIds } from './digest/powerCheck'
import { rideReferenceOf } from './digest/powerEvidence'
import { judgedWorkOf } from './digest/judgedWork'
import { hiddenDigests } from './duplicates'
import { fitnessStatuses } from './fitness/compute'
import { splitPeriods } from './period'
import type { PeriodCache, PeriodChoice } from './period'
import type { EarnedRecord } from './records'
import type { SyncIssue } from './saveFailure'
import type { HeldOutActivity } from './sessionLibrary'
import type { RejectedFile, SessionState } from './sessionState'
import type { RecordsCache } from './sessionRecords'
import type { ActivityDigest, AthleteSettings } from './types'
import { NO_ZONE_TIMES, zoneEstimatesOf } from './zones'
import type { HeartRateJudge, ZoneTimeCache } from './zones'

/** What a session holds that its state is made from: the library, the choices, the caches and the counts. */
export interface StateInputs {
  /** The digests the analysis reads: current, then compatible. Each consumer takes the ones its rule allows (`orderedFor`). */
  digests: ActivityDigest[]
  choice: PeriodChoice
  isSample: boolean
  periods: PeriodCache
  zoneTimes: ZoneTimeCache
  judge: HeartRateJudge
  recordsCache: RecordsCache
  rejected: RejectedFile[]
  unsupportedFiles: number
  outdatedActivities: number
  incompatibleActivities: number
  /** Every digest the library holds, whatever its status. */
  libraryActivities: number
  /** The held-out digests, listed by identity only. */
  heldOut: HeldOutActivity[]
  syncIssues: SyncIssue[]
  /** The workout keys of the walking-pace runs the athlete counts, for the state to name. */
  countedWalkingRuns: string[]
  /** The wall clock (or the sample season's day), which the fitness status reads for how long ago the last run was. */
  nowMs: number
}

/**
 * The session's state: the analysis of the chosen period, the trends and evidence over it, and the library
 * listing. `athlete` is the settings the analysis runs on (the sample's own for the sample), null only after
 * a clear, when the library is empty and nothing needs analysing.
 */
export function buildState(inputs: StateInputs, athlete: AthleteSettings | null): SessionState {
  const { digests: all, periods, judge, zoneTimes, recordsCache } = inputs
  // Every change to the library is followed by a state, so the analyses it made stale go here.
  periods.releaseAbsent(all)
  judge.release(all)
  const hidden = hiddenDigests(all)
  const visible = all.filter((d) => !hidden.has(d))
  // A run at walking pace stays in the library and is left out of every analysis.
  const analysed = visible.filter((d) => d.walkingPace !== true)
  const { period, selected, previous } = splitPeriods(analysed, inputs.choice)
  // Whose heart rate is set aside is a judgement of the library, so every period and reader takes the one list.
  const judgement = athlete === null ? NO_HEART_RATE_JUDGEMENT : judge.of(analysed, athlete)
  const setAside = judgement.setAside
  // A ride whose power is set aside is out of every ride reading below, as one whose heart rate is set aside is out
  // of the heart-rate readings: the same ids go where the heart-rate list goes.
  const powerAside = athlete === null ? new Set<string>() : powerSetAsideIds(analysed, athlete)
  const held = powerAside.size === 0 ? setAside : [...setAside, ...powerAside]
  // A period with no activities still has a result, so the page can say what is missing from it.
  const references = {
    referenceHr: judgement.referenceHr,
    observedMaxHr: judgement.observedMaxHr,
    effortReference: judgement.effortReference,
  }
  const analysis =
    athlete !== null && visible.length > 0
      ? periods.analysis(
          selected,
          athlete,
          setAside,
          judgement.calibration,
          references,
          judgement.rideGate,
          judgedWorkOf(judgement),
        )
      : null
  // The references that zones are cut from are the library's, not the period's: one activity has the same zones
  // under every period, and Profile, the activity page and the time in zones all read them.
  const zoneEstimates =
    athlete !== null && analysis !== null
      ? zoneEstimatesOf(judgement, Math.floor(inputs.nowMs / DAY_MS) * DAY_MS)
      : null
  // The selected period's bike model prices the trend and the previous period alike.
  const bikeModel = analysis?.bikeModel
  // All time is not clipped at a start, so its trend begins at the first activity.
  const fromMs = period.days === null ? null : period.startMs
  const efforts =
    athlete === null
      ? NO_TRENDS
      : periods.trends(selected, athlete, period.days, fromMs, bikeModel, judgement.rideGate)
  const sameHeartRate =
    analysis === null ? NO_SAME_HEART_RATE : periods.sameHeartRate(selected, analysed, fromMs, held)
  const late =
    analysis === null
      ? NO_LATE_EVIDENCE
      : periods.late(
          selected.filter((digest) => !powerAside.has(digest.id)),
          held,
          { effortReference: judgement.effortReference },
        )
  return {
    result: analysis,
    trend: efforts[HEADLINE_DURATION_S],
    effortTrends: efforts,
    sameHeartRate,
    lateEvidence: late,
    heartRateJudgement: judgement,
    // Library-wide like the judgement it reads, and remembered for these digests, so a period switch costs nothing.
    fitness: fitnessStatuses(analysed, new Set(held), {
      nowMs: Math.floor(inputs.nowMs / DAY_MS) * DAY_MS,
    }),
    zoneEstimates,
    timeInZones:
      athlete === null || analysis === null
        ? NO_ZONE_TIMES
        : zoneTimes.get(selected, previous, athlete, zoneEstimates, setAside),
    previous:
      athlete !== null && bikeModel !== undefined && previous.length > 0
        ? periods.previousCurves(selected, previous, athlete, bikeModel, judgement.rideGate, {
            effortReference: judgement.effortReference,
            setAside,
          })
        : null,
    change:
      athlete !== null && bikeModel !== undefined && previous.length > 0
        ? // The test reads the efforts the effort gate does not show easy, so a swing in how many hard efforts a period holds is no change.
          periods.change(
            selected,
            previous,
            athlete,
            bikeModel,
            judgement.rideGate,
            hardEffortRule(judgement.effortReference, setAside),
          )
        : null,
    rejected: inputs.rejected,
    unsupportedFiles: inputs.unsupportedFiles,
    isSample: inputs.isSample,
    totalActivities: analysed.length,
    outdatedActivities: inputs.outdatedActivities,
    incompatibleActivities: inputs.incompatibleActivities,
    libraryActivities: inputs.libraryActivities,
    heldOut: inputs.heldOut,
    hiddenDuplicates: hidden.size,
    walkingPaceRuns: visible.length - analysed.length,
    countedWalkingRuns: inputs.countedWalkingRuns,
    period,
    library:
      athlete === null
        ? []
        : activitySummaries(visible, athlete, rideReferenceOf(judgement.effortReference)),
    syncIssues: inputs.syncIssues,
    records:
      athlete === null
        ? new Map<string, EarnedRecord[]>()
        : recordsCache.holders(analysed, athlete, judgement.rideGate),
  }
}
