import { HEADLINE_DURATION_S } from '@rca/core/constants'
import { formatDuration, formatWkg } from '@rca/core/units'
import { effortLabel } from '../records'
import { SPORT_FORMAT } from '../sports'
import { lineObstacles, markerObstacle } from './annotations'
import type { Annotation } from './annotations'
import { spanLabel, widestSpan } from './carriedStretches'
import type { Box } from './chartBoxes'
import type { ChartSize } from './chartTypes'
import { wkgOf } from './curveTable'
import type { CurveRow, View } from './curveTable'
import { isRecordDuration } from './sportCurveModel'
import type { Layout, ThresholdLine } from './sportCurveModel'
import { formatNative, nativeLabel } from './sportAxis'
import { NARROW_WIDTH } from './ticks'

/** The efforts a curve calls out with their value: the 5, 20 and 60 minute bests. */
export const CALLOUT_DURATIONS_S = [300, HEADLINE_DURATION_S, 3600]

/** A stretch narrower than this, px, is too short to bracket and label. */
const MIN_SPAN_LABEL_PX = 60
/** How far above the plot's floor the bracket sits, px. */
const BRACKET_LIFT = 10
/** A best this close to the threshold line, px, goes above it without a caption, clear of the threshold's label. */
export const NEAR_THRESHOLD_PX = 20
/** The radius, px, of the boxes that keep text off a marker. */
const MARKER_OBSTACLE_R = 7

export interface CurveMarks {
  annotations: Annotation[]
  /** The line and its markers as boxes, so text keeps off the data. */
  obstacles: Box[]
}

/** What the curve says outright: its bests with their values, its end, its threshold and its stretch with no effort. */
export function curveMarks(
  rows: CurveRow[],
  m: Layout,
  view: View,
  size: ChartSize,
  threshold: ThresholdLine | null,
): CurveMarks {
  const { sport, units } = view
  const annotations: Annotation[] = []
  const caption = (row: CurveRow) =>
    SPORT_FORMAT[sport].showsWkg ? formatWkg(wkgOf(row, view)) : nativeLabel(sport).toLowerCase()
  const calloutIndexes = CALLOUT_DURATIONS_S.flatMap((durationS) => {
    const index = rows.findIndex((row) => row.durationS === durationS)
    const row = rows[index]
    // A carried value is a longer effort's, so it is not this length's best and is not called out as one.
    return row !== undefined && Number.isFinite(row.value) && row.carried !== true ? [index] : []
  })
  const thresholdY = threshold === null ? null : m.yOf(threshold.value)
  for (const index of calloutIndexes) {
    const row = rows[index]
    const at = m.points[index]
    if (row === undefined || !at) continue
    const nearThreshold = thresholdY !== null && Math.abs(at.y - thresholdY) < NEAR_THRESHOLD_PX
    annotations.push({
      kind: 'callout',
      id: `best-${row.durationS}`,
      tone: sport,
      // The headline 20 minutes is always drawn; the others give way where a phone's plot has no room.
      optional: row.durationS !== HEADLINE_DURATION_S,
      at,
      value: formatNative(sport, row.value, units),
      label: effortLabel(row.durationS),
      // A phone's plot is too small for a second line under every value, and a best that sits on the threshold
      // line would put its caption on the threshold's label.
      caption: size.width < NARROW_WIDTH || nearThreshold ? undefined : caption(row),
      prefer: 'above',
    })
  }
  const lastIndex = rows.findLastIndex((row) => Number.isFinite(row.value))
  const last = rows[lastIndex]
  const lastAt = m.points[lastIndex]
  if (last !== undefined && lastAt && !calloutIndexes.includes(lastIndex)) {
    annotations.push({
      kind: 'end',
      id: 'end',
      optional: true,
      tone: sport,
      at: lastAt,
      text: formatNative(sport, last.value, units),
      sub: `at ${formatDuration(last.durationS)}`,
    })
  }
  if (threshold !== null) {
    annotations.push({
      kind: 'reference',
      id: 'threshold',
      y: m.yOf(threshold.value),
      label: threshold.estimated === true ? 'Threshold (estimated)' : 'Threshold',
      estimated: threshold.estimated,
      value: formatNative(sport, threshold.value, units),
      detail: threshold.detail,
      band:
        threshold.low !== undefined && threshold.high !== undefined
          ? {
              top: Math.min(m.yOf(threshold.low), m.yOf(threshold.high)),
              bottom: Math.max(m.yOf(threshold.low), m.yOf(threshold.high)),
            }
          : undefined,
    })
  }
  const widest = widestSpan(
    m.spans,
    rows.map((row) => row.durationS),
  )
  const fromRow = widest === null ? undefined : rows[widest.from]
  const toRow = widest === null ? undefined : rows[widest.to]
  const x1 = widest === null ? 0 : (m.xs[widest.from] ?? 0)
  const x2 = widest === null ? 0 : (m.xs[widest.to] ?? 0)
  if (fromRow && toRow && x2 - x1 >= MIN_SPAN_LABEL_PX) {
    annotations.push({
      kind: 'bracket',
      id: 'no-effort',
      x1,
      x2,
      y: size.plot.bottom - BRACKET_LIFT,
      label: noEffortLabel(rows, m.spans),
    })
  }
  const markers = m.points.flatMap((point, i) =>
    point !== null && isRecordDuration(sport, rows[i]?.durationS ?? NaN)
      ? [markerObstacle(point, MARKER_OBSTACLE_R)]
      : [],
  )
  return {
    annotations,
    obstacles: [...lineObstacles(m.points), ...lineObstacles(m.earlier, 3), ...markers],
  }
}

/** The one label for the stretch with no effort on file ("No effort of 20 to 60 min on file"), or an empty string with none. */
export function noEffortLabel(rows: readonly CurveRow[], spans: Layout['spans']): string {
  const widest = widestSpan(
    spans,
    rows.map((row) => row.durationS),
  )
  const from = widest === null ? undefined : rows[widest.from]
  const to = widest === null ? undefined : rows[widest.to]
  return from && to ? spanLabel(from.durationS, to.durationS) : ''
}
