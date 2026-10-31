import { DAY_MS } from '../constants'
import { orderedFor } from '../digest/consumers'
import { weekEndsSpan } from '../calendar'
import type { ActivityDigest } from '../types'
import { buildTables } from './tables'
import { zoneTablesOf } from './zoneTables'
import type { FindingInput, ZoneTables } from './types'

const WEEK_MS = 7 * DAY_MS

/**
 * What the library is made of; everything an evaluation needs besides the date. `setAside` is applied
 * as it is at every date a replay visits, so it should be the set as it stood then, or the replay sees
 * an activity set aside before it was. `zones` is cut at each date from its activities.
 */
export interface FindingSource {
  digests: ActivityDigest[]
  setAside: ReadonlySet<string>
  zones?: ZoneTables
}

/** The newest start among the digests of the current model, which is "now" for the data; 0 without any. */
export function latestStartMs(digests: ActivityDigest[]): number {
  return orderedFor('findings', digests).at(-1)?.startMs ?? 0
}

/** The zone tables as they stood at asOfMs: the activities up to it, and the weeks made from them. */
function zonesAt(zones: ZoneTables, asOfMs: number): ZoneTables {
  return zoneTablesOf(zones.activities.filter((a) => a.startMs <= asOfMs))
}

/**
 * The input to the detectors as of one date, taken from the library alone: the digests of the current
 * model up to that date, in canonical order, with the tables worked out once. The date is the newest
 * activity's when not given. Nothing in it depends on the order the digests arrive in, on the period the
 * app shows, or on the clock.
 */
export function inputAt(source: FindingSource, asOfMs?: number): FindingInput {
  const upTo = asOfMs ?? latestStartMs(source.digests)
  const digests = orderedFor('findings', source.digests).filter((d) => d.startMs <= upTo)
  return {
    digests,
    setAside: source.setAside,
    asOfMs: upTo,
    tables: buildTables(digests, source.setAside, upTo),
    zones: source.zones === undefined ? undefined : zonesAt(source.zones, upTo),
  }
}

/**
 * The weekly marks to evaluate at: the Sunday end of each week from the first activity's to the last's,
 * oldest first. `fromMs` and `toMs` narrow them to the weeks ending in that stretch.
 */
export function weeklyMarks(
  digests: ActivityDigest[],
  range: { fromMs?: number; toMs?: number } = {},
): number[] {
  const ordered = orderedFor('findings', digests)
  if (ordered.length === 0) return []
  const marks: number[] = []
  const span = weekEndsSpan(ordered)!
  for (let end = span.first; end <= span.last; end += WEEK_MS) {
    if (end >= (range.fromMs ?? -Infinity) && end <= (range.toMs ?? Infinity)) marks.push(end)
  }
  return marks
}
