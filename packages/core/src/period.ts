import { DAY_MS } from './constants'
import { sportCurves } from './digest/combine'
import { fitnessTrend } from './digest/trend'
import type { TrendPoint } from './digest/trend'
import { EFFORT_LENGTHS_S, trendWindowDays } from './digest/trendPoints'
import type { EffortLengthS } from './digest/trendPoints'
import type { ActivityDigest, AthleteSettings, BikeModel, SportCurves } from './types'

export interface Periods {
  /** The digests in the selected period; every visible digest for all time. */
  selected: ActivityDigest[]
  /** The digests in the period before the selected one, of the same length. Empty for all time. */
  previous: ActivityDigest[]
  /** Start of the selected period, in ms; null for all time. */
  startMs: number | null
}

/**
 * Splits the visible digests into the selected period and the one before it. A period is the last
 * rangeDays days up to the newest activity, not up to today, so an old export still shows its last
 * weeks. A null rangeDays is all time.
 */
export function splitPeriods(visible: ActivityDigest[], rangeDays: number | null): Periods {
  if (rangeDays === null || visible.length === 0) {
    return { selected: visible, previous: [], startMs: null }
  }
  const newest = visible.reduce((latest, d) => Math.max(latest, d.startMs), -Infinity)
  const startMs = newest - rangeDays * DAY_MS
  const previousStartMs = startMs - rangeDays * DAY_MS
  return {
    selected: visible.filter((d) => d.startMs >= startMs),
    previous: visible.filter((d) => d.startMs >= previousStartMs && d.startMs < startMs),
    startMs,
  }
}

/** Whether two lists hold the same digest objects in the same order. */
export function sameDigests(a: ActivityDigest[], b: ActivityDigest[]): boolean {
  return a.length === b.length && a.every((digest, i) => digest === b[i])
}

/** The masses and digests that a cached result was computed from. */
interface Inputs {
  selected: ActivityDigest[]
  massKg: number
  bikeMassKg: number
}

function sameInputs(
  cached: Inputs,
  selected: ActivityDigest[],
  settings: AthleteSettings,
): boolean {
  return (
    cached.massKg === settings.massKg &&
    cached.bikeMassKg === settings.bikeMassKg &&
    sameDigests(cached.selected, selected)
  )
}

/**
 * The trend and the previous period's curves, reused between calls while their inputs are the same.
 * Both are priced with the bike model of the selected period, which depends only on the selected
 * digests and the masses, so those are the whole key.
 */
export class PeriodCache {
  private trendEntries = new Map<
    EffortLengthS,
    Inputs & { rangeDays: number | null; points: TrendPoint[] }
  >()
  private previousEntry: (Inputs & { previous: ActivityDigest[]; curves: SportCurves }) | null =
    null

  /** The weekly trend of each effort length over the selected period, reused while its inputs are the same. */
  trends(
    selected: ActivityDigest[],
    settings: AthleteSettings,
    rangeDays: number | null,
    startMs: number | null,
    bikeModel: BikeModel | undefined,
  ): Record<EffortLengthS, TrendPoint[]> {
    return Object.fromEntries(
      EFFORT_LENGTHS_S.map((durationS) => [
        durationS,
        this.trend(selected, settings, rangeDays, startMs, bikeModel, durationS),
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
  ): TrendPoint[] {
    const cached = this.trendEntries.get(durationS)
    if (cached && cached.rangeDays === rangeDays && sameInputs(cached, selected, settings)) {
      return cached.points
    }
    const points = fitnessTrend(selected, settings, {
      durationS,
      windowDays: trendWindowDays(rangeDays),
      fromMs: startMs ?? undefined,
      bikeModel,
    })
    this.trendEntries.set(durationS, { selected, ...masses(settings), rangeDays, points })
    return points
  }

  /** The curves of the period before, priced with the selected period's bike model. */
  previousCurves(
    selected: ActivityDigest[],
    previous: ActivityDigest[],
    settings: AthleteSettings,
    bikeModel: BikeModel,
  ): SportCurves {
    const cached = this.previousEntry
    if (
      cached !== null &&
      sameInputs(cached, selected, settings) &&
      sameDigests(cached.previous, previous)
    ) {
      return cached.curves
    }
    const curves = sportCurves(previous, settings, bikeModel)
    this.previousEntry = { selected, ...masses(settings), previous, curves }
    return curves
  }
}

function masses(settings: AthleteSettings): { massKg: number; bikeMassKg: number } {
  return { massKg: settings.massKg, bikeMassKg: settings.bikeMassKg }
}
