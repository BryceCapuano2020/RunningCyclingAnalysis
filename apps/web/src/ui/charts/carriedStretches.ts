import type { CurvePoint } from '@rca/core/types'
import { effortLabel } from '../records'
import type { Point } from './chartTypes'

/**
 * Where a best-effort curve is carried rather than measured. The curve is a monotone envelope: a point
 * whose own windows were all below a longer effort's (or were dropped, as by the ceiling, or re-priced
 * as virtual power) takes the value of that longer window (`windowS` longer than its `durationS`). Between
 * two measured points, with only carried ones between them, the line is that longer effort's value copied
 * down, so it is drawn lighter. A point without `windowS` (a curve made
 * without digests) is taken as measured.
 */

/** Whether the point's value is a longer effort's, copied down by the envelope. */
export function isCarried(point: Pick<CurvePoint, 'durationS' | 'value' | 'windowS'>): boolean {
  const window = point.windowS
  return Number.isFinite(point.value) && window != null && window > point.durationS
}

export interface CarriedSpan {
  /** Index of the measured point the stretch starts at, or of its first carried point at the curve's start. */
  from: number
  /** Index of the measured point it ends at, or of its last carried point at the curve's end. */
  to: number
}

/** The stretches of no effort: each maximal run of carried points, from the measured point before to the one after. */
export function carriedSpans(
  carried: readonly boolean[],
  present: readonly boolean[],
): CarriedSpan[] {
  const indexes = present.flatMap((here, i) => (here ? [i] : []))
  const spans: CarriedSpan[] = []
  let k = 0
  while (k < indexes.length) {
    if (!carried[indexes[k]!]) {
      k += 1
      continue
    }
    const start = k
    while (k < indexes.length && carried[indexes[k]!]) k += 1
    // The point before a run is measured, or the run starts the curve; the point after likewise ends it.
    spans.push({
      from: indexes[Math.max(start - 1, 0)]!,
      to: indexes[Math.min(k, indexes.length - 1)]!,
    })
  }
  return spans
}

/**
 * The line as two sets of points for linePath: the measured stretches and the carried ones. A step between
 * two points is carried when either end is.
 */
export function strokeSplit(
  points: ReadonlyArray<Point | null>,
  carried: readonly boolean[],
): { measured: (Point | null)[]; carried: (Point | null)[] } {
  const out = { measured: [] as (Point | null)[], carried: [] as (Point | null)[] }
  const last = { measured: null as Point | null, carried: null as Point | null }
  points.forEach((to, i) => {
    const from = points[i - 1]
    if (!to || !from) return
    const kind = carried[i - 1] || carried[i] ? 'carried' : 'measured'
    if (last[kind] !== from) out[kind].push(null, from)
    out[kind].push(to)
    last[kind] = to
  })
  return out
}

/** The short note on a carried row: "from your 60 min effort". */
export function carriedNote(fromS: number): string {
  return `from your ${effortLabel(fromS)} effort`
}
