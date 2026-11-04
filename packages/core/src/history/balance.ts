import { civilOfDay, localDayOf } from '../calendar'
import { plainCurve } from '../digest/bestCurve'
import { thresholdSpeedOf } from '../digest/equivalents'
import { ownRideGate } from '../digest/estimatedRide'
import { massesOf } from '../digest/masses'
import { trustedPower } from '../digest/powerCheck'
import { bestCurves, fitBikeModelOver } from '../digest/rideCurves'
import { thresholdsOf } from '../digest/thresholdLibraries'
import { effortGatesOf } from '../digest/twentyMinute'
import { NO_EFFORT_REFERENCE } from '../effort'
import type { EffortVerdict } from '../effort'
import { sameAnalysisSettings } from '../athlete/references'
import { sameSet } from '../digestMemo'
import type { ThresholdEstimate } from '../threshold'
import { SPORTS } from '../types'
import type { ActivityDigest, Interval, LocalDayShift, Sport } from '../types'
import { perSport } from './sports'
import type { HistoryInput, HistoryPart } from './types'

/** One sport's threshold over a calendar year's activities, before it is graded: what the age grade is taken from. */
export interface YearThreshold {
  /** The activity that set the strongest effort behind it, and the shift of its local day: the age is the one on that day. */
  startMs: number
  localDayShift?: LocalDayShift
  /** The flat running speed the threshold stands for, m/s, with its 5th and 95th percentile range (`thresholdSpeedOf`). */
  speed: Interval
  /** Whether the effort gate found that year's best 20 minutes hard; `unknown` where it could not judge. */
  verdict: EffortVerdict
}

/** A calendar year with a threshold in at least one sport. Years with none are left out. */
export interface BalanceYear {
  year: number
  sports: Record<Sport, YearThreshold | null>
}

/** What one year's digests give: each sport's threshold, and the gate's verdict on its best 20 minutes. */
interface YearReads {
  threshold: Record<Sport, ThresholdEstimate | null>
  verdict: Record<Sport, EffortVerdict>
}

/**
 * A year's thresholds, as an analysis of that year alone makes them: the bike model fitted over its rides, the library's ride gate,
 * set-aside list and references (`thresholdsOf`, which the analysis reads), and each year's own heart-rate line. The gate's verdict
 * on the year's best 20 minutes is the one the analysis states beside its threshold. The hero reads a window the same way, so an
 * equal window grades to the same number.
 */
function readYear(own: ActivityDigest[], input: HistoryInput): YearReads {
  const { settings } = input
  const masses = massesOf(settings)
  const bikeModel = fitBikeModelOver(own, masses).model
  const gate = input.gate === undefined ? ownRideGate(trustedPower(own, masses)) : input.gate
  const curves = bestCurves(own, masses, bikeModel, settings.massKg, gate)
  const reference = input.effortReference ?? NO_EFFORT_REFERENCE
  const gates = effortGatesOf(
    own,
    masses,
    bikeModel,
    gate,
    { run: plainCurve(curves.runBest), ride: curves.rideMetabolic },
    reference,
    input.setAside,
  )
  return {
    threshold: thresholdsOf(
      own,
      { masses, bikeModel, gate, heartSetAside: input.setAside },
      reference.referenceHr,
      input.lines,
    ),
    verdict: { run: gates.run.verdict, ride: gates.ride.verdict },
  }
}

function build(digests: ActivityDigest[], input: HistoryInput): BalanceYear[] {
  const byYear = new Map<number, ActivityDigest[]>()
  for (const digest of digests) {
    if (!SPORTS.includes(digest.sport)) continue
    const year = civilOfDay(localDayOf(digest)).year
    byYear.set(year, [...(byYear.get(year) ?? []), digest])
  }
  const rows: BalanceYear[] = []
  for (const [year, own] of [...byYear].sort(([a], [b]) => a - b)) {
    const reads = readYear(own, input)
    const sports = perSport((sport): YearThreshold | null => {
      const estimate = reads.threshold[sport]
      const digest = own.find(
        (candidate) => candidate.id === estimate?.efforts.strongest.activityId,
      )
      const speed = thresholdSpeedOf(sport, estimate, input.settings.sex)
      if (speed === null || digest === undefined) return null
      return {
        startMs: digest.startMs,
        ...(digest.localDayShift === undefined ? {} : { localDayShift: digest.localDayShift }),
        speed,
        verdict: reads.verdict[sport],
      }
    })
    if (SPORTS.some((sport) => sports[sport] !== null)) rows.push({ year, sports })
  }
  return rows
}

/** The references are small, and a judgement made again holds equal ones, so they are compared by value. */
const sameReference = (a: HistoryInput['effortReference'], b: HistoryInput['effortReference']) =>
  a === b || JSON.stringify(a) === JSON.stringify(b)

/**
 * Each calendar year's threshold for run and ride, for the age grades of the Balance over the years: the speed it stands for and
 * the day of its strongest effort, with whether the year's best 20 minutes was a hard effort. It reads the whole library by the judgement the
 * hero reads (set-aside, ride gate, references), so the same window gives the same grade.
 */
export const balance: HistoryPart<BalanceYear[]> = {
  empty: [],
  build,
  same: (a, b) =>
    sameSet(a.setAside, b.setAside) &&
    a.gate === b.gate &&
    a.lines === b.lines &&
    sameAnalysisSettings(a.settings, b.settings) &&
    sameReference(a.effortReference, b.effortReference),
}
