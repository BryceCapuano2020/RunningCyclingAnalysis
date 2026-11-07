import { HEADLINE_DURATION_S } from './constants'
import { sameAnalysisSettings } from './athlete/references'
import type { KeyedReadingRule } from './digest/readingRule'
import { rideGateKey } from './digest/estimatedRide'
import type { EstimatedRideGate } from './digest/estimatedRide'
import { fitnessTrend } from './digest/trend'
import type { TrendPoint } from './digest/trend'
import { trendWindowDays } from './digest/trendPoints'
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

/** The weekly headline trend of a period, reused while its inputs are the same. */
export class TrendMemo {
  private shown: Entry | null = null

  clear(): void {
    this.shown = null
  }

  /** The weekly trend of the headline effort length: a third of the period in each window, within the period. */
  trend(period: TrendPeriod, extras: TrendExtras): TrendPoint[] {
    const gate = `${rideGateKey(extras.rideGate)}|${extras.rule?.key ?? ''}`
    const cached = this.shown
    if (cached && cached.gate === gate && samePeriod(cached.period, period)) return cached.points
    const points = fitnessTrend(period.selected, period.settings, {
      durationS: HEADLINE_DURATION_S,
      windowDays: trendWindowDays(period.rangeDays),
      fromMs: period.startMs ?? undefined,
      bikeModel: period.bikeModel,
      ...extras,
    })
    this.shown = { period, gate, points }
    return points
  }
}
