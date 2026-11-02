import { civilOfDay, localDayOf } from '../calendar'
import { HEADLINE_DURATION_S } from '../constants'
import { plainCurve } from '../digest/bestCurve'
import { equivalenceFor } from '../digest/combine'
import { equivalentsOf } from '../digest/equivalents'
import { ownRideGate } from '../digest/estimatedRide'
import { massesOf } from '../digest/masses'
import { trustedPower } from '../digest/powerCheck'
import { bestCurves, fitBikeModelOver } from '../digest/rideCurves'
import { effortGatesOf } from '../digest/twentyMinute'
import { NO_EFFORT_REFERENCE } from '../effort'
import type { EffortVerdict } from '../effort'
import { sameAnalysisSettings } from '../athlete/references'
import { sameSet } from '../digestMemo'
import { metabolicToFlatSpeed } from '../metabolic'
import { SPORTS } from '../types'
import type { ActivityDigest, Curve, Interval, LocalDayShift, Sport } from '../types'
import { perSport } from './sports'
import type { HistoryInput, HistoryPart } from './types'

/** One sport's best 20 minutes of a calendar year, before it is graded: what the age grade is taken from. */
export interface YearBest {
  /** The activity that set it, and the shift of its local day: the age is the one on that day. */
  startMs: number
  localDayShift?: LocalDayShift
  /** The flat running speed with the same cost, m/s: a run's pace as recorded, a ride's running equivalent (median). */
  speed: number
  /** A ride's 90% range of that speed, 5th and 95th percentile; null for a run, which is as recorded. */
  range: readonly [number, number] | null
  /** Whether the effort gate found that year's best 20 minutes hard; `unknown` where it could not judge. */
  verdict: EffortVerdict
}

/** A calendar year with a best 20 minutes in at least one sport. Years with none are left out. */
export interface BalanceYear {
  year: number
  sports: Record<Sport, YearBest | null>
}

/** The speed interval of a best, for the grade: a run's is one value. */
export function speedOfBest(best: YearBest): Interval {
  const [p05, p95] = best.range ?? [best.speed, best.speed]
  return { p05, p50: best.speed, p95 }
}

/** Which sports carry a range: a ride is estimated through its running equivalent. */
const RANGED: Record<Sport, boolean> = { run: false, ride: true }

/** What one year's digests give: each sport's curve, the speed its best stands for, and the gate's verdict. */
interface YearReads {
  curve: Record<Sport, Curve>
  speed: Record<Sport, Interval | null>
  verdict: Record<Sport, EffortVerdict>
}

const headlineOf = (curve: Curve) => curve.find((point) => point.durationS === HEADLINE_DURATION_S)

/**
 * A year's curves, as an analysis of that year alone makes them: the bike model fitted over its rides, the library's
 * ride gate, set-aside list, calibration and references. The hero reads a window the same way, so an equal window
 * grades to the same number.
 */
function readYear(
  own: ActivityDigest[],
  input: HistoryInput,
  equivalence: () => ReturnType<typeof equivalenceFor>,
): YearReads {
  const { settings } = input
  const masses = massesOf(settings)
  const bikeModel = fitBikeModelOver(own, masses).model
  const gate = input.gate === undefined ? ownRideGate(trustedPower(own, masses)) : input.gate
  const curves = bestCurves(own, masses, bikeModel, settings.massKg, gate)
  const run = plainCurve(curves.runBest)
  const ride = plainCurve(curves.rideBest)
  const gates = effortGatesOf(
    own,
    masses,
    bikeModel,
    gate,
    { run, ride: curves.rideMetabolic },
    input.effortReference ?? NO_EFFORT_REFERENCE,
    input.setAside,
  )
  const equivalent = equivalentsOf(equivalence(), ride, curves.bodyKgById, settings.massKg, [
    HEADLINE_DURATION_S,
  ])[0]
  const runPoint = headlineOf(run)
  const flat = runPoint === undefined ? Number.NaN : metabolicToFlatSpeed(runPoint.value)
  return {
    curve: { run, ride },
    speed: {
      run: Number.isFinite(flat) ? { p05: flat, p50: flat, p95: flat } : null,
      ride: equivalent?.runSpeed ?? null,
    },
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
  // The draws behind the equivalents are the same for every year, so they are built once, and only for a library with a ride.
  let made: ReturnType<typeof equivalenceFor> | null = null
  const equivalence = () => (made ??= equivalenceFor(input.calibration ?? null))
  const rows: BalanceYear[] = []
  for (const [year, own] of [...byYear].sort(([a], [b]) => a - b)) {
    const reads = readYear(own, input, equivalence)
    const sports = perSport((sport): YearBest | null => {
      const point = headlineOf(reads.curve[sport])
      const speed = reads.speed[sport]
      const digest = own.find((candidate) => candidate.id === point?.activityId)
      if (speed === null || digest === undefined) return null
      return {
        startMs: digest.startMs,
        ...(digest.localDayShift === undefined ? {} : { localDayShift: digest.localDayShift }),
        speed: speed.p50,
        range: RANGED[sport] ? [speed.p05, speed.p95] : null,
        verdict: reads.verdict[sport],
      }
    })
    if (SPORTS.some((sport) => sports[sport] !== null)) rows.push({ year, sports })
  }
  return rows
}

const sameCalibration = (a: HistoryInput['calibration'], b: HistoryInput['calibration']) =>
  a === b || (a != null && b != null && a.kappa === b.kappa && a.lnKappaSe === b.lnKappaSe)

/** The references are small, and a judgement made again holds equal ones, so they are compared by value. */
const sameReference = (a: HistoryInput['effortReference'], b: HistoryInput['effortReference']) =>
  a === b || JSON.stringify(a) === JSON.stringify(b)

/**
 * Each calendar year's best 20 minutes for run and ride, for the age grades of the Balance over the years: the speed it
 * stands for and the day it was set, with whether it was a hard effort. It reads the whole library by the judgement the
 * hero reads (set-aside, ride gate, calibration, references), so the same window gives the same grade.
 */
export const balance: HistoryPart<BalanceYear[]> = {
  empty: [],
  build,
  same: (a, b) =>
    sameSet(a.setAside, b.setAside) &&
    a.gate === b.gate &&
    sameAnalysisSettings(a.settings, b.settings) &&
    sameCalibration(a.calibration, b.calibration) &&
    sameReference(a.effortReference, b.effortReference),
}
