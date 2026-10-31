import { DAY_MS, DURATIONS_S, RUN_RECORD_DISTANCES_M } from '../constants'
import { changeCallBetween, readingsOf } from '../change'
import type { Readings } from '../change'
import { orderedFor } from '../digest/consumers'
import { effortsCount } from '../digest/effortTrust'
import { ownRideGate } from '../digest/estimatedRide'
import type { EstimatedRideGate } from '../digest/estimatedRide'
import { massesOf } from '../digest/masses'
import { fitBikeModelOver } from '../digest/rideCurves'
import { EFFORT_LENGTHS_S } from '../digest/trendPoints'
import { metabolicToFlatSpeed } from '../metabolic'
import { effortProgression } from '../records/progression'
import type { Reading } from '../records/progression'
import type { ActivityDigest, AthleteSettings, Sport } from '../types'
import { LOOKBACK } from './params'
import type { EffortMilestones, MilestoneEffort, MilestoneUnit } from './types'

const M = LOOKBACK.milestones
const yearOf = (ms: number) => new Date(ms).getUTCFullYear()

/** A run's reading is gross metabolic W/kg at its pace, which the page writes as a pace: the flat speed it stands for. */
const RUN_VALUE = metabolicToFlatSpeed

/** A reading of one effort: the activity, when it was, and what it was. Higher is better, except for a time. */
interface Point {
  id: string
  startMs: number
  value: number
}

/** Each year's best, with how many readings it was among. */
function yearly(points: readonly Point[], better: (a: number, b: number) => boolean) {
  const byYear = new Map<number, { best: Point; n: number }>()
  for (const p of points) {
    const year = yearOf(p.startMs)
    const held = byYear.get(year)
    if (held === undefined) byYear.set(year, { best: p, n: 1 })
    else {
      held.n++
      if (better(p.value, held.best.value)) held.best = p
    }
  }
  return [...byYear].sort(([a], [b]) => a - b)
}

/**
 * One effort's milestones from its readings in any order: the dated sequence of new all-time bests (an activity whose
 * reading beats every earlier one), the best of each year, the largest jumps. `better` says which value is better.
 * Null with too few readings or too few different days to say how a best moved.
 */
export function milestonesFor(
  effort: MilestoneEffort,
  unit: MilestoneUnit,
  readings: readonly Point[],
  asOfMs: number,
  better: (a: number, b: number) => boolean,
  verdictOf: (year: number) => EffortMilestones['verdicts'][number]['verdict'] | null,
): EffortMilestones | null {
  const points = [...readings].sort((a, b) => a.startMs - b.startMs)
  if (points.length < M.readings) return null
  if (new Set(points.map((p) => Math.floor(p.startMs / DAY_MS))).size < M.days) return null
  const records: { p: Point; previous: number | null }[] = []
  let top: Point | null = null
  for (const p of points) {
    if (top === null || better(p.value, top.value)) {
      records.push({ p, previous: top?.value ?? null })
      top = p
    }
  }
  const best = records.at(-1)!.p
  const jump = (r: { p: Point; previous: number | null }) =>
    r.previous === null ? 0 : Math.abs(r.p.value / r.previous - 1)
  const steps = records
    .filter((r) => r.previous !== null)
    .sort((a, b) => jump(b) - jump(a))
    .slice(0, LOOKBACK.caps.steps)
    .sort((a, b) => a.p.startMs - b.p.startMs)
    .map((r) => ({ atMs: r.p.startMs, value: r.p.value, previous: r.previous!, id: r.p.id }))
  const thisYear = yearOf(asOfMs)
  const years = yearly(points, better).map(([year, { best: b, n }]) => ({
    year,
    partial: year === thisYear,
    value: b.value,
    id: b.id,
    n,
  }))
  const kept = years.slice(-LOOKBACK.caps.years)
  // The change test is run for the latest complete years only; an older pair is not worth its cost to say.
  const verdicts = years.slice(-LOOKBACK.caps.verdicts - 1).flatMap(({ year, partial }) => {
    const verdict = partial ? null : verdictOf(year)
    return verdict === null ? [] : [{ year, verdict }]
  })
  return {
    effort,
    unit,
    best: { value: best.value, atMs: best.startMs, id: best.id },
    years: kept,
    omittedYears: years.length - kept.length,
    steps,
    verdicts,
  }
}

/** The distances a runner measures bests by: 5 km, 10 km and the half marathon. */
const DISTANCES = RUN_RECORD_DISTANCES_M.filter((d) => d >= 5000)

const higher = (a: number, b: number) => a > b
const lower = (a: number, b: number) => a < b

/**
 * Each sport's best efforts over the years at 5, 20 and 60 minutes and, for runs, at the record distances: demonstrated
 * bests, priced and made eligible as the records are (a treadmill run holds none, an estimate no heart rate backs holds
 * none), never called capability. Each complete calendar year is set against the one before it by the change test.
 */
export function milestonesOf(
  digests: ActivityDigest[],
  settings: AthleteSettings,
  gate?: EstimatedRideGate | null,
): Record<Sport, EffortMilestones[]> {
  const ordered = orderedFor('records', digests)
  const out: Record<Sport, EffortMilestones[]> = { run: [], ride: [] }
  if (ordered.length === 0) return out
  const asOfMs = ordered.reduce((newest, d) => Math.max(newest, d.startMs), 0)
  const progression = effortProgression(digests, settings, gate)
  const rideGate = gate === undefined ? ownRideGate(ordered) : gate
  const masses = massesOf(settings)
  const bikeModel = fitBikeModelOver(ordered, masses).model
  const eligible = ordered.filter(effortsCount)
  // The change test over two calendar years' efforts: each year's readings are made once, and a pair is judged as two periods are.
  const yearReadings = new Map<number, Readings>()
  const readingsOfYear = (year: number): Readings => {
    let made = yearReadings.get(year)
    if (made === undefined) {
      made = readingsOf(
        eligible.filter((d) => yearOf(d.startMs) === year),
        settings,
        bikeModel,
        rideGate,
      )
      yearReadings.set(year, made)
    }
    return made
  }
  const hasYear = (sport: Sport, year: number) =>
    eligible.some((d) => d.sport === sport && yearOf(d.startMs) === year)
  const sports: Sport[] = ['run', 'ride']
  for (const sport of sports) {
    for (const durationS of EFFORT_LENGTHS_S) {
      const index = DURATIONS_S.indexOf(durationS)
      const readings: Point[] = (progression[sport].readings[index] as Reading[])
        .filter((r) => !r.alone)
        .map((r) => ({
          id: r.id,
          startMs: r.startMs,
          value: sport === 'run' ? RUN_VALUE(r.value) : r.value,
        }))
      const unit: MilestoneUnit =
        sport === 'run' ? 'm/s' : progression[sport].unit === 'W/kg' ? 'W/kg' : 'W'
      const milestones = milestonesFor(
        { kind: 'duration', durationS },
        unit,
        readings,
        asOfMs,
        higher,
        (year) =>
          hasYear(sport, year) && hasYear(sport, year - 1)
            ? changeCallBetween(sport, durationS, readingsOfYear(year), readingsOfYear(year - 1))
                .verdict
            : null,
      )
      if (milestones !== null) out[sport].push(milestones)
    }
  }
  for (const distanceM of DISTANCES) {
    const readings: Point[] = eligible.flatMap((d) => {
      const seconds =
        d.sport === 'run'
          ? d.distanceBests?.find((b) => b.distanceM === distanceM)?.seconds
          : undefined
      return seconds === undefined ? [] : [{ id: d.id, startMs: d.startMs, value: seconds }]
    })
    const milestones = milestonesFor(
      { kind: 'distance', distanceM },
      's',
      readings,
      asOfMs,
      lower,
      () => null,
    )
    if (milestones !== null) out.run.push(milestones)
  }
  return out
}
