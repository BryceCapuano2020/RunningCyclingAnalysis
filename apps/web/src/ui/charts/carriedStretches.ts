import type { CurvePoint } from '@rca/core/types'
import { effortLabel } from '../records'
import type { Point } from './chartTypes'

/**
 * Where a best-effort curve is carried rather than measured. The curve is a monotone envelope: a point
 * whose own windows were all below a longer effort's (or were dropped, as by the ceiling, or re-priced
 * as virtual power) takes the value of that longer window (`windowS` longer than its `durationS`). Between
 * two measured points, with only carried ones between them, the line is that longer effort's value copied
 * down, so it is drawn lighter and named for what it carries. A point without `windowS` (a curve made
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

/** The span covering the widest range of durations: the one stretch the chart labels, since a label says it once. */
export function widestSpan(
  spans: readonly CarriedSpan[],
  durationsS: readonly number[],
): CarriedSpan | null {
  const ratio = (span: CarriedSpan) => (durationsS[span.to] ?? 1) / (durationsS[span.from] ?? 1)
  return spans.reduce<CarriedSpan | null>(
    (best, span) => (best === null || ratio(span) > ratio(best) ? span : best),
    null,
  )
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

/**
 * What a carried stretch is, in words: "Between 20 and 60 min the line carries your 60 min best." The line
 * there is a longer effort's value copied down, which a longer window always contains, so it is described by
 * its shape and never as an effort missing from the file. `carriedFromS` is the length of the effort whose value
 * it carries, which the carried points name in `windowS`; it is the span's far end when they do not.
 */
export function spanLabel(fromS: number, toS: number, carriedFromS: number = toS): string {
  const [from, to, source] = [fromS, toS, carriedFromS].map(effortLabel) as [string, string, string]
  const minutes = /^(\d+) min$/
  const shared = minutes.exec(from)?.[1]
  const between = shared !== undefined && minutes.test(to) ? shared : from
  return `Between ${between} and ${to} the line carries your ${source} best.`
}

/** The short note on a carried row: "from your 60 min effort". */
export function carriedNote(fromS: number): string {
  return `from your ${effortLabel(fromS)} effort`
}
