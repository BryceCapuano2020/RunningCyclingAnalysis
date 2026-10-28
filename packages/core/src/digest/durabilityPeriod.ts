import { DURABILITY_AFTER_S, DURABILITY_DURATIONS_S } from '../constants'
import { possibleRunWkg } from '../curves'
import type { ActivityDigest, Sport } from '../types'

/** The best output at one duration, the activity it came from and how many activities had one. */
export interface DurabilityBest {
  value: number
  activityId: string
  /** Activities with an output at this duration, whether or not it is the best. */
  supporters: number
}

export interface DurabilityAfter {
  afterS: number
  best: DurabilityBest | null
  /** best.value over the fresh best, or null when either is missing. Below 1 means output fades with time on the move. */
  retention: number | null
}

export interface PeriodDurabilityRow {
  durationS: number
  /** The best of the period's main curves: output from fresh legs or from any time in an effort. */
  fresh: DurabilityBest | null
  after: DurabilityAfter[]
}

/** How a sport's digests contribute to durability. */
interface SportRule {
  counts: (digest: ActivityDigest) => boolean
  /** An output in the unit of the sport's curve, or NaN where it is not a possible effort. */
  output: (durationS: number, value: number) => number
}

const SPORT_RULES: Record<Sport, SportRule> = {
  // Runs are in metabolic W/kg. A value above the world-record ceiling for its duration is not a
  // possible effort, so it counts for nothing, as in the main best curve.
  run: { counts: () => true, output: possibleRunWkg },
  // Only measured power: a ride's estimated watts are a model's output, never a durability.
  ride: { counts: (digest) => digest.powerSource === 'measured', output: (_s, value) => value },
}

/** Tracks the best of the values it is given, and how many were finite and positive. */
class Best {
  value = NaN
  activityId = ''
  supporters = 0

  offer(value: number, activityId: string): void {
    if (!(value > 0)) return
    this.supporters++
    if (!(value <= this.value)) {
      this.value = value
      this.activityId = activityId
    }
  }

  result(): DurabilityBest | null {
    return this.supporters === 0
      ? null
      : { value: this.value, activityId: this.activityId, supporters: this.supporters }
  }
}

/**
 * The period's best output at each durability duration, from fresh legs against after 1, 1.5 and 2
 * hours of moving time, for one sport's digests among those given. Digests from before durability was
 * kept support nothing after the first hour, but still count for the fresh best. The ties of a best go
 * to the first digest given, so a caller that orders its digests gets the same activity every time.
 */
export function periodDurability(digests: ActivityDigest[], sport: Sport): PeriodDurabilityRow[] {
  const rule = SPORT_RULES[sport]
  const mine = digests.filter((d) => d.sport === sport && rule.counts(d))
  return DURABILITY_DURATIONS_S.map((durationS) => {
    const fresh = new Best()
    const after = new Map<number, Best>(DURABILITY_AFTER_S.map((afterS) => [afterS, new Best()]))
    for (const digest of mine) {
      const point = digest.curve.find((p) => p.durationS === durationS)
      if (point !== undefined) fresh.offer(rule.output(durationS, point.value), digest.id)
      for (const p of digest.durability ?? []) {
        if (p.durationS === durationS)
          after.get(p.afterS)?.offer(rule.output(durationS, p.value), digest.id)
      }
    }
    const freshBest = fresh.result()
    return {
      durationS,
      fresh: freshBest,
      after: DURABILITY_AFTER_S.map((afterS) => {
        const best = after.get(afterS)!.result()
        const retention = best === null || freshBest === null ? null : best.value / freshBest.value
        return { afterS, best, retention }
      }),
    }
  })
}
