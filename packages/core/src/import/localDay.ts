import { DAY_MS } from '../constants'
import { SYSTEM_TIME_LIMIT_S } from '../fit/protocol/profile'
import type { LocalDayShift } from '../types'

/**
 * The local calendar day of an activity relative to its UTC day: the offset the file gives, reduced to
 * -1, 0 or +1. The offset itself is read here and dropped; nothing keeps it. Any offset from -12:00 to
 * +14:00 gives one of the three, and that is all local days, weeks and months need.
 */

/** The offsets a file may give, in seconds east of UTC. Anything outside is a clock that is wrong. */
const MIN_OFFSET_S = -12 * 3600
const MAX_OFFSET_S = 14 * 3600
const QUARTER_HOUR_S = 900

/** An offset rounded to the quarter hour, or undefined when it is not a real zone. */
function acceptedOffsetS(offsetS: number): number | undefined {
  if (!Number.isFinite(offsetS)) return undefined
  const rounded = Math.round(offsetS / QUARTER_HOUR_S) * QUARTER_HOUR_S
  return rounded >= MIN_OFFSET_S && rounded <= MAX_OFFSET_S ? rounded : undefined
}

/**
 * The offset a FIT activity message gives: its local time less its time, both in seconds on the FIT epoch.
 * Either under the system-time limit is a counter since power-on, not a date, and gives none.
 */
export function fitOffsetS(timestampS?: number, localTimestampS?: number): number | undefined {
  if (timestampS === undefined || localTimestampS === undefined) return undefined
  if (timestampS < SYSTEM_TIME_LIMIT_S || localTimestampS < SYSTEM_TIME_LIMIT_S) return undefined
  return acceptedOffsetS(localTimestampS - timestampS)
}

/** An offset a GPX or TCX zone designator gave, if it is a real zone. */
export function designatorOffsetS(offsetS: number | undefined): number | undefined {
  return offsetS === undefined ? undefined : acceptedOffsetS(offsetS)
}

/** The local calendar date at `startMs` minus its UTC date, for a zone `offsetS` seconds east of UTC. */
export function localDayShift(startMs: number, offsetS: number): LocalDayShift {
  const shift = Math.floor((startMs + offsetS * 1000) / DAY_MS) - Math.floor(startMs / DAY_MS)
  return shift as LocalDayShift
}

/** The activity's field, or nothing when the file gave no usable offset. */
export function localDayFields(
  offsetS: number | undefined,
  startMs: number,
): { localDayShift?: LocalDayShift } {
  return offsetS === undefined ? {} : { localDayShift: localDayShift(startMs, offsetS) }
}
