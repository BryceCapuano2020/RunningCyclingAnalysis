import { HEADLINE_DURATION_S } from '@rca/core/constants'
import { formatDuration, formatWkg } from '@rca/core/units'
import { effortLabel } from '../records'
import { SPORT_FORMAT } from '../sports'
import { lineObstacles, markerObstacle } from './annotations'
import type { Annotation } from './annotations'
import { insideTickBoxes } from './directLabelFit'
import type { Box } from './chartBoxes'
import type { ChartSize } from './chartTypes'
import { wkgOf } from './curveTable'
import type { CurveRow, View } from './curveTable'
import { citedDurationS } from './sportCurveTakeaway'
import { isRecordDuration } from './sportCurveModel'
import type { Layout, ThresholdLine } from './sportCurveModel'
import { formatNative } from './sportAxis'
import { rootFontPx } from './rootFont'
import { NARROW_WIDTH } from './ticks'

/** The efforts a curve calls out with their value: the 5, 20 and 60 minute bests. */
export const CALLOUT_DURATIONS_S = [300, HEADLINE_DURATION_S, 3600]

/** A best this close to the threshold line, px, goes above it without a caption, clear of the threshold's label. */
export const NEAR_THRESHOLD_PX = 20
/**
 * How thick, px, the curve's own line is as an obstacle to text: wider than its 3 px stroke, so a callout's value sits
 * clear of the line it labels and does not crowd it where the line runs past the text's edge.
 */
export const LINE_CLEARANCE_PX = 16
/** The radius, px, of the boxes that keep text off a marker. */
const MARKER_OBSTACLE_R = 7

export interface CurveMarks {
  annotations: Annotation[]
  /** The line and its markers as boxes, so text keeps off the data. */
  obstacles: Box[]
  /** The y axis's labels where a phone sets them inside the plot: no text meets them. */
  ticks: Box[]
}

/** What the curve says outright: its bests with their values, its end and its threshold. */
export function curveMarks(
  rows: CurveRow[],
  m: Layout,
  view: View,
  size: ChartSize,
  threshold: ThresholdLine | null,
): CurveMarks {
  const { sport, units } = view
  const annotations: Annotation[] = []
  // A ride's callout gives its W/kg; a pace needs no caption, since the axis names it.
  const caption = (row: CurveRow) =>
    SPORT_FORMAT[sport].showsWkg ? formatWkg(wkgOf(row, view)) : undefined
  // The effort the title cites is marked too, when it is not one the curve calls out anyway: a 15 minute move in
  // the title needs the 15 minute point on the plot.
  const cited = citedDurationS({
    sport,
    units,
    rows,
    previousLabel: view.previous?.label ?? null,
    change: view.change,
  })
  const calloutDurations =
    cited === null || CALLOUT_DURATIONS_S.includes(cited)
      ? CALLOUT_DURATIONS_S
      : [...CALLOUT_DURATIONS_S, cited].sort((a, b) => a - b)
  const calloutIndexes = calloutDurations.flatMap((durationS) => {
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
      // The headline 20 minutes and the effort the title cites are always drawn; the others give way where a phone's plot has no room.
      optional: row.durationS !== HEADLINE_DURATION_S && row.durationS !== cited,
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
  const markers = m.points.flatMap((point, i) =>
    point !== null && isRecordDuration(sport, rows[i]?.durationS ?? NaN)
      ? [markerObstacle(point, MARKER_OBSTACLE_R)]
      : [],
  )
  // A phone sets its y tick labels inside the plot (see ChartYAxis), so text keeps off them too.
  const ticks = insideTickBoxes(m.yTicks, size.plot, rootFontPx())
  return {
    annotations,
    ticks,
    obstacles: [
      ...lineObstacles(m.points, LINE_CLEARANCE_PX),
      ...lineObstacles(m.earlier, 3),
      ...markers,
    ],
  }
}
