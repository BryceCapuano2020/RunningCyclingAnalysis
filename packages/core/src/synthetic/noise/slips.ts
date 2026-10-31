import { DAY_MS } from '../../constants'
import { digestActivity } from '../../digest/digestActivity'
import { dayOfMs, replay, weekOfMs } from '../../fitness/machine'
import { rideSeries } from '../../fitness/rideUnit'
import { runSeries } from '../../fitness/unit'
import type { UnitSeries } from '../../fitness/unit'
import type { ActivityDigest, Sport } from '../../types'
import { LIBRARY_END_MS } from './library'
import type { Library } from './library'

const SERIES: Record<Sport, (digests: ActivityDigest[], sport: Sport) => UnitSeries> = {
  run: (digests, sport) => runSeries(digests, sport, new Set()),
  ride: (digests, sport) => rideSeries(digests, sport, new Set()),
}

/**
 * Weeks (0 up from the library's first week) at which the fitness monitor declares a slip for one
 * sport of a generated library: the unit of the sport's activities, replayed week by week as the
 * app does. Null when the sport has fewer than 8 steady readings. `weeks` is the library's length.
 */
export function slipWeeksOf(library: Library, sport: Sport, weeks: number): number[] | null {
  const digests = library.entries.map((e) => digestActivity(e.activity))
  const { points } = SERIES[sport](digests, sport)
  if (points.length < 8) return null
  const runs = points.map((p) => ({ id: p.id, t: dayOfMs(p.startMs), x: p.x }))
  const firstWeek = weekOfMs(LIBRARY_END_MS - weeks * 7 * DAY_MS)
  const { records } = replay(runs, weekOfMs(points[0]!.startMs), weekOfMs(LIBRARY_END_MS) - 1)
  return records.filter((r) => r.state === 'slipping' && r.fresh).map((r) => r.w - firstWeek)
}
