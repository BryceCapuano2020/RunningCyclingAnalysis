import { DURABILITY_AFTER_S } from '@rca/core/constants'
import type { DriftPoint, LateEvidence, PeriodDurabilityRow } from '@rca/core/digest'
import type { Sport } from '@rca/core/types'

/** One late best: the output, the activities behind it, and its share of the fresh best. */
export interface LateSpec {
  value: number
  supporters: number
}

/** A row of the period's durability: the fresh best, and a late best for each of the three levels, or none. */
export function durabilityRow(
  durationS: number,
  fresh: number,
  late: readonly (LateSpec | null)[],
): PeriodDurabilityRow {
  return {
    durationS,
    fresh: { value: fresh, activityId: 'best', supporters: 20 },
    after: DURABILITY_AFTER_S.map((afterS, i) => {
      const spec = late[i] ?? null
      return spec === null
        ? { afterS, best: null, retention: null }
        : {
            afterS,
            best: { value: spec.value, activityId: `late-${afterS}`, supporters: spec.supporters },
            retention: spec.value / fresh,
          }
    }),
  }
}

/** Steady efforts a week apart, each losing the given share of its efficiency. */
export function driftPoints(decoupling: readonly number[]): DriftPoint[] {
  return decoupling.map((pct, i) => ({
    activityId: `steady-${i}`,
    startMs: Date.UTC(2025, 0, 6 + 7 * i, 8),
    firstRatio: 1,
    secondRatio: 1 - pct / 100,
    durationS: 4200 + 60 * i,
    decouplingPct: pct,
  }))
}

/** The fresh 5 and 20 min bests the fixture is built on: metabolic W/kg for a run, watts for a ride. */
const FRESH: Record<Sport, [number, number]> = { run: [16, 14], ride: [310, 270] }

/**
 * Late-effort evidence a sport page can draw. A run's values are metabolic W/kg and a ride's are watts,
 * as the digests hold them. The 5 min row has a late best at all three levels but the last has too few
 * activities; the 20 min row stops at 90 min.
 */
export function lateEvidenceFor(sport: Sport): LateEvidence {
  const [fresh5, fresh20] = FRESH[sport]
  return {
    durability: [
      durabilityRow(300, fresh5, [
        { value: fresh5 * 0.95, supporters: 8 },
        { value: fresh5 * 0.92, supporters: 5 },
        { value: fresh5 * 0.9, supporters: 2 },
      ]),
      durabilityRow(1200, fresh20, [
        { value: fresh20 * 0.96, supporters: 6 },
        { value: fresh20 * 0.94, supporters: 4 },
        null,
      ]),
    ],
    drift: driftPoints([1, 2, 3, 3, 4, 2, 5, 3, 6, 3, 4, 2]),
  }
}
