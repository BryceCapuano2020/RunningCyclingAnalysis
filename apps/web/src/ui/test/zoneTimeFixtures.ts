import { noTimeInZones } from '@rca/core/zones'
import type { MeasureTime, ZoneMeasure } from '@rca/core/zones'
import type { Sport } from '@rca/core/types'

/** A sport's measure with these seconds in each zone, over `counted` activities, for tests. */
export function measureTime(
  sport: Sport,
  measure: ZoneMeasure,
  seconds: number[],
  extra: Partial<MeasureTime> = {},
): MeasureTime {
  const base = noTimeInZones()[sport].find((row) => row.measure === measure)!
  return {
    ...base,
    seconds,
    totalSeconds: seconds.reduce((a, b) => a + b, 0),
    counted: 8,
    ...extra,
  }
}
