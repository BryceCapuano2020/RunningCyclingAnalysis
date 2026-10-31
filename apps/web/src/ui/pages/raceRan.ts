import type { RunPredictions } from '@rca/core/predict'
import { formatRecordTime } from '@rca/core/units'
import { formatDayMonth } from '../format/date'
import type { DistanceRecord } from '../records'

/**
 * A recorded best at a race's distance set beside its prediction, for its row: one faster than the prediction (also its
 * dot on the bar), or one slower than the whole spread, which says the prediction asks for more than has been run.
 */
export interface RanBest {
  distanceM: number
  seconds: number
  /** Whether the recorded best is faster than the prediction, or slower than the top of its spread. */
  side: 'faster' | 'slower'
  /** The day it was run, such as "27 Nov", with the year when it is not the one the page opened in. */
  when: string
}

/**
 * The races whose period holds a recorded best at that distance that sets the prediction in doubt. A prediction is an
 * estimate and a run is a fact, so where the athlete has already run faster, the row says so beside it; and where the
 * best on file is slower than the spread's slow end, the prediction was carried from other distances and asks for more
 * than has been run at this one, and the row says that. `openedAt` fixes the year a date needs, so a later render does
 * not move it.
 */
export function ranBests(
  found: RunPredictions,
  records: readonly Pick<DistanceRecord, 'distanceM' | 'seconds' | 'activity'>[],
  openedAt: number,
): RanBest[] {
  return found.races.flatMap((race) => {
    const record = records.find((r) => r.distanceM === race.distanceM)
    if (record === undefined) return []
    const side =
      record.seconds < race.seconds ? 'faster' : record.seconds > race.high ? 'slower' : null
    return side === null
      ? []
      : [
          {
            distanceM: race.distanceM,
            seconds: record.seconds,
            side,
            when: formatDayMonth(record.activity.startMs, openedAt),
          },
        ]
  })
}

/**
 * What a row says of its recorded best: "You ran 40:07 on 27 Nov", or, for one slower than the spread, "Your best is
 * 44:10, from 27 Nov, slower than this spread".
 */
export function ranText(ran: RanBest): string {
  const time = formatRecordTime(ran.seconds)
  return ran.side === 'faster'
    ? `You ran ${time} on ${ran.when}`
    : `Your best is ${time}, from ${ran.when}, slower than this spread`
}
