import type { RunPredictions } from '@rca/core/predict'
import { formatRecordTime } from '@rca/core/units'
import { formatDayMonth } from '../format/date'
import type { DistanceRecord } from '../records'

/** A recorded best at a race's distance that was faster than the prediction for it, for its row and bar. */
export interface RanBest {
  distanceM: number
  seconds: number
  /** The day it was run, such as "27 Nov", with the year when it is not the one the page opened in. */
  when: string
}

/**
 * The races whose period holds a recorded best at that distance faster than the predicted time. A prediction
 * is an estimate and a run is a fact, so where the athlete has already run faster, the row says so beside it.
 * `openedAt` fixes the year a date needs, so a later render does not move it.
 */
export function ranBests(
  found: RunPredictions,
  records: readonly Pick<DistanceRecord, 'distanceM' | 'seconds' | 'activity'>[],
  openedAt: number,
): RanBest[] {
  return found.races.flatMap((race) => {
    const record = records.find((r) => r.distanceM === race.distanceM)
    return record === undefined || record.seconds >= race.seconds
      ? []
      : [
          {
            distanceM: race.distanceM,
            seconds: record.seconds,
            when: formatDayMonth(record.activity.startMs, openedAt),
          },
        ]
  })
}

/** What a row says of its recorded best: "You ran 40:07 on 27 Nov". */
export function ranText(ran: RanBest): string {
  return `You ran ${formatRecordTime(ran.seconds)} on ${ran.when}`
}
