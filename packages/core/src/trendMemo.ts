import { sameAnalysisSettings } from './athlete/references'
import type { KeyedReadingRule } from './digest/readingRule'
import { rideGateKey } from './digest/estimatedRide'
import type { EstimatedRideGate } from './digest/estimatedRide'
import { fitnessTrend } from './digest/trend'
import type { TrendPoint } from './digest/trend'
import {
  EFFORT_LENGTHS_S,
  MIN_DOTS,
  NONE_WITHHELD,
  dotCount,
  trendWindowDays,
} from './digest/trendPoints'
import type { DotsWithheld, EffortLengthS } from './digest/trendPoints'
import { sameDigests } from './sameDigests'
import type { ActivityDigest, AthleteSettings, BikeModel } from './types'

/** What a trend is read from besides the period and the bike model: the ride gate and the dots' rule. */
export interface TrendExtras {
  rideGate?: EstimatedRideGate | null
  rule?: KeyedReadingRule
}

/** The period a trend is read over: the digests, the settings, the length of the period and its start. */
export interface TrendPeriod {
  selected: ActivityDigest[]
  settings: AthleteSettings
  rangeDays: number | null
  startMs: number | null
  bikeModel: BikeModel | undefined
}

interface Entry {
  period: TrendPeriod
  gate: string
  points: TrendPoint[]
}

function samePeriod(a: TrendPeriod, b: TrendPeriod): boolean {
  return (
    a.rangeDays === b.rangeDays &&
    a.startMs === b.startMs &&
    sameAnalysisSettings(a.settings, b.settings) &&
    sameDigests(a.selected, b.selected)
  )
}

function eachLength<T>(read: (durationS: EffortLengthS) => T): Record<EffortLengthS, T> {
  return Object.fromEntries(
    EFFORT_LENGTHS_S.map((durationS) => [durationS, read(durationS)]),
  ) as Record<EffortLengthS, T>
}

/**
 * The weekly trend of each effort length over a period, reused while its inputs are the same, and the same trend read
 * without the dots' rule, kept apart so asking what the rule withheld never evicts the trend the page draws.
 */
export class TrendMemo {
  private shown = new Map<EffortLengthS, Entry>()
  private open = new Map<EffortLengthS, Entry>()

  clear(): void {
    this.shown.clear()
    this.open.clear()
  }

  trends(period: TrendPeriod, extras: TrendExtras): Record<EffortLengthS, TrendPoint[]> {
    return eachLength((durationS) => this.read(this.shown, period, durationS, extras))
  }

  /**
   * The sports' lengths whose dots the rule left too few to draw while the same period without it has enough: the empty
   * state of such a length names the rule, since more days would not help. The period is read without the rule only for a
   * length that falls short, and not at all with no rule.
   */
  withheld(
    period: TrendPeriod,
    extras: TrendExtras,
    shown: Readonly<Record<EffortLengthS, readonly TrendPoint[]>>,
  ): DotsWithheld {
    if (extras.rule === undefined) return NONE_WITHHELD
    const open = { rideGate: extras.rideGate }
    const lacking = (sport: 'run' | 'ride') =>
      eachLength(
        (durationS) =>
          dotCount(shown[durationS], sport) < MIN_DOTS &&
          dotCount(this.read(this.open, period, durationS, open), sport) >= MIN_DOTS,
      )
    return { run: lacking('run'), ride: lacking('ride') }
  }

  /** The weekly trend of one effort length: a third of the period in each window, within the period. */
  private read(
    kept: Map<EffortLengthS, Entry>,
    period: TrendPeriod,
    durationS: EffortLengthS,
    extras: TrendExtras,
  ): TrendPoint[] {
    const gate = `${rideGateKey(extras.rideGate)}|${extras.rule?.key ?? ''}`
    const cached = kept.get(durationS)
    if (cached && cached.gate === gate && samePeriod(cached.period, period)) return cached.points
    const points = fitnessTrend(period.selected, period.settings, {
      durationS,
      windowDays: trendWindowDays(period.rangeDays),
      fromMs: period.startMs ?? undefined,
      bikeModel: period.bikeModel,
      ...extras,
    })
    kept.set(durationS, { period, gate, points })
    return points
  }
}
